import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/domain/reports";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const subReport = url.searchParams.get("subReport") || "day-book";
  const startDateStr = url.searchParams.get("startDate");
  const endDateStr = url.searchParams.get("endDate");
  const supplierId = url.searchParams.get("supplierId") || "all";

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDateStr) {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    dateFilter.gte = start;
  }
  if (endDateStr) {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }

  const purchases = await prisma.purchaseInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
      ...(supplierId !== "all" ? { supplierId } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      lines: {
        include: {
          medicine: { select: { name: true, genericName: true, hsn: true, gstRate: true } },
          batch: { select: { batchNumber: true, expiryDate: true, purchaseRate: true, mrp: true } },
        },
      },
      paymentAllocations: true,
    },
    orderBy: { invoiceDate: "desc" },
  });

  const totalPurchases = roundCurrency(purchases.reduce((sum, p) => sum + Number(p.total), 0));
  const totalTaxable = roundCurrency(purchases.reduce((sum, p) => sum + Number(p.subtotal), 0));
  const totalTax = roundCurrency(purchases.reduce((sum, p) => sum + Number(p.tax), 0));

  if (subReport === "item-wise") {
    const itemMap = new Map<
      string,
      {
        medicineId: string;
        medicineName: string;
        genericName?: string | null;
        batchNumber: string;
        hsn?: string | null;
        gstRate: number;
        billedQty: number;
        freeQty: number;
        totalQty: number;
        avgRate: number;
        totalSpend: number;
      }
    >();

    for (const inv of purchases) {
      for (const line of inv.lines) {
        const key = `${line.medicineId}_${line.batchId}`;
        const existing = itemMap.get(key) || {
          medicineId: line.medicineId,
          medicineName: line.medicine.name,
          genericName: line.medicine.genericName,
          batchNumber: line.batch.batchNumber,
          hsn: line.hsn,
          gstRate: Number(line.gstRate),
          billedQty: 0,
          freeQty: 0,
          totalQty: 0,
          avgRate: 0,
          totalSpend: 0,
        };

        existing.billedQty += line.quantity;
        existing.freeQty += line.freeQuantity;
        existing.totalQty += line.quantity + line.freeQuantity;
        existing.totalSpend = roundCurrency(existing.totalSpend + Number(line.unitRate) * line.quantity + Number(line.tax));
        existing.avgRate = existing.billedQty > 0 ? roundCurrency(existing.totalSpend / existing.billedQty) : 0;
        itemMap.set(key, existing);
      }
    }

    const items = Array.from(itemMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);

    return NextResponse.json({
      subReport,
      items,
      metrics: {
        totalPurchases,
        totalTaxable,
        totalTax,
        uniqueMedicines: items.length,
        totalUnitsReceived: items.reduce((s, i) => s + i.totalQty, 0),
      },
    });
  }

  if (subReport === "party-wise" || subReport === "vendor-analytics") {
    const vendorMap = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        gstin?: string | null;
        phone?: string | null;
        invoiceCount: number;
        totalSpend: number;
        totalPaid: number;
        outstanding: number;
      }
    >();

    for (const inv of purchases) {
      const supId = inv.supplierId;
      const existing = vendorMap.get(supId) || {
        supplierId: supId,
        supplierName: inv.supplier.name,
        gstin: inv.supplier.gstin,
        phone: inv.supplier.phone,
        invoiceCount: 0,
        totalSpend: 0,
        totalPaid: 0,
        outstanding: 0,
      };

      const paid = inv.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
      const total = Number(inv.total);

      existing.invoiceCount += 1;
      existing.totalSpend = roundCurrency(existing.totalSpend + total);
      existing.totalPaid = roundCurrency(existing.totalPaid + paid);
      existing.outstanding = roundCurrency(Math.max(0, existing.totalSpend - existing.totalPaid));
      vendorMap.set(supId, existing);
    }

    const vendors = Array.from(vendorMap.values()).sort((a, b) => b.totalSpend - a.totalSpend);

    return NextResponse.json({
      subReport,
      vendors,
      metrics: {
        totalPurchases,
        activeVendors: vendors.length,
        totalPaid: roundCurrency(vendors.reduce((s, v) => s + v.totalPaid, 0)),
        totalOutstanding: roundCurrency(vendors.reduce((s, v) => s + v.outstanding, 0)),
      },
    });
  }

  // Default: Day Book
  const dayBook = purchases.map((inv) => {
    const paid = inv.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const total = Number(inv.total);
    const balance = roundCurrency(Math.max(0, total - paid));

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate.toISOString().split("T")[0],
      supplierName: inv.supplier.name,
      supplierGstin: inv.supplier.gstin || null,
      subtotal: Number(inv.subtotal),
      tax: Number(inv.tax),
      total,
      paid,
      balance,
      reverseCharge: inv.reverseCharge,
      linesCount: inv.lines.length,
    };
  });

  return NextResponse.json({
    subReport: "day-book",
    invoices: dayBook,
    metrics: {
      totalPurchases,
      totalTaxable,
      totalTax,
      invoiceCount: purchases.length,
      unpaidBillsCount: dayBook.filter((d) => d.balance > 0).length,
    },
  });
}

