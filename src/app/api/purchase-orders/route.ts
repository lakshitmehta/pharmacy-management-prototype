import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { purchaseOrderInputSchema } from "@/domain/purchasing";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orders = await prisma.purchaseOrder.findMany({ where: { storeId: session.storeId }, include: { supplier: { select: { id: true, name: true } }, lines: { include: { medicine: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = purchaseOrderInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Purchase order details are invalid.", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, storeId: session.storeId, active: true } });
  if (!supplier) return NextResponse.json({ error: "Active supplier not found." }, { status: 404 });
  const medicines = await prisma.medicine.findMany({ where: { storeId: session.storeId, id: { in: input.lines.map((line) => line.medicineId) } }, select: { id: true } });
  if (medicines.length !== input.lines.length) return NextResponse.json({ error: "One or more medicines are not in this store." }, { status: 400 });
  const order = await prisma.$transaction(async (transaction) => {
    const count = await transaction.purchaseOrder.count({ where: { storeId: session.storeId } });
    const created = await transaction.purchaseOrder.create({ data: { storeId: session.storeId, supplierId: supplier.id, orderNumber: `PO-${String(count + 1).padStart(5, "0")}`, notes: input.notes || null, lines: { create: input.lines } }, include: { supplier: true, lines: true } });
    await transaction.auditEvent.create({ data: { storeId: session.storeId, userId: session.userId, action: "purchase_order_created", entity: "PurchaseOrder", entityId: created.id } });
    return created;
  });
  return NextResponse.json({ order }, { status: 201 });
}
