import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSupplierBalance, categorizePayableAging, roundCurrency } from "@/domain/payables";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const agingFilter = url.searchParams.get("aging") ?? "all";

  // Fetch all suppliers for this store with their ledger and purchase invoices
  const suppliers = await prisma.supplier.findMany({
    where: {
      storeId: session.storeId,
      active: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { contactName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      ledger: {
        select: { side: true, amount: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      purchases: {
        where: { status: "POSTED" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          total: true,
          paymentAllocations: { select: { amount: true } },
        },
        orderBy: { invoiceDate: "asc" },
      },
      payments: {
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const now = new Date();

  // Map suppliers with calculated balance, aging, and open bills
  const payables = suppliers.map((s) => {
    const ledgerEntries = s.ledger.map((e) => ({
      side: e.side,
      amount: Number(e.amount),
    }));
    const balance = calculateSupplierBalance(ledgerEntries);

    // Compute unpaid purchase invoices
    const unpaidInvoices = s.purchases.filter((p) => {
      const paid = p.paymentAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
      return Number(p.total) - paid > 0.01;
    });

    const oldestDate = unpaidInvoices[0]?.invoiceDate ?? (s.ledger[0]?.createdAt || now);
    const agingBucket = balance > 0 ? categorizePayableAging(oldestDate, now) : "CURRENT_0_30";
    const lastPaymentDate = s.payments[0]?.createdAt ? s.payments[0].createdAt.toISOString() : null;

    return {
      id: s.id,
      name: s.name,
      code: s.code,
      contactName: s.contactName,
      phone: s.phone,
      gstin: s.gstin,
      balance,
      unpaidInvoicesCount: unpaidInvoices.length,
      oldestInvoiceDate: oldestDate instanceof Date ? oldestDate.toISOString() : oldestDate,
      agingBucket,
      lastPaymentDate,
    };
  });

  // Filter debtors if aging specified
  const filteredPayables = agingFilter === "all" ? payables : payables.filter((p) => p.agingBucket === agingFilter);

  // Store-wide metrics
  const totalPayables = roundCurrency(payables.reduce((sum, p) => sum + p.balance, 0));
  const activePayablesCount = payables.filter((p) => p.balance > 0).length;
  const criticalCount = payables.filter((p) => p.balance > 0 && p.agingBucket === "CRITICAL_60_PLUS").length;
  const overdueCount = payables.filter((p) => p.balance > 0 && p.agingBucket === "OVERDUE_31_60").length;

  const allPayments = await prisma.supplierPayment.findMany({
    where: { storeId: session.storeId },
    select: { amount: true, createdAt: true },
  });

  const totalPaidToSuppliers = roundCurrency(allPayments.reduce((sum, p) => sum + Number(p.amount), 0));

  const metrics = {
    totalPayables,
    activePayablesCount,
    criticalCount,
    overdueCount,
    totalPaidToSuppliers,
  };

  return NextResponse.json({
    payables: filteredPayables,
    metrics,
  });
}

