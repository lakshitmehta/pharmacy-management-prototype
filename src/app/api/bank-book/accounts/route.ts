import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createBankAccountSchema, createCashRegisterSchema } from "@/domain/banking";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { storeId: session.storeId },
    orderBy: { name: "asc" },
  });

  const cashRegisters = await prisma.cashRegister.findMany({
    where: { storeId: session.storeId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ bankAccounts, cashRegisters });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const accountType = body?.type; // "BANK" or "CASH"

  if (accountType === "BANK") {
    const parsed = createBankAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid bank account details" },
        { status: 400 }
      );
    }
    const bank = await prisma.bankAccount.create({
      data: {
        storeId: session.storeId,
        name: parsed.data.name,
        opening: parsed.data.opening,
      },
    });
    return NextResponse.json({ account: bank, type: "BANK" }, { status: 201 });
  } else if (accountType === "CASH") {
    const parsed = createCashRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid cash register details" },
        { status: 400 }
      );
    }
    const cash = await prisma.cashRegister.create({
      data: {
        storeId: session.storeId,
        name: parsed.data.name,
        opening: parsed.data.opening,
      },
    });
    return NextResponse.json({ account: cash, type: "CASH" }, { status: 201 });
  }

  return NextResponse.json({ error: "Specify account type: 'BANK' or 'CASH'." }, { status: 400 });
}

