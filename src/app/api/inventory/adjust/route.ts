import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock, stockAdjustmentSchema } from "@/domain/inventory";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = stockAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const input = parsed.data;

  const batch = await prisma.medicineBatch.findFirst({
    where: { id: input.batchId, storeId: session.storeId },
    include: {
      movements: { select: { type: true, quantity: true } },
      medicine: true,
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found in your store" }, { status: 404 });
  }

  const currentStock = calculateBatchStock(batch.movements);
  const newStock = currentStock + input.quantityDelta;

  const result = await prisma.$transaction(async (tx) => {
    const movement = await tx.inventoryMovement.create({
      data: {
        storeId: session.storeId,
        batchId: batch.id,
        type: "ADJUSTMENT",
        quantity: input.quantityDelta,
        unitRate: input.unitRate !== undefined ? input.unitRate : batch.purchaseRate,
        reason: input.reason,
      },
    });

    await tx.auditEvent.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        action: "inventory_adjustment",
        entity: "MedicineBatch",
        entityId: batch.id,
        metadata: {
          medicineName: batch.medicine.name,
          batchNumber: batch.batchNumber,
          delta: input.quantityDelta,
          oldStock: currentStock,
          newStock,
          reason: input.reason,
        },
      },
    });

    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      medicineName: batch.medicine.name,
      previousStock: currentStock,
      currentStock: newStock,
      movementId: movement.id,
    };
  });

  return NextResponse.json({ adjustment: result }, { status: 201 });
}
