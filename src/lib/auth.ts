import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { canOpenDevice } from "@/domain/sessions";

const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "pillbills_session";
const sessionTtlDays = Number(process.env.SESSION_TTL_DAYS ?? "30");

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, storeId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlDays * 86400000);
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "unknown-browser";
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown-ip";
  const signature = createHash("sha256").update(`${userAgent}|${ipAddress}`).digest("hex");

  await prisma.$transaction(async (transaction) => {
    const existingDevice = await transaction.deviceSession.findFirst({
      where: { userId, signature, revokedAt: null },
    });

    if (existingDevice) {
      await transaction.deviceSession.update({
        where: { id: existingDevice.id },
        data: { lastSeenAt: new Date(), userAgent, ipAddress },
      });
    } else {
      const activeDeviceCount = await transaction.deviceSession.count({
        where: { userId, revokedAt: null },
      });
      if (!canOpenDevice(activeDeviceCount, false)) {
        throw new Error("DEVICE_LIMIT_REACHED");
      }
      await transaction.deviceSession.create({
        data: { storeId, userId, signature, userAgent, ipAddress },
      });
    }

    await transaction.session.create({
      data: { tokenHash: hashToken(token), userId, storeId, expiresAt },
    });
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return prisma.session.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: { roles: { include: { role: true } } } }, store: true },
  });
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await prisma.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
  }
  cookieStore.delete(sessionCookieName);
}
