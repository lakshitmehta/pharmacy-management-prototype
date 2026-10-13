import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/domain/reports";
import { PaymentMethod } from "@prisma/client";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const subReport = url.searchParams.get("subReport") || "day-book";
  const startDateStr = url.searchParams.get("startDate");
  const endDateStr = url.searchParams.get("endDate");
  const paymentMethod = url.searchParams.get("paymentMethod") || "all";

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

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      ...(paymentMethod !== "all" ? { paymentMethod: paymentMethod as PaymentMethod } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, gstin: true } },
      lines: {
        include: {
          medicine: { select: { name: true, genericName: true, hsn: true, gstRate: true } },
          batch: { select: { batchNumber: true, expiryDate: true, purchaseRate: true, mrp: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalSales = roundCurrency(invoices.reduce((sum, inv) => sum + Number(inv.total), 0));
  const totalTaxable = roundCurrency(invoices.reduce((sum, inv) => sum + Number(inv.subtotal), 0));
  const totalTax = roundCurrency(invoices.reduce((sum, inv) => sum + Number(inv.tax), 0));
  const totalDiscount = roundCurrency(invoices.reduce((sum, inv) => sum + Number(inv.discount), 0));

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
        quantitySold: number;
        totalGross: number;
        totalDiscount: number;
        totalTax: number;
        totalRevenue: number;
      }
    >();

    for (const inv of invoices) {
      for (const line of inv.lines) {
        const key = `${line.medicineId}_${line.batchId}`;
        const existing = itemMap.get(key) || {
          medicineId: line.medicineId,
          medicineName: line.medicine.name,
          genericName: line.medicine.genericName,
          batchNumber: line.batch.batchNumber,
          hsn: line.medicine.hsn,
          gstRate: Number(line.medicine.gstRate),
          quantitySold: 0,
          totalGross: 0,
          totalDiscount: 0,
          totalTax: 0,
          totalRevenue: 0,
        };

        existing.quantitySold += line.quantity;
        existing.totalGross = roundCurrency(existing.totalGross + Number(line.unitRate) * line.quantity);
        existing.totalDiscount = roundCurrency(existing.totalDiscount + Number(line.discount));
        existing.totalTax = roundCurrency(existing.totalTax + Number(line.tax));
        existing.totalRevenue = roundCurrency(existing.totalRevenue + Number(line.total));
        itemMap.set(key, existing);
      }
    }

    const items = Array.from(itemMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

    return NextResponse.json({
      subReport,
      items,
      metrics: {
        totalSales,
        totalTaxable,
        totalTax,
        totalDiscount,
        totalItemsSold: items.reduce((sum, i) => sum + i.quantitySold, 0),
        uniqueSkus: items.length,
      },
    });
  }

  if (subReport === "party-wise") {
    const partyMap = new Map<
      string,
      {
        partyName: string;
        phone?: string | null;
        gstin?: string | null;
        invoiceCount: number;
        totalPurchases: number;
        cashTotal: number;
        creditTotal: number;
        upiTotal: number;
      }
    >();

    for (const inv of invoices) {
      const partyKey = inv.customerId || "WALK_IN";
      const partyName = inv.customer?.name || "Walk-in Cash Customer";
      const existing = partyMap.get(partyKey) || {
        partyName,
        phone: inv.customer?.phone || null,
        gstin: inv.customer?.gstin || null,
        invoiceCount: 0,
        totalPurchases: 0,
        cashTotal: 0,
        creditTotal: 0,
        upiTotal: 0,
      };

      const amt = Number(inv.total);
      existing.invoiceCount += 1;
      existing.totalPurchases = roundCurrency(existing.totalPurchases + amt);
      if (inv.paymentMethod === "CASH") existing.cashTotal = roundCurrency(existing.cashTotal + amt);
      else if (inv.paymentMethod === "CREDIT") existing.creditTotal = roundCurrency(existing.creditTotal + amt);
      else existing.upiTotal = roundCurrency(existing.upiTotal + amt);

      partyMap.set(partyKey, existing);
    }

    const parties = Array.from(partyMap.values()).sort((a, b) => b.totalPurchases - a.totalPurchases);

    return NextResponse.json({
      subReport,
      parties,
      metrics: {
        totalSales,
        totalParties: parties.length,
        totalInvoices: invoices.length,
      },
    });
  }

  if (subReport === "discount-analysis") {
    const discountedInvoices = invoices
      .filter((inv) => Number(inv.discount) > 0)
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt.toISOString().split("T")[0],
        partyName: inv.customer?.name || "Walk-in Customer",
        subtotal: Number(inv.subtotal),
        discount: Number(inv.discount),
        discountPercent:
          Number(inv.subtotal) > 0
            ? roundCurrency((Number(inv.discount) / Number(inv.subtotal)) * 100)
            : 0,
        total: Number(inv.total),
      }));

    return NextResponse.json({
      subReport,
      invoices: discountedInvoices,
      metrics: {
        totalDiscount,
        discountedBillsCount: discountedInvoices.length,
        averageDiscountPercent:
          discountedInvoices.length > 0
            ? roundCurrency(
                discountedInvoices.reduce((s, i) => s + i.discountPercent, 0) / discountedInvoices.length
              )
            : 0,
      },
    });
  }

  // Default: Day Book
  const dayBook = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.createdAt.toISOString().split("T")[0],
    time: inv.createdAt.toISOString().split("T")[1].slice(0, 5),
    partyName: inv.customer?.name || "Walk-in Customer",
    partyPhone: inv.customer?.phone || null,
    paymentMethod: inv.paymentMethod,
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    tax: Number(inv.tax),
    total: Number(inv.total),
  }));

  return NextResponse.json({
    subReport: "day-book",
    invoices: dayBook,
    metrics: {
      totalSales,
      totalTaxable,
      totalTax,
      totalDiscount,
      invoiceCount: invoices.length,
      cashSales: roundCurrency(
        invoices.filter((i) => i.paymentMethod === "CASH").reduce((s, i) => s + Number(i.total), 0)
      ),
      digitalSales: roundCurrency(
        invoices.filter((i) => i.paymentMethod === "UPI" || i.paymentMethod === "CARD").reduce((s, i) => s + Number(i.total), 0)
      ),
      creditSales: roundCurrency(
        invoices.filter((i) => i.paymentMethod === "CREDIT").reduce((s, i) => s + Number(i.total), 0)
      ),
    },
  });
}

