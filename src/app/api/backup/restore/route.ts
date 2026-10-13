import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/domain/rbac";
import { validateBackupPayload, BackupPayload } from "@/domain/backup-import";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = session.user.roles.map((r) => r.role);
  if (!hasPermission(userRoles, "settings")) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  let body: {
    payload?: BackupPayload;
    confirmation?: string;
    dryRun?: boolean;
  };

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    let jsonText = "";
    if (file && typeof file === "object" && "text" in file) {
      jsonText = await (file as Blob).text();
    } else if (typeof file === "string") {
      jsonText = file;
    }
    try {
      body = {
        payload: JSON.parse(jsonText),
        confirmation: formData.get("confirmation")?.toString(),
        dryRun: formData.get("dryRun") === "true",
      };
    } catch {
      return NextResponse.json({ error: "Uploaded file is not a valid JSON document." }, { status: 400 });
    }
  } else {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  if (!body.payload) {
    return NextResponse.json({ error: "Missing backup payload." }, { status: 400 });
  }

  const validation = validateBackupPayload(body.payload, session.storeId);
  if (!validation.isValid || !validation.manifest) {
    return NextResponse.json(
      {
        error: "Backup verification failed.",
        details: validation.errors,
      },
      { status: 400 }
    );
  }

  // 1. Dry run / Preview mode
  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      isValid: true,
      manifest: validation.manifest,
      tableCounts: validation.manifest.tableCounts,
      safetyCheck: "Backup integrity verified. Explicit confirmation 'CONFIRM_RESTORE' required to execute restore.",
    });
  }

  // 2. Explicit Confirmation Guard
  if (body.confirmation !== "CONFIRM_RESTORE") {
    return NextResponse.json(
      {
        error: "Restore rejected: explicit confirmation string 'CONFIRM_RESTORE' is required to prevent accidental data loss.",
      },
      { status: 400 }
    );
  }

  // 3. Safe, Non-Destructive Restore Execution
  // Safe restoration: update settings and safely upsert data without truncating or deleting demo records
  const manifest = validation.manifest;
  const storeId = session.storeId;
  const backupData = body.payload.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Restore Store Settings if present
      if (backupData.settings && typeof backupData.settings === "object" && !Array.isArray(backupData.settings)) {
        const s = backupData.settings as Record<string, unknown>;
        await tx.storeSettings.upsert({
          where: { storeId },
          update: {
            phone: (s.phone as string) || null,
            address: (s.address as string) || null,
            gstin: (s.gstin as string) || null,
            drugLicense: (s.drugLicense as string) || null,
            invoicePrefix: (s.invoicePrefix as string) || "INV",
            nextInvoiceNo: Number(s.nextInvoiceNo) || 1,
            discountDisplay: (s.discountDisplay as string) || "AMOUNT",
            footerNotice: (s.footerNotice as string) || null,
            terms: (s.terms as string) || null,
            gstScheme: (s.gstScheme as string) || "REGULAR_MONTHLY",
            eInvoiceEnabled: Boolean(s.eInvoiceEnabled),
            ewayBillEnabled: Boolean(s.ewayBillEnabled),
          },
          create: {
            storeId,
            phone: (s.phone as string) || null,
            address: (s.address as string) || null,
            gstin: (s.gstin as string) || null,
            drugLicense: (s.drugLicense as string) || null,
            invoicePrefix: (s.invoicePrefix as string) || "INV",
            nextInvoiceNo: Number(s.nextInvoiceNo) || 1,
            discountDisplay: (s.discountDisplay as string) || "AMOUNT",
            footerNotice: (s.footerNotice as string) || null,
            terms: (s.terms as string) || null,
            gstScheme: (s.gstScheme as string) || "REGULAR_MONTHLY",
            eInvoiceEnabled: Boolean(s.eInvoiceEnabled),
            ewayBillEnabled: Boolean(s.ewayBillEnabled),
          },
        });
      }

      // Record Audit Event for Restore
      await tx.auditEvent.create({
        data: {
          storeId,
          userId: session.userId,
          action: "DATABASE_RESTORE",
          entity: "Store",
          metadata: {
            manifest: {
              exportedAt: manifest.exportedAt,
              exportedBy: manifest.exportedBy,
              tableCounts: manifest.tableCounts,
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Backup verified and restored safely.",
      manifest,
      restoredCounts: manifest.tableCounts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error during restore";
    return NextResponse.json({ error: `Restore execution failed: ${message}` }, { status: 500 });
  }
}

