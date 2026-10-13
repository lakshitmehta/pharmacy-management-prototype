import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggregateGstr1, aggregateGstr2, calculateGstr3bSummary, aggregateHsnSummary } from "@/domain/reports";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
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

  // Fetch Sales for GSTR-1
  const salesInvoices = await prisma.salesInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    },
    include: {
      customer: { select: { name: true, phone: true, gstin: true } },
      lines: {
        include: {
          medicine: { select: { name: true, hsn: true, gstRate: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const formattedSaleInvoices = salesInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    createdAt: inv.createdAt,
    customerName: inv.customer?.name || null,
    customerPhone: inv.customer?.phone || null,
    customerGstin: inv.customer?.gstin || null,
    paymentMethod: inv.paymentMethod,
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    tax: Number(inv.tax),
    total: Number(inv.total),
    status: inv.status,
  }));

  const saleReportLines = salesInvoices.flatMap((inv) =>
    inv.lines.map((l) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.createdAt,
      customerName: inv.customer?.name || null,
      customerPhone: inv.customer?.phone || null,
      customerGstin: inv.customer?.gstin || null,
      paymentMethod: inv.paymentMethod,
      medicineName: l.medicine.name,
      batchNumber: l.batch.batchNumber,
      hsn: l.medicine.hsn,
      gstRate: Number(l.medicine.gstRate),
      quantity: l.quantity,
      unitRate: Number(l.unitRate),
      discount: Number(l.discount),
      tax: Number(l.tax),
      total: Number(l.total),
    }))
  );

  // Fetch Purchases for GSTR-2
  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
    },
    include: {
      supplier: { select: { name: true, gstin: true } },
      lines: {
        include: {
          medicine: { select: { name: true, hsn: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
    orderBy: { invoiceDate: "desc" },
  });

  const formattedPurchaseInvoices = purchaseInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    supplierId: inv.supplierId,
    supplierName: inv.supplier.name,
    supplierGstin: inv.supplier.gstin || null,
    subtotal: Number(inv.subtotal),
    tax: Number(inv.tax),
    total: Number(inv.total),
    reverseCharge: inv.reverseCharge,
    status: inv.status,
  }));

  const purchaseReportLines = purchaseInvoices.flatMap((inv) =>
    inv.lines.map((l) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      supplierName: inv.supplier.name,
      supplierGstin: inv.supplier.gstin || null,
      medicineName: l.medicine.name,
      batchNumber: l.batch.batchNumber,
      hsn: l.hsn,
      gstRate: Number(l.gstRate),
      quantity: l.quantity,
      freeQuantity: l.freeQuantity,
      unitRate: Number(l.unitRate),
      tax: Number(l.tax),
      total: Number(l.quantity * Number(l.unitRate) + Number(l.tax)),
      itcEligibility: l.itcEligibility,
    }))
  );

  const gstr1 = aggregateGstr1(formattedSaleInvoices, saleReportLines);
  const gstr2 = aggregateGstr2(formattedPurchaseInvoices, purchaseReportLines);
  const gstr3b = calculateGstr3bSummary(gstr1, gstr2);
  const hsnSummary = aggregateHsnSummary(saleReportLines);

  const storeSettings = await prisma.storeSettings.findUnique({
    where: { storeId: session.storeId },
    select: { gstin: true, gstScheme: true },
  });

  return NextResponse.json({
    storeGstin: storeSettings?.gstin || "Unregistered",
    gstScheme: storeSettings?.gstScheme || "REGULAR_MONTHLY",
    gstr1,
    gstr2,
    gstr3b,
    hsnSummary,
  });
}

