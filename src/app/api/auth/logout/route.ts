import { NextResponse } from "next/server";
import { getCurrentSession, revokeCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getCurrentSession();
  if (session) {
    await prisma.auditEvent.create({
      data: { storeId: session.storeId, userId: session.userId, action: "logout", entity: "Session", entityId: session.id },
    });
  }
  await revokeCurrentSession();
  return NextResponse.json({ ok: true });
}