import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateAccountBalance,
  contraTransferSchema,
  manualCashEntrySchema,
  roundCurrency,
} from "@/domain/banking";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Auto-provision default accounts if none exist
  const existingBanks = await prisma.bankAccount.findMany({ where: { storeId: session.storeId } });
  if (existingBanks.length === 0) {
    await prisma.bankAccount.create({
      data: {
        storeId: session.storeId,
        name: "Primary Pharmacy Current A/C",
        opening: 10000,
      },
    });
  }

  const existingCash = await prisma.cashRegister.findMany({ where: { storeId: session.storeId } });
  if (existingCash.length === 0) {
    await prisma.cashRegister.create({
      data: {
        storeId: session.storeId,
        name: "Main Counter Cash Drawer",
        opening: 5000,
      },
    });
  }

  // 2. Fetch bank accounts and cash registers with entries
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { storeId: session.storeId },
    include: {
      entries: { select: { side: true, amount: true } },
    },
    orderBy: { name: "asc" },
  });

  const cashRegisters = await prisma.cashRegister.findMany({
    where: { storeId: session.storeId },
    include: {
      entries: { select: { side: true, amount: true } },
    },
    orderBy: { name: "asc" },
  });

  const formattedBanks = bankAccounts.map((b) => {
    const balance = calculateAccountBalance(
      Number(b.opening),
      b.entries.map((e) => ({ side: e.side, amount: Number(e.amount) }))
    );
    return {
      id: b.id,
      name: b.name,
      opening: Number(b.opening),
      balance,
      entriesCount: b.entries.length,
    };
  });

  const formattedCash = cashRegisters.map((c) => {
    const balance = calculateAccountBalance(
      Number(c.opening),
      c.entries.map((e) => ({ side: e.side, amount: Number(e.amount) }))
    );
    return {
      id: c.id,
      name: c.name,
      opening: Number(c.opening),
      balance,
      entriesCount: c.entries.length,
    };
  });

  // 3. Fetch recent CashEntry transactions
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const accountFilter = url.searchParams.get("account") ?? "all";

  const entries = await prisma.cashEntry.findMany({
    where: {
      storeId: session.storeId,
      ...(accountFilter !== "all"
        ? {
            OR: [{ bankId: accountFilter }, { cashId: accountFilter }],
          }
        : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: "insensitive" } },
              { referenceId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      bank: { select: { name: true } },
      cash: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const todayEntries = entries.filter((e) => e.createdAt >= todayStart);
  const todayInflow = roundCurrency(
    todayEntries.filter((e) => e.side === "DEBIT").reduce((s, e) => s + Number(e.amount), 0)
  );
  const todayOutflow = roundCurrency(
    todayEntries.filter((e) => e.side === "CREDIT").reduce((s, e) => s + Number(e.amount), 0)
  );

  const totalBankBalance = roundCurrency(formattedBanks.reduce((s, b) => s + b.balance, 0));
  const totalCashBalance = roundCurrency(formattedCash.reduce((s, c) => s + c.balance, 0));
  const netTotalFunds = roundCurrency(totalBankBalance + totalCashBalance);

  const formattedEntries = entries.map((e) => ({
    id: e.id,
    accountName: e.bank?.name ?? e.cash?.name ?? "General Account",
    accountType: e.bankId ? "BANK" : "CASH",
    side: e.side,
    amount: Number(e.amount),
    description: e.description,
    referenceId: e.referenceId,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({
    bankAccounts: formattedBanks,
    cashRegisters: formattedCash,
    entries: formattedEntries,
    metrics: {
      totalBankBalance,
      totalCashBalance,
      netTotalFunds,
      todayInflow,
      todayOutflow,
    },
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);

  // Check if contra transfer
  if (body?.transferType) {
    const parsedContra = contraTransferSchema.safeParse(body);
    if (!parsedContra.success) {
      return NextResponse.json(
        { error: parsedContra.error.issues[0]?.message ?? "Invalid contra transfer" },
        { status: 400 }
      );
    }
    const input = parsedContra.data;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const bank = await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, storeId: session.storeId } });
        const cash = await tx.cashRegister.findFirst({ where: { id: input.cashRegisterId, storeId: session.storeId } });
        if (!bank || !cash) throw new Error("Bank account or Cash register not found.");

        const ref = input.reference || `CONTRA-${Date.now().toString().slice(-6)}`;

        if (input.transferType === "CASH_TO_BANK") {
          // Cash outflow (credit)
          await tx.cashEntry.create({
            data: {
              storeId: session.storeId,
              cashId: cash.id,
              side: "CREDIT",
              amount: input.amount,
              description: input.description || `Deposit to ${bank.name}`,
              referenceId: ref,
            },
          });
          // Bank inflow (debit)
          await tx.cashEntry.create({
            data: {
              storeId: session.storeId,
              bankId: bank.id,
              side: "DEBIT",
              amount: input.amount,
              description: input.description || `Deposit from ${cash.name}`,
              referenceId: ref,
            },
          });
        } else {
          // Bank outflow (credit)
          await tx.cashEntry.create({
            data: {
              storeId: session.storeId,
              bankId: bank.id,
              side: "CREDIT",
              amount: input.amount,
              description: input.description || `Withdrawal to ${cash.name}`,
              referenceId: ref,
            },
          });
          // Cash inflow (debit)
          await tx.cashEntry.create({
            data: {
              storeId: session.storeId,
              cashId: cash.id,
              side: "DEBIT",
              amount: input.amount,
              description: input.description || `Withdrawal from ${bank.name}`,
              referenceId: ref,
            },
          });
        }

        await tx.auditEvent.create({
          data: {
            storeId: session.storeId,
            userId: session.userId,
            action: "contra_transfer_posted",
            entity: "CashEntry",
            metadata: {
              transferType: input.transferType,
              amount: input.amount,
              bankName: bank.name,
              cashName: cash.name,
            },
          },
        });

        return { success: true, reference: ref, amount: input.amount };
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Contra transfer failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Manual inflow/outflow entry
  const parsedManual = manualCashEntrySchema.safeParse(body);
  if (!parsedManual.success) {
    return NextResponse.json(
      { error: parsedManual.error.issues[0]?.message ?? "Invalid cash entry" },
      { status: 400 }
    );
  }

  const input = parsedManual.data;
  const side = input.type === "INFLOW" ? "DEBIT" : "CREDIT";

  try {
    const entry = await prisma.cashEntry.create({
      data: {
        storeId: session.storeId,
        bankId: input.targetType === "BANK" ? input.accountId : null,
        cashId: input.targetType === "CASH" ? input.accountId : null,
        side,
        amount: input.amount,
        description: input.description,
        referenceId: input.referenceId || null,
      },
    });

    await prisma.auditEvent.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        action: "manual_cash_entry_posted",
        entity: "CashEntry",
        entityId: entry.id,
        metadata: {
          targetType: input.targetType,
          side,
          amount: input.amount,
          description: input.description,
        },
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to record cash entry";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

