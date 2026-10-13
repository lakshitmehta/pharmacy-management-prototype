import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categorizeKhataAging, calculateCustomerBalance } from "@/domain/customers";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const agingFilter = url.searchParams.get("aging") ?? "all";

  // Fetch customers with their ledger and sales invoices
  const customers = await prisma.customer.findMany({
    where: {
      storeId: session.storeId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
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
      sales: {
        where: { paymentMethod: "CREDIT", status: "POSTED" },
        select: { id: true, total: true, createdAt: true, receiptAllocations: { select: { amount: true } } },
        orderBy: { createdAt: "asc" },
      },
      receipts: {
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Map each customer with calculated balance and aging
  const debtors = customers
    .map((c) => {
      const ledgerEntries = c.ledger.map((e) => ({
        side: e.side,
        amount: Number(e.amount),
      }));
      const balance = calculateCustomerBalance(ledgerEntries);

      // Find oldest unpaid invoice
      const unpaidInvoices = c.sales.filter((sale) => {
        const allocated = sale.receiptAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
        return Number(sale.total) - allocated > 0.01;
      });

      const oldestDate = unpaidInvoices[0]?.createdAt ?? (c.ledger[0]?.createdAt || now);
      const agingBucket = balance > 0 ? categorizeKhataAging(oldestDate, now) : "CURRENT_0_30";
      const lastPaymentDate = c.receipts[0]?.createdAt ? c.receipts[0].createdAt.toISOString() : null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance,
        unpaidInvoicesCount: unpaidInvoices.length,
        oldestDate: oldestDate instanceof Date ? oldestDate.toISOString() : oldestDate,
        agingBucket,
        lastPaymentDate,
      };
    })
    .filter((d) => d.balance > 0);

  // Filter by aging if requested
  const filteredDebtors = agingFilter === "all" ? debtors : debtors.filter((d) => d.agingBucket === agingFilter);

  // Store-wide metrics
  const totalOutstanding = Math.round(debtors.reduce((sum, d) => sum + d.balance, 0) * 100) / 100;
  const highRiskCount = debtors.filter((d) => d.agingBucket === "HIGH_RISK_60_PLUS").length;
  const overdueCount = debtors.filter((d) => d.agingBucket === "OVERDUE_31_60").length;

  const allReceipts = await prisma.customerReceipt.findMany({
    where: { storeId: session.storeId },
    select: { amount: true, createdAt: true },
  });

  const totalReceiptsCollected = Math.round(
    allReceipts.reduce((sum, r) => sum + Number(r.amount), 0) * 100
  ) / 100;

  const todayReceiptsCollected = Math.round(
    allReceipts
      .filter((r) => r.createdAt >= todayStart)
      .reduce((sum, r) => sum + Number(r.amount), 0) * 100
  ) / 100;

  const metrics = {
    totalOutstanding,
    creditCustomersCount: debtors.length,
    highRiskCount,
    overdueCount,
    totalReceiptsCollected,
    todayReceiptsCollected,
  };

  return NextResponse.json({
    debtors: filteredDebtors,
    metrics,
  });
}

