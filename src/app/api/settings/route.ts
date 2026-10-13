import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storeSettingsUpdateSchema } from "@/domain/settings";
import { hasPermission } from "@/domain/rbac";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    include: { settings: true },
  });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      code: store.code,
      createdAt: store.createdAt,
    },
    settings: store.settings,
  });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = storeSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update store name
      const updatedStore = await tx.store.update({
        where: { id: session.storeId },
        data: { name: input.name },
      });

      // 2. Upsert store settings
      const updatedSettings = await tx.storeSettings.upsert({
        where: { storeId: session.storeId },
        update: {
          phone: input.phone || null,
          address: input.address || null,
          gstin: input.gstin || null,
          drugLicense: input.drugLicense || null,
          invoicePrefix: input.invoicePrefix,
          nextInvoiceNo: input.nextInvoiceNo,
          discountDisplay: input.discountDisplay,
          footerNotice: input.footerNotice || null,
          terms: input.terms || null,
          gstScheme: input.gstScheme,
          eInvoiceEnabled: input.eInvoiceEnabled,
          ewayBillEnabled: input.ewayBillEnabled,
        },
        create: {
          storeId: session.storeId,
          phone: input.phone || null,
          address: input.address || null,
          gstin: input.gstin || null,
          drugLicense: input.drugLicense || null,
          invoicePrefix: input.invoicePrefix,
          nextInvoiceNo: input.nextInvoiceNo,
          discountDisplay: input.discountDisplay,
          footerNotice: input.footerNotice || null,
          terms: input.terms || null,
          gstScheme: input.gstScheme,
          eInvoiceEnabled: input.eInvoiceEnabled,
          ewayBillEnabled: input.ewayBillEnabled,
        },
      });

      // 3. Log audit event
      await tx.auditEvent.create({
        data: {
          storeId: session.storeId,
          userId: session.userId,
          action: "STORE_SETTINGS_UPDATE",
          entity: "StoreSettings",
          entityId: updatedSettings.id,
          metadata: {
            storeName: input.name,
            gstin: input.gstin,
            gstScheme: input.gstScheme,
            invoicePrefix: input.invoicePrefix,
          },
        },
      });

      return { store: updatedStore, settings: updatedSettings };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to update store settings:", error);
    return NextResponse.json({ error: "Failed to update store settings" }, { status: 500 });
  }
}

