import { NextResponse } from "next/server";
import { getCurrentSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUserSchema, hasPermission, roleDefaultPermissions, StandardRole } from "@/domain/rbac";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { storeId: session.storeId },
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      roles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const formatted = users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    status: u.status,
    createdAt: u.createdAt,
    role: u.roles[0]?.role?.name ?? "CASHIER",
    permissions: u.roles[0]?.role?.permissions ?? [],
  }));

  return NextResponse.json({ users: formatted });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Check unique username within store
  const existing = await prisma.user.findUnique({
    where: {
      storeId_username: {
        storeId: session.storeId,
        username: input.username,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Username '${input.username}' already exists in this pharmacy.` },
      { status: 409 }
    );
  }

  try {
    const passwordHash = await hashPassword(input.password);

    const newUser = await prisma.$transaction(async (tx) => {
      // Find or create role
      const role = await tx.role.upsert({
        where: { name: input.roleName },
        update: {},
        create: {
          name: input.roleName,
          permissions: roleDefaultPermissions[input.roleName as StandardRole] || [],
        },
      });

      // Create user
      const createdUser = await tx.user.create({
        data: {
          storeId: session.storeId,
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          status: "ACTIVE",
          roles: {
            create: { roleId: role.id },
          },
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          createdAt: true,
        },
      });

      // Audit log
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "USER_CREATE",
          entity: "User",
          entityId: createdUser.id,
          metadata: {
            username: input.username,
            displayName: input.displayName,
            role: input.roleName,
          },
        },
      });

      return {
        ...createdUser,
        role: input.roleName,
      };
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

