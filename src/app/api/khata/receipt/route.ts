import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  allocateReceiptFifo,
  calculateCustomerBalance,
  khataReceiptSchema,
  roundCurrency,
} from "@/domain/customers";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = khataReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid receipt data" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const receiptResult = await prisma.$transaction(async (tx) => {
      // 1. Verify customer
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, storeId: session.storeId },
        include: {
          ledger: { select: { side: true, amount: true } },
          sales: {
            where: { paymentMethod: "CREDIT", status: "POSTED" },
            include: { receiptAllocations: true },
            orderBy: { createdAt: "asc" }, // Oldest first for FIFO
          },
        },
      });

      if (!customer) {
        throw new Error("Customer not found.");
      }

      // Compute current balance
      const currentBalance = calculateCustomerBalance(
        customer.ledger.map((e) => ({ side: e.side, amount: Number(e.amount) }))
      );

      // Build open invoices for FIFO allocation
      const openInvoices = customer.sales
        .map((s) => {
          const total = Number(s.total);
          const paid = s.receiptAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
          const outstanding = roundCurrency(total - paid);
          return {
            id: s.id,
            invoiceNumber: s.invoiceNumber,
            total,
            paid,
            outstanding: Math.max(0, outstanding),
            createdAt: s.createdAt,
          };
        })
        .filter((inv) => inv.outstanding > 0.01);

      // 2. Compute FIFO allocations
      const fifoAllocations = allocateReceiptFifo(input.amount, openInvoices);

      // 3. Create CustomerReceipt record
      const receipt = await tx.customerReceipt.create({
        data: {
          storeId: session.storeId,
          customerId: customer.id,
          amount: input.amount,
          method: input.method,
          reference: input.reference || null,
        },
      });

      // 4. Create ReceiptAllocation records
      for (const alloc of fifoAllocations) {
        await tx.receiptAllocation.create({
          data: {
            receiptId: receipt.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          },
        });
      }

      // 5. Create CustomerLedgerEntry (CREDIT reduces customer debt)
      const desc = input.reference
        ? `Customer payment via ${input.method} (Ref: ${input.reference})`
        : `Customer payment received via ${input.method}`;

      await tx.customerLedgerEntry.create({
        data: {
          storeId: session.storeId,
          customerId: customer.id,
          receiptId: receipt.id,
          side: "CREDIT",
          amount: input.amount,
          description: desc,
        },
      });

      // 6. Record AuditEvent
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "customer_receipt_recorded",
          entity: "CustomerReceipt",
          entityId: receipt.id,
          metadata: {
            customerName: customer.name,
            phone: customer.phone,
            amount: input.amount,
            method: input.method,
            allocatedInvoicesCount: fifoAllocations.length,
          },
        },
      });

      const newBalance = roundCurrency(Math.max(0, currentBalance - input.amount));

      return {
        receipt: {
          id: receipt.id,
          amount: Number(receipt.amount),
          method: receipt.method,
          reference: receipt.reference,
          createdAt: receipt.createdAt.toISOString(),
          customerName: customer.name,
          customerPhone: customer.phone,
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

    return NextResponse.json(receiptResult, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record customer receipt";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

