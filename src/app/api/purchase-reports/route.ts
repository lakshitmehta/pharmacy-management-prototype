import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/domain/reports";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const supplierId = url.searchParams.get("supplierId") || "all";
  const startDateStr = url.searchParams.get("startDate");
  const endDateStr = url.searchParams.get("endDate");

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
        },
      },
      paymentAllocations: true,
    },
    orderBy: { invoiceDate: "desc" },
  });

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: session.storeId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Calculate monthly summary
  const monthlyMap = new Map<string, { month: string; invoiceCount: number; totalSpend: number; totalTax: number }>();
  for (const inv of purchases) {
    const monthKey = inv.invoiceDate.toISOString().slice(0, 7); // YYYY-MM
    const existing = monthlyMap.get(monthKey) || {
      month: monthKey,
      invoiceCount: 0,
      totalSpend: 0,
      totalTax: 0,
    };
    existing.invoiceCount += 1;
    existing.totalSpend = roundCurrency(existing.totalSpend + Number(inv.total));
    existing.totalTax = roundCurrency(existing.totalTax + Number(inv.tax));
    monthlyMap.set(monthKey, existing);
  }

  const monthlyTrends = Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month));

  // Vendor distribution
  const vendorMap = new Map<string, { supplierId: string; supplierName: string; count: number; spend: number; outstanding: number }>();
  for (const inv of purchases) {
    const sId = inv.supplierId;
    const existing = vendorMap.get(sId) || {
      supplierId: sId,
      supplierName: inv.supplier.name,
      count: 0,
      spend: 0,
      outstanding: 0,
    };
    const paid = inv.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const total = Number(inv.total);
    existing.count += 1;
    existing.spend = roundCurrency(existing.spend + total);
    existing.outstanding = roundCurrency(existing.outstanding + Math.max(0, total - paid));
    vendorMap.set(sId, existing);
  }

  const vendorDistribution = Array.from(vendorMap.values()).sort((a, b) => b.spend - a.spend);

  const totalProcurement = roundCurrency(purchases.reduce((sum, p) => sum + Number(p.total), 0));
  const totalTax = roundCurrency(purchases.reduce((sum, p) => sum + Number(p.tax), 0));
  const totalOutstanding = roundCurrency(vendorDistribution.reduce((sum, v) => sum + v.outstanding, 0));

  return NextResponse.json({
    purchases: purchases.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate.toISOString().split("T")[0],
      supplierName: p.supplier.name,
      subtotal: Number(p.subtotal),
      tax: Number(p.tax),
      total: Number(p.total),
      linesCount: p.lines.length,
    })),
    monthlyTrends,
    vendorDistribution,
    suppliers,
    metrics: {
      totalProcurement,
      totalTax,
      totalOutstanding,
      invoiceCount: purchases.length,
      activeSuppliersCount: vendorDistribution.length,
    },
  });
}

