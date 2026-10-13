import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { voidInvoiceSchema } from "@/domain/sales";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = voidInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "A valid cancellation reason is required." },
      { status: 400 }
    );
  }

  const { reason } = parsed.data;

  try {
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id, storeId: session.storeId },
        include: {
          lines: true,
          customer: true,
        },
      });

      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      if (invoice.status === "VOIDED") {
        throw new Error("This invoice is already voided.");
      }

      // 1. Update invoice status to VOIDED
      const updated = await tx.salesInvoice.update({
        where: { id },
        data: { status: "VOIDED" },
      });

      // 2. Restore stock by appending compensating CUSTOMER_RETURN movements
      for (const line of invoice.lines) {
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: line.batchId,
            type: "CUSTOMER_RETURN",
            quantity: line.quantity, // Positive quantity adds stock back in calculateBatchStock
            unitRate: line.unitRate,
            referenceId: invoice.id,
            reason: `Invoice ${invoice.invoiceNumber} voided: ${reason}`,
          },
        });
      }

      // 3. Compensate customer ledger if credit was extended
      if (invoice.customerId && invoice.paymentMethod === "CREDIT") {
        await tx.customerLedgerEntry.create({
          data: {
            storeId: session.storeId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            side: "CREDIT",
            amount: invoice.total,
            description: `Reversal for voided invoice ${invoice.invoiceNumber}`,
          },
        });
      }

      // 4. Record audit event
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "sales_invoice_voided",
          entity: "SalesInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            reason,
            restoredLineCount: invoice.lines.length,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: `Invoice ${updatedInvoice.invoiceNumber} has been voided and inventory was restored.`,
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        status: updatedInvoice.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to void invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

