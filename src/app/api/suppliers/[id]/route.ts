import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supplierInputSchema } from "@/domain/purchasing";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = supplierInputSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Supplier details are invalid.", issues: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.supplier.findFirst({ where: { id, storeId: session.storeId } });
  if (!existing) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data });
  await prisma.auditEvent.create({ data: { storeId: session.storeId, userId: session.userId, action: "supplier_updated", entity: "Supplier", entityId: supplier.id } });
  return NextResponse.json({ supplier });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.supplier.findFirst({ where: { id, storeId: session.storeId }, include: { _count: { select: { purchases: true, batches: true, purchaseOrders: true } } } });
  if (!existing) return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  if (existing._count.purchases || existing._count.batches || existing._count.purchaseOrders) return NextResponse.json({ error: "Supplier has transaction history and cannot be deleted. Mark it inactive instead." }, { status: 409 });
  await prisma.supplier.delete({ where: { id } });
  await prisma.auditEvent.create({ data: { storeId: session.storeId, userId: session.userId, action: "supplier_deleted", entity: "Supplier", entityId: id } });
  return NextResponse.json({ ok: true });
}
