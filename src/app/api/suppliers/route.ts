import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supplierInputSchema } from "@/domain/purchasing";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status");
  const suppliers = await prisma.supplier.findMany({
    where: {
      storeId: session.storeId,
      ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { gstin: { contains: search, mode: "insensitive" } }] } : {}),
    },
    include: { ledger: { select: { side: true, amount: true } }, _count: { select: { purchases: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ suppliers: suppliers.map(({ ledger, ...supplier }) => ({
    ...supplier,
    balance: ledger.reduce((balance, entry) => balance + (entry.side === "DEBIT" ? Number(entry.amount) : -Number(entry.amount)), 0),
    purchaseCount: supplier._count.purchases,
  })) });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = supplierInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Supplier details are invalid.", issues: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const supplier = await prisma.supplier.create({ data: { ...data, storeId: session.storeId } });
  await prisma.auditEvent.create({ data: { storeId: session.storeId, userId: session.userId, action: "supplier_created", entity: "Supplier", entityId: supplier.id } });
  return NextResponse.json({ supplier }, { status: 201 });
}
