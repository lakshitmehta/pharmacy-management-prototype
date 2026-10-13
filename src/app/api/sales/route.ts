import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateBatchStock } from "@/domain/inventory";
import {
  calculateSalesTotals,
  salesInvoiceInputSchema,
  validateBatchForSale,
} from "@/domain/sales";
import { PaymentMethod } from "@prisma/client";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const paymentMethod = url.searchParams.get("paymentMethod") ?? "all";
  const dateRange = url.searchParams.get("dateRange") ?? "all";

  // Build date filter
  const now = new Date();
  let startDate: Date | undefined;

  if (dateRange === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (dateRange === "yesterday") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  } else if (dateRange === "last7days") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (dateRange === "thisMonth") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      storeId: session.storeId,
      ...(status !== "all" ? { status: status as "POSTED" | "VOIDED" } : {}),
      ...(paymentMethod !== "all" ? { paymentMethod: paymentMethod as PaymentMethod } : {}),
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              { customer: { phone: { contains: search } } },
              {
                lines: {
                  some: {
                    medicine: { name: { contains: search, mode: "insensitive" } },
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      lines: {
        include: {
          medicine: { select: { id: true, name: true, genericName: true, barcode: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true, mrp: true } },
        },
      },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Calculate high-level summary metrics across the store
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const allStoreInvoices = await prisma.salesInvoice.findMany({
    where: { storeId: session.storeId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      total: true,
      createdAt: true,
    },
  });

  const postedInvoices = allStoreInvoices.filter((inv) => inv.status === "POSTED");
  const voidedCount = allStoreInvoices.filter((inv) => inv.status === "VOIDED").length;

  const totalRevenue = postedInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const todayInvoices = postedInvoices.filter((inv) => inv.createdAt >= todayStart);
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);

  const cashRevenue = postedInvoices
    .filter((inv) => inv.paymentMethod === "CASH")
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const upiRevenue = postedInvoices
    .filter((inv) => inv.paymentMethod === "UPI")
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const cardRevenue = postedInvoices
    .filter((inv) => inv.paymentMethod === "CARD")
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const creditRevenue = postedInvoices
    .filter((inv) => inv.paymentMethod === "CREDIT")
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const metrics = {
    totalRevenue: Math.round((totalRevenue + Number.EPSILON) * 100) / 100,
    todayRevenue: Math.round((todayRevenue + Number.EPSILON) * 100) / 100,
    todayInvoiceCount: todayInvoices.length,
    totalInvoiceCount: postedInvoices.length,
    voidedCount,
    cashRevenue: Math.round((cashRevenue + Number.EPSILON) * 100) / 100,
    upiRevenue: Math.round((upiRevenue + Number.EPSILON) * 100) / 100,
    cardRevenue: Math.round((cardRevenue + Number.EPSILON) * 100) / 100,
    creditRevenue: Math.round((creditRevenue + Number.EPSILON) * 100) / 100,
  };

  const formattedInvoices = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    paymentMethod: inv.paymentMethod,
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    tax: Number(inv.tax),
    total: Number(inv.total),
    createdAt: inv.createdAt.toISOString(),
    customer: inv.customer,
    itemCount: inv.lines.reduce((sum, l) => sum + l.quantity, 0),
    lines: inv.lines.map((line) => ({
      id: line.id,
      medicineId: line.medicineId,
      medicineName: line.medicine.name,
      genericName: line.medicine.genericName,
      barcode: line.medicine.barcode,
      batchId: line.batchId,
      batchNumber: line.batch.batchNumber,
      expiryDate: line.batch.expiryDate.toISOString(),
      mrp: Number(line.batch.mrp),
      quantity: line.quantity,
      unitRate: Number(line.unitRate),
      discount: Number(line.discount),
      tax: Number(line.tax),
      total: Number(line.total),
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference,
    })),
  }));

  return NextResponse.json({ invoices: formattedInvoices, metrics });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = salesInvoiceInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid sales bill data" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Credit sales require a registered customer
  if (input.paymentMethod === "CREDIT" && !input.customerId && !input.newCustomer) {
    return NextResponse.json(
      { error: "A customer phone and profile is required for Credit (Khata / Udhaar) sales." },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve or create customer
      let customerId: string | null = input.customerId || null;

      if (input.newCustomer) {
        const existingCustomer = await tx.customer.findUnique({
          where: {
            storeId_phone: {
              storeId: session.storeId,
              phone: input.newCustomer.phone,
            },
          },
        });

        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          const createdCust = await tx.customer.create({
            data: {
              storeId: session.storeId,
              name: input.newCustomer.name,
              phone: input.newCustomer.phone,
              notes: input.newCustomer.notes || null,
            },
          });
          customerId = createdCust.id;
        }
      } else if (customerId) {
        const verified = await tx.customer.findFirst({
          where: { id: customerId, storeId: session.storeId },
        });
        if (!verified) {
          throw new Error("Customer not found in this store.");
        }
      }

      // 2. Fetch or initialize store settings for sequential invoice numbering
      let settings = await tx.storeSettings.findUnique({
        where: { storeId: session.storeId },
      });

      if (!settings) {
        settings = await tx.storeSettings.create({
          data: {
            storeId: session.storeId,
            invoicePrefix: "INV",
            nextInvoiceNo: 1,
          },
        });
      }

      const invoiceNumber = `${settings.invoicePrefix}-${String(settings.nextInvoiceNo).padStart(4, "0")}`;

      // Increment nextInvoiceNo for next sale
      await tx.storeSettings.update({
        where: { id: settings.id },
        data: { nextInvoiceNo: { increment: 1 } },
      });

      // 3. Verify batches and stock availability
      const batchIds = input.lines.map((l) => l.batchId);
      const batches = await tx.medicineBatch.findMany({
        where: {
          id: { in: batchIds },
          storeId: session.storeId,
        },
        include: {
          medicine: true,
          movements: { select: { type: true, quantity: true } },
        },
      });

      if (batches.length !== input.lines.length) {
        throw new Error("One or more medicine batches were not found in this store.");
      }

      const now = new Date();

      for (const line of input.lines) {
        const batch = batches.find((b) => b.id === line.batchId);
        if (!batch) throw new Error(`Batch ID ${line.batchId} not found.`);

        const currentStock = calculateBatchStock(batch.movements);
        const validation = validateBatchForSale(
          {
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            stock: currentStock,
          },
          line.quantity,
          now
        );

        if (!validation.valid) {
          throw new Error(validation.error);
        }
      }

      // 4. Compute financial totals
      const lineInputs = input.lines.map((l) => ({
        quantity: l.quantity,
        unitRate: l.unitRate,
        discountPercent: l.discountPercent,
        taxPercent: l.taxPercent,
      }));

      const totals = calculateSalesTotals(lineInputs, input.billDiscountPercent);

      // 5. Create SalesInvoice record
      const invoice = await tx.salesInvoice.create({
        data: {
          storeId: session.storeId,
          customerId,
          invoiceNumber,
          status: "POSTED",
          paymentMethod: input.paymentMethod,
          subtotal: totals.taxable,
          discount: totals.billDiscount + totals.lineDiscounts,
          tax: totals.tax,
          total: totals.total,
        },
      });

      // 6. Create SalesLine records and append InventoryMovement (SALE)
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineCalc = totals.lineCalculations[i];
        const batch = batches.find((b) => b.id === line.batchId)!;

        await tx.salesLine.create({
          data: {
            invoiceId: invoice.id,
            medicineId: line.medicineId,
            batchId: line.batchId,
            quantity: line.quantity,
            unitRate: line.unitRate,
            discount: lineCalc.discount,
            tax: lineCalc.tax,
            total: lineCalc.total,
          },
        });

        // Append-only inventory deduction (positive quantity reduces batch stock)
        await tx.inventoryMovement.create({
          data: {
            storeId: session.storeId,
            batchId: line.batchId,
            type: "SALE",
            quantity: line.quantity,
            unitRate: line.unitRate,
            referenceId: invoice.id,
            reason: `Counter sales bill ${invoiceNumber}`,
          },
        });

        // Check if medicine aggregate stock crossed low-stock safetyLimit
        const updatedMovements = await tx.inventoryMovement.findMany({
          where: { batch: { medicineId: batch.medicineId } },
          select: { type: true, quantity: true },
        });
        const updatedTotalStock = calculateBatchStock(updatedMovements);

        if (updatedTotalStock <= batch.medicine.safetyLimit) {
          const existingAlert = await tx.notification.findFirst({
            where: {
              storeId: session.storeId,
              title: "Low stock alert",
              message: { contains: batch.medicine.name },
              readAt: null,
            },
          });

          if (!existingAlert) {
            await tx.notification.create({
              data: {
                storeId: session.storeId,
                userId: session.userId,
                type: "LOW_STOCK",
                title: "Low stock alert",
                message: `${batch.medicine.name} has reached low stock (${updatedTotalStock} packs remaining, safety limit: ${batch.medicine.safetyLimit}).`,
              },
            });
          }
        }
      }

      // 7. Create SalePayment record
      await tx.salePayment.create({
        data: {
          invoiceId: invoice.id,
          method: input.paymentMethod,
          amount: totals.total,
          reference: input.paymentReference || null,
        },
      });

      // 8. Financial ledger integration
      if (customerId) {
        if (input.paymentMethod === "CREDIT") {
          // Post debit to customer ledger (customer owes this bill)
          await tx.customerLedgerEntry.create({
            data: {
              storeId: session.storeId,
              customerId,
              invoiceId: invoice.id,
              side: "DEBIT",
              amount: totals.total,
              description: `Sales Invoice ${invoiceNumber} (Khata / Udhaar)`,
            },
          });
        } else {
          // Cash/UPI/Card with tracked customer: post debit (invoice) + credit (receipt) for audit trail
          await tx.customerLedgerEntry.create({
            data: {
              storeId: session.storeId,
              customerId,
              invoiceId: invoice.id,
              side: "DEBIT",
              amount: totals.total,
              description: `Sales Invoice ${invoiceNumber}`,
            },
          });

          const receipt = await tx.customerReceipt.create({
            data: {
              storeId: session.storeId,
              customerId,
              amount: totals.total,
              method: input.paymentMethod,
              reference: input.paymentReference || null,
            },
          });

          await tx.receiptAllocation.create({
            data: {
              receiptId: receipt.id,
              invoiceId: invoice.id,
              amount: totals.total,
            },
          });

          await tx.customerLedgerEntry.create({
            data: {
              storeId: session.storeId,
              customerId,
              receiptId: receipt.id,
              side: "CREDIT",
              amount: totals.total,
              description: `Receipt for ${invoiceNumber} (${input.paymentMethod})`,
            },
          });
        }
      }

      // 9. Record audit event
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "sales_invoice_created",
          entity: "SalesInvoice",
          entityId: invoice.id,
          metadata: {
            invoiceNumber,
            total: totals.total,
            paymentMethod: input.paymentMethod,
            lineCount: input.lines.length,
            customerId,
          },
        },
      });

      return tx.salesInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          customer: true,
          lines: {
            include: {
              medicine: true,
              batch: true,
            },
          },
          payments: true,
        },
      });
    });

    const formattedInvoice = {
      id: result.id,
      invoiceNumber: result.invoiceNumber,
      status: result.status,
      paymentMethod: result.paymentMethod,
      subtotal: Number(result.subtotal),
      discount: Number(result.discount),
      tax: Number(result.tax),
      total: Number(result.total),
      createdAt: result.createdAt.toISOString(),
      customer: result.customer
        ? { id: result.customer.id, name: result.customer.name, phone: result.customer.phone }
        : null,
      lines: result.lines.map((line) => ({
        id: line.id,
        medicineName: line.medicine.name,
        genericName: line.medicine.genericName,
        barcode: line.medicine.barcode,
        batchNumber: line.batch.batchNumber,
        expiryDate: line.batch.expiryDate.toISOString(),
        quantity: line.quantity,
        unitRate: Number(line.unitRate),
        discount: Number(line.discount),
        tax: Number(line.tax),
        total: Number(line.total),
      })),
      payments: result.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference,
      })),
    };

    return NextResponse.json({ invoice: formattedInvoice }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process sale invoice";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

