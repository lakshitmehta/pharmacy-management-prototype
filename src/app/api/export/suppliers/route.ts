import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { generateCsv } from "@/domain/backup-import";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = session.user.roles.map((r) => r.role);
  if (
    !hasPermission(userRoles, "purchases") &&
    !hasPermission(userRoles, "inventory") &&
    !hasPermission(userRoles, "settings")
  ) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: session.storeId },
    include: {
      ledger: { select: { side: true, amount: true } },
      _count: { select: { purchases: true } },
    },
    orderBy: { name: "asc" },
  });

  const columns = [
    { key: "name", label: "Supplier Name" },
    { key: "code", label: "Code" },
    { key: "contactName", label: "Contact Person" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "gstin", label: "GSTIN" },
    { key: "address", label: "Address" },
    { key: "status", label: "Status" },
    { key: "balance", label: "Outstanding Balance" },
    { key: "purchaseCount", label: "Purchase Count" },
  ];

  const records = suppliers.map((s) => {
    const balance = s.ledger.reduce(
      (acc, entry) => acc + (entry.side === "DEBIT" ? Number(entry.amount) : -Number(entry.amount)),
      0
    );

    return {
      name: s.name,
      code: s.code ?? "",
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      gstin: s.gstin ?? "",
      address: s.address ?? "",
      status: s.active ? "Active" : "Inactive",
      balance: balance.toFixed(2),
      purchaseCount: s._count.purchases,
    };
  });

  const csvContent = generateCsv(columns, records);

  // Log audit event
  await prisma.auditEvent.create({
    data: {
      storeId: session.storeId,
      userId: session.userId,
      action: "SUPPLIER_EXPORT",
      entity: "Supplier",
      metadata: {
        exportedCount: records.length,
      },
    },
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppliers-${timestamp}.csv"`,
    },
  });
}

