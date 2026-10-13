import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock } from "@/domain/inventory";
import { supplierNoteInputSchema } from "@/domain/payables";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch supplier ledger entries that are notes / adjustments
  const notes = await prisma.supplierLedgerEntry.findMany({
    where: {
      storeId: session.storeId,
      invoiceId: null,
      paymentId: null,
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const formatted = notes.map((n) => ({
    id: n.id,
    supplierId: n.supplier.id,
    supplierName: n.supplier.name,
    side: n.side,
    amount: Number(n.amount),
    description: n.description,
    createdAt: n.createdAt.toISOString(),
  }));

  return NextResponse.json({ notes: formatted });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = supplierNoteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid supplier note details" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, storeId: session.storeId },
      });
      if (!supplier) throw new Error("Supplier not found.");

      // If item return is included, validate stock and deduct inventory
      if (input.batchId && input.returnQuantity && input.returnQuantity > 0) {
        const batch = await tx.medicineBatch.findFirst({
          where: { id: input.batchId, storeId: session.storeId },
          include: {
            movements: { select: { type: true, quantity: true } },
            medicine: { select: { name: true } },
          },
        });

        if (!batch) throw new Error("Medicine batch not found.");

        const currentStock = calculateBatchStock(batch.movements);
        if (input.returnQuantity > currentStock) {
          throw new Error(
            `Insufficient stock for return to supplier. Available: ${currentStock}, requested return: ${input.returnQuantity}.`
          );
        }

        // Outbound movement for supplier return
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: batch.id,
            type: "SUPPLIER_RETURN",
            quantity: input.returnQuantity,
            unitRate: batch.purchaseRate,
            reason: `Supplier Return: ${input.reason}`,
          },
        });
      }

      // Credit Note reduces store debt (CREDIT side in supplier ledger)
      // Debit Note increases store debt (DEBIT side in supplier ledger)
      const side = input.type === "CREDIT_NOTE" ? "CREDIT" : "DEBIT";
      const desc = `${input.type === "CREDIT_NOTE" ? "Supplier Credit Note" : "Supplier Debit Note"}: ${input.reason}${input.reference ? ` (Ref: ${input.reference})` : ""}`;

      const ledgerEntry = await tx.supplierLedgerEntry.create({
        data: {
          storeId: session.storeId,
          supplierId: supplier.id,
          side,
          amount: input.amount,
          description: desc,
        },
      });

      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "supplier_note_recorded",
          entity: "SupplierLedgerEntry",
          entityId: ledgerEntry.id,
          metadata: {
            supplierName: supplier.name,
            type: input.type,
            amount: input.amount,
            returnQuantity: input.returnQuantity || null,
          },
        },
      });

      return {
        id: ledgerEntry.id,
        supplierName: supplier.name,
        type: input.type,
        amount: Number(ledgerEntry.amount),
        description: ledgerEntry.description,
        createdAt: ledgerEntry.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ note: result }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record supplier note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

