import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  const medicines = await prisma.medicine.findMany({
    where: { storeId: session.storeId, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { genericName: { contains: search, mode: "insensitive" } }, { barcode: { contains: search, mode: "insensitive" } }] } : {}) },
    select: { id: true, name: true, genericName: true, barcode: true, hsn: true, gstRate: true },
    orderBy: { name: "asc" },
    take: 30,
  });
  return NextResponse.json({ medicines });
}
