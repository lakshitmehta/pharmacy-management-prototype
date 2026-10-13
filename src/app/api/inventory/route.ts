import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateBatchStock,
  calculateInventoryValuation,
  categorizeExpiry,
  checkStockHealth,
  medicineCreateSchema,
} from "@/domain/inventory";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const view = url.searchParams.get("view") ?? "all";
  const sort = url.searchParams.get("sort") ?? "name-asc";

  const allMedicines = await prisma.medicine.findMany({
    where: { storeId: session.storeId },
    include: {
      batches: {
        include: {
          movements: { select: { type: true, quantity: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { expiryDate: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Map each medicine with calculated stock, health, and batch info
  const items = allMedicines.map((medicine) => {
    const batches = medicine.batches.map((batch) => {
      const stock = calculateBatchStock(batch.movements);
      const expiryStatus = categorizeExpiry(batch.expiryDate, now);
      const isExpiring30Days = batch.expiryDate >= now && batch.expiryDate <= thirtyDaysFromNow;
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate.toISOString(),
        purchaseRate: Number(batch.purchaseRate),
        mrp: Number(batch.mrp),
        packSize: batch.packSize,
        freeQuantity: batch.freeQuantity,
        stock,
        expiryStatus,
        isExpiring30Days,
        supplier: batch.supplier ? { id: batch.supplier.id, name: batch.supplier.name } : null,
      };
    });

    const totalStock = batches.reduce((sum, b) => sum + b.stock, 0);
    const health = checkStockHealth(totalStock, medicine.safetyLimit);
    const hasExpiringBatch = batches.some((b) => b.isExpiring30Days);
    const hasNegativeBatch = totalStock < 0 || batches.some((b) => b.stock < 0);
    const isRecent = medicine.createdAt >= thirtyDaysAgo;

    // Minimum MRP and purchase rate among batches, or defaults
    const minMrp = batches.length > 0 ? Math.min(...batches.map((b) => b.mrp)) : 0;
    const maxMrp = batches.length > 0 ? Math.max(...batches.map((b) => b.mrp)) : 0;
    const minPurchaseRate = batches.length > 0 ? Math.min(...batches.map((b) => b.purchaseRate)) : 0;

    return {
      id: medicine.id,
      name: medicine.name,
      genericName: medicine.genericName,
      manufacturer: medicine.manufacturer,
      barcode: medicine.barcode,
      hsn: medicine.hsn,
      gstRate: Number(medicine.gstRate),
      safetyLimit: medicine.safetyLimit,
      createdAt: medicine.createdAt.toISOString(),
      totalStock,
      health,
      hasExpiringBatch,
      hasNegativeBatch,
      isRecent,
      minMrp,
      maxMrp,
      minPurchaseRate,
      batches,
    };
  });

  // Calculate store-wide summary metrics
  const allBatchesForValuation = items.flatMap((m) =>
    m.batches.map((b) => ({
      stock: b.stock,
      purchaseRate: b.purchaseRate,
      mrp: b.mrp,
    }))
  );
  const valuation = calculateInventoryValuation(allBatchesForValuation);

  const lowStockCount = items.filter((m) => m.health === "LOW").length;
  const negativeStockCount = items.filter((m) => m.hasNegativeBatch).length;
  const metrics = {
    stockValue: valuation.stockValue,
    mrpValue: valuation.mrpValue,
    totalSkus: items.length,
    totalUnits: valuation.totalUnits,
    lowStockCount,
    negativeStockCount,
  };

  // Filter based on search
  let filtered = items;
  if (search) {
    filtered = filtered.filter(
      (m) =>
        m.name.toLowerCase().includes(search) ||
        (m.genericName && m.genericName.toLowerCase().includes(search)) ||
        (m.manufacturer && m.manufacturer.toLowerCase().includes(search)) ||
        (m.barcode && m.barcode.toLowerCase().includes(search)) ||
        m.batches.some((b) => b.batchNumber.toLowerCase().includes(search))
    );
  }

  // Filter based on view
  if (view === "low-stock") {
    filtered = filtered.filter((m) => m.health === "LOW");
  } else if (view === "expiring") {
    filtered = filtered.filter((m) => m.hasExpiringBatch);
  } else if (view === "negative") {
    filtered = filtered.filter((m) => m.hasNegativeBatch);
  } else if (view === "recent") {
    filtered = filtered.filter((m) => m.isRecent);
  }

  // Sort
  filtered.sort((a, b) => {
    switch (sort) {
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "price-asc":
        return a.minMrp - b.minMrp;
      case "price-desc":
        return b.minMrp - a.minMrp;
      case "stock-asc":
        return a.totalStock - b.totalStock;
      case "stock-desc":
        return b.totalStock - a.totalStock;
      case "expiry-asc": {
        const aExp = a.batches[0]?.expiryDate ?? "9999-12-31";
        const bExp = b.batches[0]?.expiryDate ?? "9999-12-31";
        return aExp.localeCompare(bExp);
      }
      case "recent":
        return b.createdAt.localeCompare(a.createdAt);
      case "name-asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return NextResponse.json({ medicines: filtered, metrics });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = medicineCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const input = parsed.data;

  // Check unique barcode if specified
  if (input.barcode) {
    const existing = await prisma.medicine.findUnique({
      where: { storeId_barcode: { storeId: session.storeId, barcode: input.barcode } },
    });
    if (existing) {
      return NextResponse.json({ error: "A medicine with this barcode already exists in your store" }, { status: 409 });
    }
  }

  // Check if supplier exists if supplierId is provided in openingBatch
  if (input.openingBatch?.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.openingBatch.supplierId, storeId: session.storeId },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found in your store" }, { status: 400 });
    }
  }

  try {
    const createdMedicine = await prisma.$transaction(async (tx) => {
      const medicine = await tx.medicine.create({
        data: {
          storeId: session.storeId,
          name: input.name,
          genericName: input.genericName || null,
          manufacturer: input.manufacturer || null,
          barcode: input.barcode || null,
          hsn: input.hsn || null,
          gstRate: input.gstRate,
          safetyLimit: input.safetyLimit,
        },
      });

      if (input.openingBatch) {
        const batch = await tx.medicineBatch.create({
          data: {
            storeId: session.storeId,
            medicineId: medicine.id,
            supplierId: input.openingBatch.supplierId || null,
            batchNumber: input.openingBatch.batchNumber,
            expiryDate: input.openingBatch.expiryDate,
            purchaseRate: input.openingBatch.purchaseRate,
            mrp: input.openingBatch.mrp,
            packSize: input.openingBatch.packSize,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: batch.id,
            type: "OPENING",
            quantity: input.openingBatch.quantity,
            unitRate: input.openingBatch.purchaseRate,
            reason: "Opening stock on medicine registration",
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "medicine_created",
          entity: "Medicine",
          entityId: medicine.id,
          metadata: {
            name: medicine.name,
            hasOpeningBatch: Boolean(input.openingBatch),
          },
        },
      });

      return tx.medicine.findUniqueOrThrow({
        where: { id: medicine.id },
        include: {
          batches: {
            include: {
              movements: true,
              supplier: true,
            },
          },
        },
      });
    });

    return NextResponse.json({ medicine: createdMedicine }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create medicine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
