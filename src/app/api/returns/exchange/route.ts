import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock } from "@/domain/inventory";
import {
  calculateExchangeDifferential,
  calculateReturnLineRefund,
  calculateReturnTotals,
  salesExchangeInputSchema,
  validateReturnQuantity,
} from "@/domain/returns";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = salesExchangeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid exchange request" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const exchangeResult = await prisma.$transaction(async (tx) => {
      // 1. Fetch original invoice
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: input.invoiceId, storeId: session.storeId },
        include: {
          customer: true,
          lines: {
            include: {
              medicine: true,
              batch: true,
            },
          },
        },
      });

      if (!invoice) throw new Error("Sales invoice not found.");
      if (invoice.status === "VOIDED") throw new Error("Cannot exchange items from a voided invoice.");

      // 2. Validate return lines & compute return refund
      const previousReturns = await tx.inventoryMovement.findMany({
        where: {
          storeId: session.storeId,
          referenceId: invoice.id,
          type: "CUSTOMER_RETURN",
        },
      });

      const calculatedReturnLines = [];

      for (const lineReq of input.returnLines) {
        const origLine = invoice.lines.find((l) => l.id === lineReq.salesLineId);
        if (!origLine) throw new Error(`Line ${lineReq.salesLineId} not found on invoice.`);

        const alreadyReturned = previousReturns
          .filter((m) => m.batchId === origLine.batchId)
          .reduce((sum, m) => sum + m.quantity, 0);

        const validation = validateReturnQuantity(
          origLine.quantity,
          alreadyReturned,
          lineReq.quantity
        );

        if (!validation.valid) throw new Error(validation.error);

        const calculated = calculateReturnLineRefund(
          {
            id: origLine.id,
            quantity: origLine.quantity,
            unitRate: Number(origLine.unitRate),
            discount: Number(origLine.discount),
            tax: Number(origLine.tax),
            total: Number(origLine.total),
          },
          lineReq.quantity
        );

        calculatedReturnLines.push({
          ...calculated,
          medicineName: origLine.medicine.name,
          batchNumber: origLine.batch.batchNumber,
          batchId: origLine.batchId,
          reason: lineReq.reason,
        });

        // Append CUSTOMER_RETURN movement to restore stock
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: origLine.batchId,
            type: "CUSTOMER_RETURN",
            quantity: lineReq.quantity,
            unitRate: origLine.unitRate,
            referenceId: invoice.id,
            reason: `Exchange return on ${invoice.invoiceNumber}: ${lineReq.reason}`,
          },
        });
      }

      const returnTotals = calculateReturnTotals(calculatedReturnLines);

      // 3. Validate replacement items and stock
      const replacementBatchIds = input.replacementLines.map((l) => l.batchId);
      const replacementBatches = await tx.medicineBatch.findMany({
        where: {
          id: { in: replacementBatchIds },
          storeId: session.storeId,
        },
        include: {
          medicine: true,
          movements: { select: { type: true, quantity: true } },
        },
      });

      if (replacementBatches.length !== input.replacementLines.length) {
        throw new Error("One or more replacement medicine batches were not found.");
      }

      let replacementTotal = 0;
      const calculatedReplacementLines = [];

      for (const line of input.replacementLines) {
        const batch = replacementBatches.find((b) => b.id === line.batchId)!;
        const availableStock = calculateBatchStock(batch.movements);

        if (line.quantity > availableStock) {
          throw new Error(
            `Insufficient stock for replacement batch ${batch.batchNumber}. Available: ${availableStock}, requested: ${line.quantity}.`
          );
        }

        const taxable = line.quantity * line.unitRate;
        const tax = taxable * (line.taxPercent / 100);
        const lineTotal = Math.round((taxable + tax + Number.EPSILON) * 100) / 100;
        replacementTotal = Math.round((replacementTotal + lineTotal + Number.EPSILON) * 100) / 100;

        calculatedReplacementLines.push({
          medicineName: batch.medicine.name,
          batchNumber: batch.batchNumber,
          quantity: line.quantity,
          unitRate: line.unitRate,
          total: lineTotal,
        });

        // Deduct inventory movement for replacement item
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: line.batchId,
            type: "SALE",
            quantity: line.quantity,
            unitRate: line.unitRate,
            referenceId: invoice.id,
            reason: `Exchange replacement on ${invoice.invoiceNumber}`,
          },
        });
      }

      // 4. Compute differential
      const diff = calculateExchangeDifferential(returnTotals.totalRefund, replacementTotal);

      // 5. Settle differential
      if (invoice.customerId) {
        if (diff.settlementType === "CUSTOMER_PAYS" && input.settlementMethod === "CREDIT") {
          // Debit customer Khata for extra amount
          await tx.customerLedgerEntry.create({
            data: {
              storeId: session.storeId,
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              side: "DEBIT",
              amount: diff.difference,
              description: `Exchange differential due on ${invoice.invoiceNumber}`,
            },
          });
        } else if (diff.settlementType === "STORE_REFUNDS") {
          // Credit customer Khata
          await tx.customerLedgerEntry.create({
            data: {
              storeId: session.storeId,
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              side: "CREDIT",
              amount: diff.difference,
              description: `Exchange refund credit on ${invoice.invoiceNumber}`,
            },
          });
        }
      }

      // 6. Record AuditEvent
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "customer_exchange_processed",
          entity: "SalesInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            returnedValue: returnTotals.totalRefund,
            replacementValue: replacementTotal,
            differential: diff.difference,
            settlementType: diff.settlementType,
          },
        },
      });

      return {
        exchangeVoucherNumber: `EXC-${invoice.invoiceNumber}`,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? "Walk-in Customer",
        returnTotal: returnTotals.totalRefund,
        replacementTotal,
        differential: diff.difference,
        settlementType: diff.settlementType,
        returnedLines: calculatedReturnLines,
        replacementLines: calculatedReplacementLines,
      };
    });

    return NextResponse.json({ exchangeResult }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process exchange";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

