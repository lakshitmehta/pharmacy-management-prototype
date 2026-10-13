import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSupplierBalance, roundCurrency } from "@/domain/payables";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      purchases: {
        where: { status: "POSTED" },
        include: {
          paymentAllocations: { select: { amount: true } },
          lines: {
            include: {
              medicine: { select: { name: true } },
              batch: { select: { batchNumber: true } },
            },
          },
        },
        orderBy: { invoiceDate: "desc" },
      },
      payments: {
        include: {
          allocations: {
            include: {
              invoice: { select: { invoiceNumber: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      ledger: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }

  // Calculate running balance statement
  let currentBalance = 0;
  const statement = supplier.ledger.map((entry) => {
    const amt = Number(entry.amount);
    if (entry.side === "DEBIT") {
      currentBalance = roundCurrency(currentBalance + amt);
    } else {
      currentBalance = roundCurrency(Math.max(0, currentBalance - amt));
    }
    return {
      id: entry.id,
      side: entry.side,
      amount: amt,
      runningBalance: currentBalance,
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    };
  });

  // Open invoices calculation
  const openInvoices = supplier.purchases
    .map((p) => {
      const total = Number(p.total);
      const paid = p.paymentAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
      const outstanding = roundCurrency(Math.max(0, total - paid));
      return {
        id: p.id,
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate.toISOString(),
        total,
        paid,
        outstanding,
        linesCount: p.lines.length,
      };
    })
    .filter((inv) => inv.outstanding > 0.01)
    .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());

  // Formatted purchase invoices
  const purchases = supplier.purchases.map((p) => {
    const total = Number(p.total);
    const paid = p.paymentAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
    return {
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate.toISOString(),
      total,
      paid,
      outstanding: roundCurrency(Math.max(0, total - paid)),
      status: p.status,
    };
  });

  // Formatted payments
  const payments = supplier.payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    method: p.method,
    reference: p.reference,
    createdAt: p.createdAt.toISOString(),
    allocations: p.allocations.map((a) => ({
      invoiceNumber: a.invoice.invoiceNumber,
      amount: Number(a.amount),
    })),
  }));

  const netBalance = calculateSupplierBalance(
    supplier.ledger.map((e) => ({ side: e.side, amount: Number(e.amount) }))
  );

  return NextResponse.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      code: supplier.code,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      gstin: supplier.gstin,
      address: supplier.address,
      balance: netBalance,
      openInvoices,
      purchases,
      payments,
      statement,
    },
  });
}

