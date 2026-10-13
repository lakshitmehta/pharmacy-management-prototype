import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { generateCsv } from "@/domain/backup-import";
import { calculateBatchStock } from "@/domain/inventory";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "inventory") && !hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const medicines = await prisma.medicine.findMany({
    where: { storeId: session.storeId },
    include: {
      batches: {
        include: {
          movements: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const columns = [
    { key: "name", label: "Medicine Name" },
    { key: "genericName", label: "Generic Name" },
    { key: "manufacturer", label: "Manufacturer" },
    { key: "barcode", label: "Barcode" },
    { key: "hsn", label: "HSN" },
    { key: "gstRate", label: "GST Rate (%)" },
    { key: "safetyLimit", label: "Safety Limit" },
    { key: "totalStock", label: "Total Stock" },
    { key: "batchCount", label: "Batches Count" },
  ];

  const records = medicines.map((m) => {
    const totalStock = m.batches.reduce((sum, b) => {
      const stock = calculateBatchStock(
        b.movements.map((mv) => ({ type: mv.type, quantity: mv.quantity }))
      );
      return sum + stock;
    }, 0);

    return {
      name: m.name,
      genericName: m.genericName ?? "",
      manufacturer: m.manufacturer ?? "",
      barcode: m.barcode ?? "",
      hsn: m.hsn ?? "",
      gstRate: Number(m.gstRate),
      safetyLimit: m.safetyLimit,
      totalStock,
      batchCount: m.batches.length,
    };
  });

  const csvContent = generateCsv(columns, records);

  // Log export in audit trail
  await prisma.auditEvent.create({
    data: {
      storeId: session.storeId,
      userId: session.userId,
      action: "MEDICINE_EXPORT",
      entity: "Medicine",
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
      "Content-Disposition": `attachment; filename="medicines-${timestamp}.csv"`,
    },
  });
}

