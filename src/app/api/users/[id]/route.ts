import { NextResponse } from "next/server";
import { getCurrentSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateUserSchema, hasPermission, roleDefaultPermissions, StandardRole } from "@/domain/rbac";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, storeId: session.storeId },
    include: { roles: { include: { role: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found in this pharmacy" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Protect against self-deactivation by owner
  if (targetUserId === session.userId && input.status === "INACTIVE") {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updateData: {
        displayName?: string;
        status?: "ACTIVE" | "INACTIVE";
        passwordHash?: string;
      } = {};

      if (input.displayName) updateData.displayName = input.displayName;
      if (input.status) updateData.status = input.status;
      if (input.password && input.password.trim().length >= 8) {
        updateData.passwordHash = await hashPassword(input.password);
      }

      const user = await tx.user.update({
        where: { id: targetUserId },
        data: updateData,
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          updatedAt: true,
        },
      });

      // Role update
      let assignedRoleName = targetUser.roles[0]?.role.name;
      if (input.roleName && input.roleName !== assignedRoleName) {
        const role = await tx.role.upsert({
          where: { name: input.roleName },
          update: {},
          create: {
            name: input.roleName,
            permissions: roleDefaultPermissions[input.roleName as StandardRole] || [],
          },
        });

        await tx.userRole.deleteMany({ where: { userId: targetUserId } });
        await tx.userRole.create({ data: { userId: targetUserId, roleId: role.id } });
        assignedRoleName = input.roleName;
      }

      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "USER_UPDATE",
          entity: "User",
          entityId: targetUserId,
          metadata: {
            targetUsername: targetUser.username,
            updatedFields: Object.keys(input),
            newRole: assignedRoleName,
            newStatus: input.status,
          },
        },
      });

      return {
        ...user,
        role: assignedRoleName,
      };
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

