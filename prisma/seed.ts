import { PrismaClient, MovementType, NotificationType, PaymentMethod, UserStatus } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("ChangeMe!123", { type: argon2.argon2id });
  const role = await prisma.role.upsert({
    where: { name: "OWNER" },
    update: { permissions: ["*"] },
    create: { name: "OWNER", permissions: ["*"] },
  });

  const store = await prisma.store.upsert({
    where: { code: "DEMO-001" },
    update: {},
    create: { name: "PillBills Demo Pharmacy", code: "DEMO-001" },
  });

  const user = await prisma.user.upsert({
    where: { storeId_username: { storeId: store.id, username: "admin" } },
    update: { passwordHash, status: UserStatus.ACTIVE },
    create: {
      storeId: store.id,
      username: "admin",
      displayName: "Pharmacy Owner",
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: { roleId: role.id } },
    },
  });

  await prisma.storeSettings.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      phone: "9876543210",
      address: "12 Market Road, Chandigarh",
      invoicePrefix: "DEMO",
      footerNotice: "Thank you for your visit.",
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: `${store.id}-apex` },
    update: {},
    create: {
      id: `${store.id}-apex`,
      storeId: store.id,
      name: "Apex Distributors",
      code: "APEX-001",
      phone: "9819167712",
      gstin: "03AABCA0000A1Z5",
    },
  });

  const products = [
    { name: "Paracetamol 650", genericName: "Paracetamol", barcode: "890100000001", mrp: 25, rate: 18, batch: "PCM-2601", stock: 120 },
    { name: "Amoxicillin 500", genericName: "Amoxicillin", barcode: "890100000002", mrp: 85, rate: 62, batch: "AMX-2602", stock: 48 },
    { name: "ORS Orange", genericName: "Oral Rehydration Salts", barcode: "890100000003", mrp: 22, rate: 14, batch: "ORS-2603", stock: 75 },
    { name: "Cetirizine 10", genericName: "Cetirizine", barcode: "890100000004", mrp: 38, rate: 27, batch: "CTZ-2604", stock: 9 },
  ];

  for (const product of products) {
    const medicine = await prisma.medicine.upsert({
      where: { storeId_barcode: { storeId: store.id, barcode: product.barcode } },
      update: { name: product.name, genericName: product.genericName },
      create: {
        storeId: store.id,
        name: product.name,
        genericName: product.genericName,
        barcode: product.barcode,
        hsn: "30049099",
        gstRate: 5,
        safetyLimit: 15,
      },
    });
    const batch = await prisma.medicineBatch.upsert({
      where: { storeId_medicineId_batchNumber: { storeId: store.id, medicineId: medicine.id, batchNumber: product.batch } },
      update: {},
      create: {
        storeId: store.id,
        medicineId: medicine.id,
        supplierId: supplier.id,
        batchNumber: product.batch,
        expiryDate: new Date("2027-12-31"),
        purchaseRate: product.rate,
        mrp: product.mrp,
      },
    });
    if (!(await prisma.inventoryMovement.findFirst({ where: { batchId: batch.id, type: MovementType.OPENING } }))) {
      await prisma.inventoryMovement.create({
        data: {
          storeId: store.id,
          batchId: batch.id,
          type: MovementType.OPENING,
          quantity: product.stock,
          unitRate: product.rate,
          reason: "Synthetic demo opening stock",
        },
      });
    }
  }

  const customer = await prisma.customer.upsert({
    where: { storeId_phone: { storeId: store.id, phone: "9876500001" } },
    update: {},
    create: { storeId: store.id, name: "Ramesh Kumar", phone: "9876500001", notes: "Synthetic demo customer" },
  });

  await prisma.notification.deleteMany({ where: { storeId: store.id } });
  await prisma.notification.create({
    data: {
      storeId: store.id,
      userId: user.id,
      type: NotificationType.LOW_STOCK,
      title: "Low stock review",
      message: "Cetirizine 10 is below its configured safety limit.",
    },
  });

  await prisma.auditEvent.create({
    data: {
      storeId: store.id,
      userId: user.id,
      action: "seeded_demo_data",
      entity: "Store",
      entityId: store.id,
      metadata: { customerId: customer.id, paymentMethod: PaymentMethod.CASH },
    },
  });

  console.log(`Seeded ${store.name}. Login: admin / ChangeMe!123`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
