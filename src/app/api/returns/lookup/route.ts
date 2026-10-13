import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() ?? url.searchParams.get("invoiceNumber")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ error: "Invoice number or customer phone is required." }, { status: 400 });
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: {
      storeId: session.storeId,
      status: "POSTED",
      OR: [
        { invoiceNumber: { equals: query, mode: "insensitive" } },
        { customer: { phone: query } },
      ],
    },
    include: {
      customer: true,
      lines: {
        include: {
          medicine: { select: { id: true, name: true, genericName: true, barcode: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true, mrp: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!invoice) {
    return NextResponse.json(
      { error: `No active posted invoice found matching "${query}".` },
      { status: 404 }
    );
  }

  // Find all previous CUSTOMER_RETURN movements referencing this invoice
  const returnMovements = await prisma.inventoryMovement.findMany({
    where: {
      storeId: session.storeId,
      referenceId: invoice.id,
      type: "CUSTOMER_RETURN",
    },
  });

  // Calculate returnable limits per batch
  const linesWithLimits = invoice.lines.map((line) => {
    const previousReturns = returnMovements
      .filter((m) => m.batchId === line.batchId)
      .reduce((sum, m) => sum + m.quantity, 0);

    const returnableQuantity = Math.max(0, line.quantity - previousReturns);

    return {
      id: line.id,
      medicineId: line.medicineId,
      medicineName: line.medicine.name,
      genericName: line.medicine.genericName,
      barcode: line.medicine.barcode,
      batchId: line.batchId,
      batchNumber: line.batch.batchNumber,
      expiryDate: line.batch.expiryDate.toISOString(),
      mrp: Number(line.batch.mrp),
      soldQuantity: line.quantity,
      alreadyReturned: previousReturns,
      returnableQuantity,
      unitRate: Number(line.unitRate),
      discount: Number(line.discount),
      tax: Number(line.tax),
      total: Number(line.total),
    };
  });

  const formatted = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    createdAt: invoice.createdAt.toISOString(),
    paymentMethod: invoice.paymentMethod,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
        }
      : null,
    lines: linesWithLimits,
  };

  return NextResponse.json({ invoice: formatted });
}

