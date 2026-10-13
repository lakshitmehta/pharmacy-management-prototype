import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "connected";
  let dbLatencyMs = 0;
  let overallStatus = "ok";

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (err: unknown) {
    dbStatus = "disconnected";
    overallStatus = "degraded";
    console.error("Health check database query failed:", err);
  }

  const memory = process.memoryUsage();
  const rssMb = Math.round((memory.rss / (1024 * 1024)) * 100) / 100;

  const payload = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    version: "0.1.0",
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    system: {
      memoryRssMb: rssMb,
      nodeVersion: process.version,
    },
    totalResponseTimeMs: Date.now() - startTime,
  };

  const statusCode = overallStatus === "ok" ? 200 : 503;
  return NextResponse.json(payload, { status: statusCode });
}

