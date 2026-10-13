import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PaymentMethod } from "@prisma/client";
import {
  allocateSupplierPaymentFifo,
  calculateSupplierBalance,
  roundCurrency,
  supplierPaymentInputSchema,
} from "@/domain/payables";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const method = url.searchParams.get("method") ?? "all";

  const payments = await prisma.supplierPayment.findMany({
    where: {
      storeId: session.storeId,
      ...(search
        ? {
            OR: [
              { supplier: { name: { contains: search, mode: "insensitive" } } },
              { reference: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(method !== "all" ? { method: method as PaymentMethod } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      allocations: {
        include: {
          invoice: { select: { id: true, invoiceNumber: true, total: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totalDisbursed = roundCurrency(payments.reduce((sum, p) => sum + Number(p.amount), 0));

  const formatted = payments.map((p) => ({
    id: p.id,
    supplierId: p.supplier.id,
    supplierName: p.supplier.name,
    supplierPhone: p.supplier.phone,
    amount: Number(p.amount),
    method: p.method,
    reference: p.reference,
    createdAt: p.createdAt.toISOString(),
    allocationsCount: p.allocations.length,
    allocations: p.allocations.map((a) => ({
      invoiceNumber: a.invoice.invoiceNumber,
      amount: Number(a.amount),
    })),
  }));

  return NextResponse.json({
    payments: formatted,
    metrics: {
      totalPaymentsCount: payments.length,
      totalDisbursed,
    },
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = supplierPaymentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid supplier payment details" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const paymentResult = await prisma.$transaction(async (tx) => {
      // 1. Verify supplier
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, storeId: session.storeId },
        include: {
          ledger: { select: { side: true, amount: true } },
          purchases: {
            where: { status: "POSTED" },
            include: { paymentAllocations: true },
            orderBy: { invoiceDate: "asc" }, // Oldest first for FIFO
          },
        },
      });

      if (!supplier) throw new Error("Supplier not found.");

      const currentBalance = calculateSupplierBalance(
        supplier.ledger.map((e) => ({ side: e.side, amount: Number(e.amount) }))
      );

      // 2. Fetch open purchase invoices for FIFO allocation
      const openInvoices = supplier.purchases
        .map((p) => {
          const total = Number(p.total);
          const paid = p.paymentAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
          const outstanding = roundCurrency(total - paid);
          return {
            id: p.id,
            invoiceNumber: p.invoiceNumber,
            total,
            paid,
            outstanding: Math.max(0, outstanding),
            invoiceDate: p.invoiceDate,
          };
        })
        .filter((inv) => inv.outstanding > 0.01);

      // 3. Compute FIFO allocations
      const fifoAllocations = allocateSupplierPaymentFifo(input.amount, openInvoices);

      // 4. Create SupplierPayment
      const payment = await tx.supplierPayment.create({
        data: {
          storeId: session.storeId,
          supplierId: supplier.id,
          amount: input.amount,
          method: input.method,
          reference: input.reference || null,
        },
      });

      // 5. Create PaymentAllocation records
      for (const alloc of fifoAllocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          },
        });
      }

      // 6. Create SupplierLedgerEntry (CREDIT reduces supplier debt)
      const desc = input.reference
        ? `Supplier payment via ${input.method} (Ref: ${input.reference})`
        : `Supplier payment disbursed via ${input.method}`;

      await tx.supplierLedgerEntry.create({
        data: {
          storeId: session.storeId,
          supplierId: supplier.id,
          paymentId: payment.id,
          side: "CREDIT",
          amount: input.amount,
          description: desc,
        },
      });

      // 7. Post CashEntry (outflow from bank account or cash register)
      let bankAccountId = input.bankAccountId;
      let cashRegisterId = input.cashRegisterId;

      if (!bankAccountId && !cashRegisterId) {
        if (input.method === "CASH") {
          const defaultCash = await tx.cashRegister.findFirst({ where: { storeId: session.storeId } });
          cashRegisterId = defaultCash?.id;
        } else {
          const defaultBank = await tx.bankAccount.findFirst({ where: { storeId: session.storeId } });
          bankAccountId = defaultBank?.id;
        }
      }

      if (bankAccountId || cashRegisterId) {
        await tx.cashEntry.create({
          data: {
            storeId: session.storeId,
            bankId: bankAccountId || null,
            cashId: cashRegisterId || null,
            side: "CREDIT", // Outflow
            amount: input.amount,
            description: `Payment to ${supplier.name} (${input.method})`,
            referenceId: payment.id,
          },
        });
      }

      // 8. Record AuditEvent
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "supplier_payment_disbursed",
          entity: "SupplierPayment",
          entityId: payment.id,
          metadata: {
            supplierName: supplier.name,
            amount: input.amount,
            method: input.method,
            allocationsCount: fifoAllocations.length,
          },
        },
      });

      const newBalance = roundCurrency(Math.max(0, currentBalance - input.amount));

      return {
        payment: {
          id: payment.id,
          voucherNumber: `PAY-${payment.id.slice(0, 8).toUpperCase()}`,
          supplierName: supplier.name,
          supplierPhone: supplier.phone,
          amount: Number(payment.amount),
          method: payment.method,
          reference: payment.reference,
          createdAt: payment.createdAt.toISOString(),
          previousBalance: currentBalance,
          newBalance,
          allocations: fifoAllocations.map((a) => {
            const matchedInv = openInvoices.find((inv) => inv.id === a.invoiceId);
            return {
              invoiceId: a.invoiceId,
              invoiceNumber: matchedInv?.invoiceNumber ?? "Unknown",
              allocatedAmount: a.amount,
            };
          }),
        },
      };
    });

    return NextResponse.json(paymentResult, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record supplier payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

