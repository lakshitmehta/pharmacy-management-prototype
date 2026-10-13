import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock } from "@/domain/inventory";
import { calculateProfitAndLoss, roundCurrency } from "@/domain/reports";

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

  // 1. Sales & Sales Returns
  const sales = await prisma.salesInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    },
    select: { total: true },
  });
  const grossSales = roundCurrency(sales.reduce((s, inv) => s + Number(inv.total), 0));

  const returnMovements = await prisma.inventoryMovement.findMany({
    where: {
      storeId: session.storeId,
      type: "CUSTOMER_RETURN",
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    },
    select: { quantity: true, unitRate: true },
  });
  const salesReturns = roundCurrency(
    returnMovements.reduce((s, m) => s + m.quantity * Number(m.unitRate), 0)
  );

  // 2. Purchases & Supplier Returns
  const purchases = await prisma.purchaseInvoice.findMany({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      ...(Object.keys(dateFilter).length > 0 ? { invoiceDate: dateFilter } : {}),
    },
    select: { subtotal: true, total: true },
  });
  const purchasesCost = roundCurrency(purchases.reduce((s, p) => s + Number(p.subtotal), 0));

  const supplierReturnMovements = await prisma.inventoryMovement.findMany({
    where: {
      storeId: session.storeId,
      type: "SUPPLIER_RETURN",
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    },
    select: { quantity: true, unitRate: true },
  });
  const purchaseReturnsCost = roundCurrency(
    supplierReturnMovements.reduce((s, m) => s + m.quantity * Number(m.unitRate), 0)
  );

  // 3. Opening & Closing Stock Cost
  const allBatches = await prisma.medicineBatch.findMany({
    where: { storeId: session.storeId },
    include: { movements: { select: { type: true, quantity: true, createdAt: true } } },
  });

  let closingStockCost = 0;
  let openingStockCost = 0;

  for (const b of allBatches) {
    const rate = Number(b.purchaseRate);
    const currentStock = calculateBatchStock(b.movements);
    closingStockCost += Math.max(0, currentStock * rate);

    // Calculate stock before start date for opening stock
    if (dateFilter.gte) {
      const priorMovements = b.movements.filter((m) => m.createdAt < (dateFilter.gte as Date));
      const priorStock = calculateBatchStock(priorMovements);
      openingStockCost += Math.max(0, priorStock * rate);
    } else {
      // If no start date, opening stock is derived from OPENING movements
      const openingMovements = b.movements.filter((m) => m.type === "OPENING");
      const openQty = openingMovements.reduce((s, m) => s + m.quantity, 0);
      openingStockCost += Math.max(0, openQty * rate);
    }
  }

  closingStockCost = roundCurrency(closingStockCost);
  openingStockCost = roundCurrency(openingStockCost);

  // 4. Operating Expenses from Journal Vouchers
  const expenseVoucherLines = await prisma.voucherLine.findMany({
    where: {
      voucher: {
        storeId: session.storeId,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      account: {
        contains: "expense",
        mode: "insensitive",
      },
    },
    select: { debit: true, credit: true },
  });

  const operatingExpenses = roundCurrency(
    expenseVoucherLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)
  );

  const pl = calculateProfitAndLoss({
    grossSales,
    salesReturns,
    openingStockCost,
    purchasesCost,
    purchaseReturnsCost,
    closingStockCost,
    operatingExpenses,
  });

  // 5. Day Close Cash Summary (Today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayEntries = await prisma.cashEntry.findMany({
    where: {
      storeId: session.storeId,
      createdAt: { gte: today },
    },
    include: {
      cash: { select: { name: true, opening: true } },
      bank: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const cashInflows = roundCurrency(
    todayEntries.filter((e) => e.cashId && e.side === "DEBIT").reduce((s, e) => s + Number(e.amount), 0)
  );
  const cashOutflows = roundCurrency(
    todayEntries.filter((e) => e.cashId && e.side === "CREDIT").reduce((s, e) => s + Number(e.amount), 0)
  );

  const registers = await prisma.cashRegister.findMany({
    where: { storeId: session.storeId },
    select: { opening: true },
  });
  const totalOpeningCash = roundCurrency(registers.reduce((s, r) => s + Number(r.opening), 0));
  const expectedClosingCash = roundCurrency(totalOpeningCash + cashInflows - cashOutflows);

  return NextResponse.json({
    profitAndLoss: pl,
    dayCloseSummary: {
      date: new Date().toISOString().split("T")[0],
      totalOpeningCash,
      cashInflows,
      cashOutflows,
      expectedClosingCash,
      transactionsLogged: todayEntries.length,
    },
  });
}

