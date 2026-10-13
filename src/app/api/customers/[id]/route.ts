import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerUpdateSchema } from "@/domain/customers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          paymentMethod: true,
          total: true,
          createdAt: true,
        },
      },
      receipts: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          createdAt: true,
          allocations: {
            select: {
              amount: true,
              invoice: { select: { invoiceNumber: true } },
            },
          },
        },
      },
      ledger: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  // Compute running balance across ledger entries
  let runningBalance = 0;
  const statement = customer.ledger.map((entry) => {
    const amount = Number(entry.amount);
    if (entry.side === "DEBIT") {
      runningBalance = Math.round((runningBalance + amount + Number.EPSILON) * 100) / 100;
    } else {
      runningBalance = Math.round((runningBalance - amount + Number.EPSILON) * 100) / 100;
    }

    return {
      id: entry.id,
      side: entry.side,
      amount,
      runningBalance: Math.max(0, runningBalance),
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
      invoiceId: entry.invoiceId,
      receiptId: entry.receiptId,
    };
  });

  const totalSpent = customer.sales
    .filter((s) => s.status === "POSTED")
    .reduce((sum, s) => sum + Number(s.total), 0);

  const formatted = {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    gstin: customer.gstin,
    notes: customer.notes,
    createdAt: customer.createdAt.toISOString(),
    balance: Math.max(0, runningBalance),
    totalSpent: Math.round((totalSpent + Number.EPSILON) * 100) / 100,
    salesCount: customer.sales.length,
    sales: customer.sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      status: s.status,
      paymentMethod: s.paymentMethod,
      total: Number(s.total),
      createdAt: s.createdAt.toISOString(),
    })),
    receipts: customer.receipts.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      method: r.method,
      reference: r.reference,
      createdAt: r.createdAt.toISOString(),
      allocations: r.allocations.map((a) => ({
        amount: Number(a.amount),
        invoiceNumber: a.invoice.invoiceNumber,
      })),
    })),
    statement,
  };

  return NextResponse.json({ customer: formatted });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid customer update data" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Check phone conflict if phone is being changed
  if (input.phone) {
    const existing = await prisma.customer.findFirst({
      where: {
        storeId: session.storeId,
        phone: input.phone,
        id: { not: id },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Phone number ${input.phone} is already registered to another customer (${existing.name}).` },
        { status: 409 }
      );
    }
  }

  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    await prisma.auditEvent.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        action: "customer_updated",
        entity: "Customer",
        entityId: id,
        metadata: { updatedFields: Object.keys(input) },
      },
    });

    return NextResponse.json({ customer: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update customer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Guard against deleting customer with financial history
  const customer = await prisma.customer.findFirst({
    where: { id, storeId: session.storeId },
    include: {
      _count: {
        select: {
          sales: true,
          ledger: true,
          receipts: true,
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  if (customer._count.sales > 0 || customer._count.ledger > 0 || customer._count.receipts > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete customer with transaction history. The profile has associated sales invoices or ledger balance records.",
      },
      { status: 409 }
    );
  }

  await prisma.customer.delete({ where: { id } });

  await prisma.auditEvent.create({
    data: {
      storeId: session.storeId,
      userId: session.userId,
      action: "customer_deleted",
      entity: "Customer",
      entityId: id,
      metadata: { name: customer.name, phone: customer.phone },
    },
  });

  return NextResponse.json({ success: true, message: `Customer ${customer.name} deleted.` });
}

