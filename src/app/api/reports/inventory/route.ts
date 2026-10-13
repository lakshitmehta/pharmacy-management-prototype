import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock } from "@/domain/inventory";
import { calculateFastSlowMoving, calculateStockValuation } from "@/domain/reports";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "valuation"; // "valuation" | "velocity" | "reorder"

  const batches = await prisma.medicineBatch.findMany({
    where: { storeId: session.storeId },
    include: {
      medicine: { select: { id: true, name: true, genericName: true, safetyLimit: true } },
      supplier: { select: { name: true } },
      movements: { select: { type: true, quantity: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const batchesWithStock = batches.map((b) => ({
    id: b.id,
    medicineId: b.medicineId,
    medicineName: b.medicine.name,
    genericName: b.medicine.genericName,
    safetyLimit: b.medicine.safetyLimit,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate.toISOString().split("T")[0],
    supplierName: b.supplier?.name || "Direct / Opening",
    stock: calculateBatchStock(b.movements),
    purchaseRate: Number(b.purchaseRate),
    mrp: Number(b.mrp),
  }));

  if (type === "valuation") {
    const valuation = calculateStockValuation(batchesWithStock);
    return NextResponse.json({
      type: "valuation",
      items: valuation.items,
      totals: valuation.totals,
      metrics: {
        totalBatches: valuation.items.length,
        inStockBatches: valuation.items.filter((i) => i.stock > 0).length,
        totalUnits: valuation.items.reduce((sum, i) => sum + i.stock, 0),
      },
    });
  }

  if (type === "velocity") {
    const medicines = await prisma.medicine.findMany({
      where: { storeId: session.storeId },
      select: { id: true, name: true },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSaleLines = await prisma.salesLine.findMany({
      where: {
        invoice: {
          storeId: session.storeId,
          status: "POSTED",
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      select: { medicineId: true, quantity: true },
    });

    const velocityList = calculateFastSlowMoving(medicines, recentSaleLines, 30);

    return NextResponse.json({
      type: "velocity",
      items: velocityList,
      metrics: {
        totalTracked: velocityList.length,
        fastCount: velocityList.filter((v) => v.classification === "FAST").length,
        normalCount: velocityList.filter((v) => v.classification === "NORMAL").length,
        slowCount: velocityList.filter((v) => v.classification === "SLOW").length,
      },
    });
  }

  // Reorder alerts
  const medStockMap = new Map<string, { medicineId: string; name: string; safetyLimit: number; currentStock: number }>();
  for (const b of batchesWithStock) {
    const existing = medStockMap.get(b.medicineId) || {
      medicineId: b.medicineId,
      name: b.medicineName,
      safetyLimit: b.safetyLimit,
      currentStock: 0,
    };
    existing.currentStock += b.stock;
    medStockMap.set(b.medicineId, existing);
  }

  const reorderAlerts = Array.from(medStockMap.values())
    .filter((m) => m.currentStock <= m.safetyLimit)
    .map((m) => ({
      medicineId: m.medicineId,
      name: m.name,
      safetyLimit: m.safetyLimit,
      currentStock: m.currentStock,
      deficit: Math.max(0, m.safetyLimit - m.currentStock),
      suggestedReorder: Math.max(20, m.safetyLimit * 2 - m.currentStock),
      status: m.currentStock <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
    }))
    .sort((a, b) => a.currentStock - b.currentStock);

  return NextResponse.json({
    type: "reorder",
    alerts: reorderAlerts,
    metrics: {
      totalAlerts: reorderAlerts.length,
      outOfStockCount: reorderAlerts.filter((a) => a.status === "OUT_OF_STOCK").length,
      lowStockCount: reorderAlerts.filter((a) => a.status === "LOW_STOCK").length,
    },
  });
}

