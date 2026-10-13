import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateReturnLineRefund,
  calculateReturnTotals,
  salesReturnInputSchema,
  validateReturnQuantity,
} from "@/domain/returns";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all CUSTOMER_RETURN inventory movements
  const returnMovements = await prisma.inventoryMovement.findMany({
    where: {
      storeId: session.storeId,
      type: "CUSTOMER_RETURN",
    },
    include: {
      batch: {
        include: {
          medicine: { select: { name: true, genericName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totalUnitsReturned = returnMovements.reduce((sum, m) => sum + m.quantity, 0);
  const totalReturnValue = Math.round(
    returnMovements.reduce((sum, m) => sum + m.quantity * Number(m.unitRate), 0) * 100
  ) / 100;

  const formattedReturns = returnMovements.map((m) => ({
    id: m.id,
    batchId: m.batchId,
    batchNumber: m.batch.batchNumber,
    medicineName: m.batch.medicine.name,
    genericName: m.batch.medicine.genericName,
    quantity: m.quantity,
    unitRate: Number(m.unitRate),
    totalValue: Math.round(m.quantity * Number(m.unitRate) * 100) / 100,
    referenceId: m.referenceId,
    reason: m.reason,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({
    returns: formattedReturns,
    metrics: {
      totalReturnsCount: returnMovements.length,
      totalUnitsReturned,
      totalReturnValue,
    },
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = salesReturnInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid return request" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const returnResult = await prisma.$transaction(async (tx) => {
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

      if (!invoice) {
        throw new Error("Sales invoice not found.");
      }

      if (invoice.status === "VOIDED") {
        throw new Error("Cannot process return for an already voided invoice.");
      }

      // Fetch previous return movements for this invoice
      const previousReturns = await tx.inventoryMovement.findMany({
        where: {
          storeId: session.storeId,
          referenceId: invoice.id,
          type: "CUSTOMER_RETURN",
        },
      });

      // 2. Validate requested return lines and compute refunds
      const calculatedLines = [];

      for (const lineReq of input.lines) {
        const origLine = invoice.lines.find((l) => l.id === lineReq.salesLineId);
        if (!origLine) {
          throw new Error(`Invoice does not contain line item ${lineReq.salesLineId}.`);
        }

        const alreadyReturned = previousReturns
          .filter((m) => m.batchId === origLine.batchId)
          .reduce((sum, m) => sum + m.quantity, 0);

        const validation = validateReturnQuantity(
          origLine.quantity,
          alreadyReturned,
          lineReq.quantity
        );

        if (!validation.valid) {
          throw new Error(validation.error);
        }

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

        calculatedLines.push({
          ...calculated,
          medicineName: origLine.medicine.name,
          batchNumber: origLine.batch.batchNumber,
          batchId: origLine.batchId,
          reason: lineReq.reason,
        });
      }

      const totals = calculateReturnTotals(calculatedLines);

      // 3. Append CUSTOMER_RETURN inventory movements (restores stock)
      for (const line of calculatedLines) {
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: line.batchId,
            type: "CUSTOMER_RETURN",
            quantity: line.quantity, // Positive quantity adds stock back in calculateBatchStock
            unitRate: line.unitRate,
            referenceId: invoice.id,
            reason: `Return on ${invoice.invoiceNumber}: ${line.reason}`,
          },
        });
      }

      // 4. Financial settlement
      if (input.settlementType === "KHATA_CREDIT" && invoice.customerId) {
        // Credit the customer's Khata ledger (reduces their outstanding debt)
        await tx.customerLedgerEntry.create({
          data: {
            storeId: session.storeId,
            customerId: invoice.customerId,
            invoiceId: invoice.id,
            side: "CREDIT",
            amount: totals.totalRefund,
            description: `Return credit for invoice ${invoice.invoiceNumber}`,
          },
        });
      }

      // 5. Record AuditEvent
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "customer_return_processed",
          entity: "SalesInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            totalRefund: totals.totalRefund,
            settlementType: input.settlementType,
            linesCount: calculatedLines.length,
          },
        },
      });

      return {
        returnVoucherNumber: `RET-${invoice.invoiceNumber}`,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name ?? "Walk-in Customer",
        customerPhone: invoice.customer?.phone ?? null,
        settlementType: input.settlementType,
        totalRefund: totals.totalRefund,
        taxableRefund: totals.taxable,
        taxRefund: totals.tax,
        lines: calculatedLines,
        createdAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ returnResult }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

