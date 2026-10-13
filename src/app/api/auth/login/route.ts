import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-schema";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { username: parsed.data.username, status: "ACTIVE" },
    include: { store: true },
  });

  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  try {
    await createSession(user.id, user.storeId);
  } catch (error) {
    if (error instanceof Error && error.message === "DEVICE_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "This account already has five active devices. Disconnect one before signing in here." },
        { status: 409 },
      );
    }
    throw error;
  }

  await prisma.auditEvent.create({
    data: {
      storeId: user.storeId,
      userId: user.id,
      action: "login",
      entity: "Session",
      metadata: { source: "credentials" },
    },
  });

  return NextResponse.json({ user: { displayName: user.displayName, username: user.username }, store: user.store });
}