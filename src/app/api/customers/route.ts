import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerInputSchema } from "@/domain/sales";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: {
      storeId: session.storeId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      ledger: { select: { side: true, amount: true } },
      _count: { select: { sales: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const formatted = customers.map((c) => {
    const debits = c.ledger
      .filter((entry) => entry.side === "DEBIT")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credits = c.ledger
      .filter((entry) => entry.side === "CREDIT")
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const balance = Math.round((debits - credits + Number.EPSILON) * 100) / 100;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      notes: c.notes,
      balance,
      salesCount: c._count.sales,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ customers: formatted });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = customerInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid customer details" },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Check if phone already registered in this store
  const existing = await prisma.customer.findUnique({
    where: {
      storeId_phone: {
        storeId: session.storeId,
        phone: input.phone,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: `A customer with phone number ${input.phone} already exists (${existing.name}).` },
      { status: 409 }
    );
  }

  try {
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          storeId: session.storeId,
          name: input.name,
          phone: input.phone,
          email: input.email || null,
          gstin: input.gstin || null,
          notes: input.notes || null,
        },
      });

      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "customer_registered",
          entity: "Customer",
          entityId: created.id,
          metadata: { name: created.name, phone: created.phone },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        customer: {
          ...customer,
          balance: 0,
          salesCount: 0,
          createdAt: customer.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register customer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

