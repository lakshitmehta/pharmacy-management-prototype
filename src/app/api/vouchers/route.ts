import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VoucherType } from "@prisma/client";
import { roundCurrency, voucherCreateSchema } from "@/domain/vouchers";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const type = url.searchParams.get("type") ?? "all";

  const vouchers = await prisma.voucher.findMany({
    where: {
      storeId: session.storeId,
      ...(type !== "all" ? { type: type as VoucherType } : {}),
      ...(search
        ? {
            OR: [
              { narration: { contains: search, mode: "insensitive" } },
              { lines: { some: { account: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      lines: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const formatted = vouchers.map((v) => {
    const totalAmount = roundCurrency(v.lines.reduce((s, l) => s + Number(l.debit), 0));
    const prefix = v.type === "PAYMENT" ? "PV" : v.type === "RECEIPT" ? "RV" : v.type === "JOURNAL" ? "JV" : "CV";
    const voucherRef = `${prefix}-${String(v.number).padStart(4, "0")}`;

    return {
      id: v.id,
      voucherRef,
      type: v.type,
      number: v.number,
      date: v.date.toISOString(),
      narration: v.narration,
      totalAmount,
      lines: v.lines.map((l) => ({
        id: l.id,
        account: l.account,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
      createdAt: v.createdAt.toISOString(),
    };
  });

  const totalVolume = roundCurrency(formatted.reduce((s, v) => s + v.totalAmount, 0));

  return NextResponse.json({
    vouchers: formatted,
    metrics: {
      totalVouchersCount: vouchers.length,
      totalVolume,
    },
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = voucherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid voucher data or unbalanced debits/credits" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const voucherResult = await prisma.$transaction(async (tx) => {
      // 1. Determine next sequential number for this store & voucher type
      const lastVoucher = await tx.voucher.findFirst({
        where: { storeId: session.storeId, type: input.type },
        orderBy: { number: "desc" },
      });
      const nextNumber = (lastVoucher?.number ?? 0) + 1;

      // 2. Create Voucher record
      const voucher = await tx.voucher.create({
        data: {
          storeId: session.storeId,
          type: input.type,
          number: nextNumber,
          date: input.date,
          narration: input.narration || null,
        },
      });

      // 3. Create VoucherLine records
      for (const line of input.lines) {
        await tx.voucherLine.create({
          data: {
            voucherId: voucher.id,
            account: line.account,
            debit: line.debit,
            credit: line.credit,
          },
        });
      }

      // 4. Record AuditEvent
      const totalAmount = roundCurrency(input.lines.reduce((s, l) => s + l.debit, 0));
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "voucher_posted",
          entity: "Voucher",
          entityId: voucher.id,
          metadata: {
            type: input.type,
            number: nextNumber,
            totalAmount,
            linesCount: input.lines.length,
          },
        },
      });

      const prefix = input.type === "PAYMENT" ? "PV" : input.type === "RECEIPT" ? "RV" : input.type === "JOURNAL" ? "JV" : "CV";
      const voucherRef = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

      return {
        voucher: {
          id: voucher.id,
          voucherRef,
          type: voucher.type,
          number: voucher.number,
          date: voucher.date.toISOString(),
          narration: voucher.narration,
          totalAmount,
          lines: input.lines,
          createdAt: voucher.createdAt.toISOString(),
        },
      };
    });

    return NextResponse.json(voucherResult, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to post voucher";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

