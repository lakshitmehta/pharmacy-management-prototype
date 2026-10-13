import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { validateSupplierImportCsv } from "@/domain/backup-import";

export async function POST(request: Request) {
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

  let csvText = "";
  let dryRun = false;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (file && typeof file === "object" && "text" in file) {
      csvText = await (file as Blob).text();
    } else if (typeof file === "string") {
      csvText = file;
    }
    dryRun = formData.get("dryRun") === "true";
  } else {
    try {
      const body = await request.json();
      csvText = body.csv || "";
      dryRun = Boolean(body.dryRun);
    } catch {
      return NextResponse.json({ error: "Invalid request payload. Expected JSON or multipart/form-data." }, { status: 400 });
    }
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV content cannot be empty." }, { status: 400 });
  }

  const validation = validateSupplierImportCsv(csvText);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      totalRows: validation.totalRows,
      validCount: validation.validCount,
      invalidCount: validation.invalidCount,
      errors: validation.errors,
      preview: validation.validItems.slice(0, 10),
    });
  }

  if (validation.validCount === 0) {
    return NextResponse.json({
      error: "No valid supplier records found in CSV.",
      totalRows: validation.totalRows,
      validCount: 0,
      invalidCount: validation.invalidCount,
      errors: validation.errors,
    }, { status: 400 });
  }

  // Import valid items non-destructively
  let importedCount = 0;
  const storeId = session.storeId;

  await prisma.$transaction(async (tx) => {
    for (const item of validation.validItems) {
      // Find if supplier exists by storeId and name
      const existing = await tx.supplier.findFirst({
        where: {
          storeId,
          name: { equals: item.name, mode: "insensitive" },
        },
      });

      if (existing) {
        await tx.supplier.update({
          where: { id: existing.id },
          data: {
            code: item.code || existing.code,
            contactName: item.contactName || existing.contactName,
            phone: item.phone,
            email: item.email || existing.email,
            gstin: item.gstin || existing.gstin,
            address: item.address || existing.address,
            active: item.active,
          },
        });
      } else {
        await tx.supplier.create({
          data: {
            storeId,
            name: item.name,
            code: item.code || null,
            contactName: item.contactName || null,
            phone: item.phone,
            email: item.email || null,
            gstin: item.gstin || null,
            address: item.address || null,
            active: item.active,
          },
        });
      }
      importedCount++;
    }

    // Log audit event
    await tx.auditEvent.create({
      data: {
        storeId,
        userId: session.userId,
        action: "SUPPLIER_IMPORT",
        entity: "Supplier",
        metadata: {
          totalRows: validation.totalRows,
          importedCount,
          invalidCount: validation.invalidCount,
        },
      },
    });
  });

  return NextResponse.json({
    success: true,
    totalRows: validation.totalRows,
    importedCount,
    failedCount: validation.invalidCount,
    errors: validation.errors,
  });
}

