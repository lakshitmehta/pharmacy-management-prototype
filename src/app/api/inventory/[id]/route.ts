import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { medicineUpdateSchema } from "@/domain/inventory";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const medicine = await prisma.medicine.findFirst({
    where: { id, storeId: session.storeId },
  });
  if (!medicine) {
    return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = medicineUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const input = parsed.data;

  if (input.barcode && input.barcode !== medicine.barcode) {
    const existing = await prisma.medicine.findUnique({
      where: { storeId_barcode: { storeId: session.storeId, barcode: input.barcode } },
    });
    if (existing) {
      return NextResponse.json({ error: "Another medicine with this barcode already exists in your store" }, { status: 409 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const med = await tx.medicine.update({
      where: { id: medicine.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.genericName !== undefined ? { genericName: input.genericName || null } : {}),
        ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer || null } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode || null } : {}),
        ...(input.hsn !== undefined ? { hsn: input.hsn || null } : {}),
        ...(input.gstRate !== undefined ? { gstRate: input.gstRate } : {}),
        ...(input.safetyLimit !== undefined ? { safetyLimit: input.safetyLimit } : {}),
      },
    });

    await tx.auditEvent.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        action: "medicine_updated",
        entity: "Medicine",
        entityId: med.id,
        metadata: { changes: input },
      },
    });

    return med;
  });

  return NextResponse.json({ medicine: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const medicine = await prisma.medicine.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      batches: {
        include: {
          movements: true,
          saleLines: true,
          purchaseLines: true,
        },
      },
      saleLines: true,
      purchaseLines: true,
      purchaseOrderLines: true,
    },
  });

  if (!medicine) {
    return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
  }

  const hasMovements = medicine.batches.some((b) => b.movements.length > 0);
  const hasTransactions =
    medicine.saleLines.length > 0 ||
    medicine.purchaseLines.length > 0 ||
    medicine.purchaseOrderLines.length > 0 ||
    hasMovements;

  if (hasTransactions) {
    return NextResponse.json(
      {
        error: "Cannot delete a medicine with transaction or inventory history. You can adjust its stock instead.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete any empty batches first
    await tx.medicineBatch.deleteMany({ where: { medicineId: medicine.id } });
    await tx.medicine.delete({ where: { id: medicine.id } });
    await tx.auditEvent.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        action: "medicine_deleted",
        entity: "Medicine",
        entityId: medicine.id,
        metadata: { name: medicine.name },
      },
    });
  });

  return NextResponse.json({ success: true });
}
