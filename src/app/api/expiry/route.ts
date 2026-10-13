import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock, categorizeExpiry, roundCurrency } from "@/domain/inventory";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const filter = url.searchParams.get("filter") ?? "all";
  const supplierId = url.searchParams.get("supplierId") ?? "";

  const [batches, suppliers] = await Promise.all([
    prisma.medicineBatch.findMany({
      where: { storeId: session.storeId },
      include: {
        medicine: true,
        supplier: { select: { id: true, name: true, phone: true } },
        movements: { select: { type: true, quantity: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.supplier.findMany({
      where: { storeId: session.storeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  const mappedBatches = batches.map((batch) => {
    const stock = calculateBatchStock(batch.movements);
    const expiryStatus = categorizeExpiry(batch.expiryDate, now);
    const purchaseRate = Number(batch.purchaseRate);
    const mrp = Number(batch.mrp);
    const totalCostValue = roundCurrency(Math.max(0, stock) * purchaseRate);
    const totalMrpValue = roundCurrency(Math.max(0, stock) * mrp);

    const expTime = new Date(batch.expiryDate).getTime();
    const refTime = now.getTime();
    const daysUntilExpiry = Math.floor((expTime - refTime) / (1000 * 60 * 60 * 24));

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate.toISOString(),
      daysUntilExpiry,
      expiryStatus,
      stock,
      purchaseRate,
      mrp,
      totalCostValue,
      totalMrpValue,
      medicine: {
        id: batch.medicine.id,
        name: batch.medicine.name,
        genericName: batch.medicine.genericName,
        manufacturer: batch.medicine.manufacturer,
        barcode: batch.medicine.barcode,
      },
      supplier: batch.supplier ? { id: batch.supplier.id, name: batch.supplier.name, phone: batch.supplier.phone } : null,
    };
  });

  // Calculate high-level exposure metrics across all batches with positive stock
  let expiredValue = 0;
  let expiredCount = 0;
  let nearExpiryValue = 0;
  let nearExpiryCount = 0;
  let healthyValue = 0;
  let healthyCount = 0;

  for (const b of mappedBatches) {
    if (b.expiryStatus === "EXPIRED") {
      expiredValue += b.totalCostValue;
      expiredCount++;
    } else if (b.expiryStatus === "NEAR_EXPIRY") {
      nearExpiryValue += b.totalCostValue;
      nearExpiryCount++;
    } else {
      healthyValue += b.totalCostValue;
      healthyCount++;
    }
  }

  const totalStockUnits = mappedBatches.reduce((sum, b) => sum + Math.max(0, b.stock), 0);
  const totalLedgerCost = roundCurrency(expiredValue + nearExpiryValue + healthyValue);

  const metrics = {
    expiredValue: roundCurrency(expiredValue),
    expiredCount,
    nearExpiryValue: roundCurrency(nearExpiryValue),
    nearExpiryCount,
    healthyValue: roundCurrency(healthyValue),
    healthyCount,
    totalBatches: mappedBatches.length,
    totalStockUnits,
    totalLedgerCost,
  };

  // Filter
  let filtered = mappedBatches;

  if (filter === "expired") {
    filtered = filtered.filter((b) => b.expiryStatus === "EXPIRED");
  } else if (filter === "near-expiry") {
    filtered = filtered.filter((b) => b.expiryStatus === "NEAR_EXPIRY");
  } else if (filter === "healthy") {
    filtered = filtered.filter((b) => b.expiryStatus === "HEALTHY");
  }

  if (supplierId) {
    filtered = filtered.filter((b) => b.supplier?.id === supplierId);
  }

  if (search) {
    filtered = filtered.filter(
      (b) =>
        b.medicine.name.toLowerCase().includes(search) ||
        (b.medicine.genericName && b.medicine.genericName.toLowerCase().includes(search)) ||
        (b.medicine.manufacturer && b.medicine.manufacturer.toLowerCase().includes(search)) ||
        b.batchNumber.toLowerCase().includes(search) ||
        (b.supplier && b.supplier.name.toLowerCase().includes(search))
    );
  }

  return NextResponse.json({ batches: filtered, metrics, suppliers });
}
