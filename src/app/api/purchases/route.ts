import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePurchaseTotals, purchaseInputSchema } from "@/domain/purchasing";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invoices = await prisma.purchaseInvoice.findMany({ where: { storeId: session.storeId }, include: { supplier: { select: { name: true } }, lines: { include: { medicine: { select: { name: true } }, batch: { select: { batchNumber: true, expiryDate: true } } } } }, orderBy: { invoiceDate: "desc" } });
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = purchaseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Purchase invoice details are invalid.", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const totals = calculatePurchaseTotals(input.lines);
  const invoice = await prisma.$transaction(async (transaction) => {
    const supplier = await transaction.supplier.findFirst({ where: { id: input.supplierId, storeId: session.storeId, active: true } });
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const medicines = await transaction.medicine.findMany({ where: { storeId: session.storeId, id: { in: input.lines.map((line) => line.medicineId) } } });
    if (medicines.length !== input.lines.length) throw new Error("MEDICINE_NOT_FOUND");
    const created = await transaction.purchaseInvoice.create({ data: { storeId: session.storeId, supplierId: supplier.id, invoiceNumber: input.invoiceNumber, invoiceDate: input.invoiceDate, reverseCharge: input.reverseCharge, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, lines: { create: [] } } });
    for (const line of input.lines) {
      const medicine = medicines.find((candidate) => candidate.id === line.medicineId)!;
      const batch = await transaction.medicineBatch.upsert({ where: { storeId_medicineId_batchNumber: { storeId: session.storeId, medicineId: line.medicineId, batchNumber: line.batchNumber } }, update: { expiryDate: line.expiryDate, purchaseRate: line.unitRate, mrp: line.mrp, supplierId: supplier.id, freeQuantity: { increment: line.freeQuantity } }, create: { storeId: session.storeId, medicineId: line.medicineId, supplierId: supplier.id, batchNumber: line.batchNumber, expiryDate: line.expiryDate, purchaseRate: line.unitRate, mrp: line.mrp, freeQuantity: line.freeQuantity } });
      await transaction.purchaseLine.create({ data: { invoiceId: created.id, medicineId: medicine.id, batchId: batch.id, quantity: line.quantity, freeQuantity: line.freeQuantity, unitRate: line.unitRate, mrp: line.mrp, tax: calculatePurchaseTotals([line]).tax, hsn: line.hsn || medicine.hsn, gstRate: line.gstRate, itcEligibility: line.itcEligibility } });
      await transaction.inventoryMovement.create({ data: { storeId: session.storeId, batchId: batch.id, type: "PURCHASE", quantity: line.quantity + line.freeQuantity, unitRate: line.unitRate, referenceId: created.id, reason: "Received purchase invoice" } });
    }
    await transaction.supplierLedgerEntry.create({ data: { storeId: session.storeId, supplierId: supplier.id, invoiceId: created.id, side: "DEBIT", amount: totals.total, description: `Purchase invoice ${input.invoiceNumber}` } });
    await transaction.auditEvent.create({ data: { storeId: session.storeId, userId: session.userId, action: "purchase_invoice_received", entity: "PurchaseInvoice", entityId: created.id, metadata: { inventoryDecision: "stock_posts_on_received_invoice" } } });
    return transaction.purchaseInvoice.findUniqueOrThrow({ where: { id: created.id }, include: { supplier: true, lines: { include: { medicine: true, batch: true } } } });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND") return null;
    if (error instanceof Error && error.message === "MEDICINE_NOT_FOUND") return null;
    throw error;
  });
  if (!invoice) return NextResponse.json({ error: "Supplier or medicine was not found in this store." }, { status: 404 });
  return NextResponse.json({ invoice }, { status: 201 });
}
