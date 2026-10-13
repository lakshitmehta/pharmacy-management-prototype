import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditActions, auditFilterSchema } from "@/domain/audit";
import { hasPermission } from "@/domain/rbac";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings") && !hasPermission(userRoles, "audit")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = auditFilterSchema.safeParse({
    action: url.searchParams.get("action") || undefined,
    entity: url.searchParams.get("entity") || undefined,
    userId: url.searchParams.get("userId") || undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    limit: url.searchParams.get("limit") || undefined,
    offset: url.searchParams.get("offset") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const filters = parsed.data;

  const where: {
    storeId: string;
    action?: string;
    entity?: string;
    userId?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = {
    storeId: session.storeId,
  };

  if (filters.action) where.action = filters.action;
  if (filters.entity) where.entity = filters.entity;
  if (filters.userId) where.userId = filters.userId;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  try {
    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    const formatted = events.map((e) => ({
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      user: e.user ? { username: e.user.username, displayName: e.user.displayName } : null,
    }));

    return NextResponse.json({
      events: formatted,
      total,
      limit: filters.limit,
      offset: filters.offset,
      availableActions: auditActions,
    });
  } catch (error) {
    console.error("Failed to query audit trail:", error);
    return NextResponse.json({ error: "Failed to load audit trail" }, { status: 500 });
  }
}

