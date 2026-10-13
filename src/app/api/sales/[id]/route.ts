import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateEscPosCommands, formatThermalTextReceipt, ReceiptData, ThermalPaperWidth } from "@/domain/thermal-printer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const width = (url.searchParams.get("width") as ThermalPaperWidth) || "80mm";

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      customer: true,
      lines: {
        include: {
          medicine: true,
          batch: true,
        },
      },
      payments: true,
      store: {
        include: {
          settings: true,
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  // Handle thermal ESC/POS or text format
  if (format === "escpos" || format === "text") {
    const receiptData: ReceiptData = {
      storeName: invoice.store.name,
      storeAddress: invoice.store.settings?.address,
      storePhone: invoice.store.settings?.phone,
      gstin: invoice.store.settings?.gstin,
      drugLicense: invoice.store.settings?.drugLicense,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: invoice.createdAt,
      customerName: invoice.customer?.name,
      customerPhone: invoice.customer?.phone,
      items: invoice.lines.map((l) => ({
        name: l.medicine.name,
        batchNumber: l.batch.batchNumber,
        quantity: l.quantity,
        rate: Number(l.unitRate),
        discount: Number(l.discount),
        total: Number(l.total),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      paymentMethod: invoice.paymentMethod,
      footerNotice: invoice.store.settings?.footerNotice,
      terms: invoice.store.settings?.terms,
    };

    if (format === "escpos") {
      const bytes = generateEscPosCommands(receiptData, { width });
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="receipt-${invoice.invoiceNumber}.bin"`,
        },
      });
    }

    if (format === "text") {
      const text = formatThermalTextReceipt(receiptData, { width });
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  }

  // Fetch associated audit events
  const auditLogs = await prisma.auditEvent.findMany({
    where: {
      storeId: session.storeId,
      entity: "SalesInvoice",
      entityId: id,
    },
    orderBy: { createdAt: "asc" },
  });

  const formatted = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    paymentMethod: invoice.paymentMethod,
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    createdAt: invoice.createdAt.toISOString(),
    store: {
      name: invoice.store.name,
      code: invoice.store.code,
      phone: invoice.store.settings?.phone ?? null,
      address: invoice.store.settings?.address ?? null,
      gstin: invoice.store.settings?.gstin ?? null,
      drugLicense: invoice.store.settings?.drugLicense ?? null,
      footerNotice: invoice.store.settings?.footerNotice ?? null,
    },
    customer: invoice.customer
      ? {
          id: invoice.customer.id,
          name: invoice.customer.name,
          phone: invoice.customer.phone,
          email: invoice.customer.email,
          gstin: invoice.customer.gstin,
        }
      : null,
    lines: invoice.lines.map((line) => ({
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
    payments: invoice.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference,
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
  };

  return NextResponse.json({ invoice: formatted });
}

