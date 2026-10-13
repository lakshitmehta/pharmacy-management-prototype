import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock, categorizeExpiry } from "@/domain/inventory";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const includeZeroStock = url.searchParams.get("includeZero") === "true";

  const now = new Date();

  // Search by medicine name, generic name, barcode, or batch number
  const medicines = await prisma.medicine.findMany({
    where: {
      storeId: session.storeId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { genericName: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search, mode: "insensitive" } },
              {
                batches: {
                  some: {
                    batchNumber: { contains: search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      batches: {
        include: {
          movements: { select: { type: true, quantity: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { expiryDate: "asc" }, // FEFO: First Expiry, First Out
      },
    },
    orderBy: { name: "asc" },
    take: 30,
  });

  const formatted = medicines
    .map((med) => {
      const batches = med.batches
        .map((batch) => {
          const stock = calculateBatchStock(batch.movements);
          const expiryStatus = categorizeExpiry(batch.expiryDate, now);
          return {
            id: batch.id,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate.toISOString(),
            purchaseRate: Number(batch.purchaseRate),
            mrp: Number(batch.mrp),
            packSize: batch.packSize,
            stock,
            expiryStatus,
            isExpired: expiryStatus === "EXPIRED",
            supplierName: batch.supplier?.name ?? null,
          };
        })
        .filter((b) => (includeZeroStock ? true : b.stock > 0));

      const totalStock = batches.reduce((sum, b) => sum + b.stock, 0);

      return {
        id: med.id,
        name: med.name,
        genericName: med.genericName,
        manufacturer: med.manufacturer,
        barcode: med.barcode,
        hsn: med.hsn,
        gstRate: Number(med.gstRate),
        safetyLimit: med.safetyLimit,
        totalStock,
        batches,
      };
    })
    .filter((med) => (includeZeroStock ? true : med.batches.length > 0 || !search));

  return NextResponse.json({ medicines: formatted });
}

