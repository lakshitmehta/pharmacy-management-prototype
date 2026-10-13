import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { validateMedicineImportCsv } from "@/domain/backup-import";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "inventory") && !hasPermission(userRoles, "settings")) {
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

  const validation = validateMedicineImportCsv(csvText);

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
      error: "No valid medicine records found in CSV.",
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
      if (item.barcode) {
        // Upsert by storeId and barcode
        await tx.medicine.upsert({
          where: {
            storeId_barcode: {
              storeId,
              barcode: item.barcode,
            },
          },
          update: {
            name: item.name,
            genericName: item.genericName || null,
            manufacturer: item.manufacturer || null,
            hsn: item.hsn || null,
            gstRate: item.gstRate,
            safetyLimit: item.safetyLimit,
          },
          create: {
            storeId,
            name: item.name,
            genericName: item.genericName || null,
            manufacturer: item.manufacturer || null,
            barcode: item.barcode,
            hsn: item.hsn || null,
            gstRate: item.gstRate,
            safetyLimit: item.safetyLimit,
          },
        });
      } else {
        // Create new medicine without barcode
        await tx.medicine.create({
          data: {
            storeId,
            name: item.name,
            genericName: item.genericName || null,
            manufacturer: item.manufacturer || null,
            barcode: null,
            hsn: item.hsn || null,
            gstRate: item.gstRate,
            safetyLimit: item.safetyLimit,
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
        action: "MEDICINE_IMPORT",
        entity: "Medicine",
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

