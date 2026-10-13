import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { computeBackupChecksum, BackupManifest } from "@/domain/backup-import";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const storeId = session.storeId;

  // Retrieve all store data scoped to storeId
  const [
    store,
    settings,
    medicines,
    batches,
    suppliers,
    customers,
    salesInvoices,
    purchaseInvoices,
    purchaseOrders,
    inventoryMovements,
    bankAccounts,
    cashRegisters,
    customerLedger,
    supplierLedger,
    vouchers,
    auditEvents,
  ] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.storeSettings.findUnique({ where: { storeId } }),
    prisma.medicine.findMany({ where: { storeId }, include: { aliases: true } }),
    prisma.medicineBatch.findMany({ where: { storeId } }),
    prisma.supplier.findMany({ where: { storeId } }),
    prisma.customer.findMany({ where: { storeId } }),
    prisma.salesInvoice.findMany({ where: { storeId }, include: { lines: true, payments: true } }),
    prisma.purchaseInvoice.findMany({ where: { storeId }, include: { lines: true } }),
    prisma.purchaseOrder.findMany({ where: { storeId }, include: { lines: true } }),
    prisma.inventoryMovement.findMany({ where: { storeId } }),
    prisma.bankAccount.findMany({ where: { storeId } }),
    prisma.cashRegister.findMany({ where: { storeId } }),
    prisma.customerLedgerEntry.findMany({ where: { storeId } }),
    prisma.supplierLedgerEntry.findMany({ where: { storeId } }),
    prisma.voucher.findMany({ where: { storeId } }),
    prisma.auditEvent.findMany({ where: { storeId }, take: 500, orderBy: { createdAt: "desc" } }),
  ]);

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const tableCounts: Record<string, number> = {
    medicines: medicines.length,
    batches: batches.length,
    suppliers: suppliers.length,
    customers: customers.length,
    salesInvoices: salesInvoices.length,
    purchaseInvoices: purchaseInvoices.length,
    purchaseOrders: purchaseOrders.length,
    inventoryMovements: inventoryMovements.length,
    bankAccounts: bankAccounts.length,
    cashRegisters: cashRegisters.length,
    customerLedger: customerLedger.length,
    supplierLedger: supplierLedger.length,
    vouchers: vouchers.length,
    auditEvents: auditEvents.length,
  };

  const backupData = {
    store: { id: store.id, name: store.name, code: store.code },
    settings,
    medicines,
    batches,
    suppliers,
    customers,
    salesInvoices,
    purchaseInvoices,
    purchaseOrders,
    inventoryMovements,
    bankAccounts,
    cashRegisters,
    customerLedger,
    supplierLedger,
    vouchers,
    auditEvents,
  };

  const checksum = computeBackupChecksum(backupData);

  const manifest: BackupManifest = {
    version: "1.0",
    format: "pillbills-json-backup",
    storeId: store.id,
    storeName: store.name,
    storeCode: store.code,
    exportedAt: new Date().toISOString(),
    exportedBy: {
      userId: session.userId,
      username: session.user.username,
    },
    tableCounts,
    checksum,
  };

  const fullPayload = {
    manifest,
    data: backupData,
  };

  // Log audit event
  await prisma.auditEvent.create({
    data: {
      storeId,
      userId: session.userId,
      action: "DATABASE_BACKUP",
      entity: "Store",
      metadata: {
        tableCounts,
        checksum,
      },
    },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pillbills-backup-${store.code}-${timestamp}.json`;

  return new Response(JSON.stringify(fullPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

