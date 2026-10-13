import { z } from "zod";
import { createHash } from "node:crypto";
import { isValidGstin } from "./settings";

/**
 * RFC 4180 compliant CSV parser
 * Supports:
 * - Double quotes escaping ("" -> ")
 * - Commas and newlines inside quoted fields
 * - Windows (\r\n) and Unix (\n) line endings
 * - UTF-8 BOM stripping
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
} {
  if (!text) {
    return { headers: [], rows: [], rawRowCount: 0 };
  }

  // Strip UTF-8 BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote: "" inside quotes becomes "
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quotes
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes) {
      if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      }

      if (char === "\r" && nextChar === "\n") {
        currentRow.push(currentField);
        lines.push(currentRow);
        currentRow = [];
        currentField = "";
        i += 2;
        continue;
      }

      if (char === "\n" || char === "\r") {
        currentRow.push(currentField);
        lines.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }
    }

    currentField += char;
    i++;
  }

  // Push final field/row if any characters remain or row is incomplete
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    lines.push(currentRow);
  }

  // Filter out empty lines (e.g. trailing newline)
  const filteredLines = lines.filter((row) =>
    row.some((field) => field.trim().length > 0)
  );

  if (filteredLines.length === 0) {
    return { headers: [], rows: [], rawRowCount: 0 };
  }

  const rawHeaders = filteredLines[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < filteredLines.length; r++) {
    const rowData: Record<string, string> = {};
    const line = filteredLines[r];
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerKey = rawHeaders[c].toLowerCase().replace(/[^a-z0-9_]/g, "_");
      rowData[headerKey] = (line[c] ?? "").trim();
      // Also preserve original trimmed header key
      rowData[rawHeaders[c]] = (line[c] ?? "").trim();
    }
    rows.push(rowData);
  }

  return {
    headers: rawHeaders,
    rows,
    rawRowCount: filteredLines.length - 1,
  };
}

/**
 * RFC 4180 compliant CSV generator
 */
export function generateCsv(
  columns: { key: string; label: string }[],
  records: Array<Record<string, unknown>>
): string {
  const escapeField = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map((col) => escapeField(col.label)).join(",");
  const dataLines = records.map((record) =>
    columns.map((col) => escapeField(record[col.key])).join(",")
  );

  return [headerLine, ...dataLines].join("\r\n");
}

// --------------------------------------------------------------------------
// Medicine Import / Export Schema & Validation
// --------------------------------------------------------------------------

export const medicineImportItemSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required").max(200, "Name exceeds 200 characters"),
  genericName: z.string().trim().max(200).optional().default(""),
  manufacturer: z.string().trim().max(200).optional().default(""),
  barcode: z.string().trim().max(80).optional().default(""),
  hsn: z.string().trim().max(20).optional().default(""),
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative").max(100, "GST rate cannot exceed 100%").default(0),
  safetyLimit: z.coerce.number().int("Safety limit must be an integer").min(0, "Safety limit cannot be negative").default(15),
});

export type MedicineImportItem = z.infer<typeof medicineImportItemSchema>;

export interface RowValidationError {
  row: number;
  item: string;
  errors: string[];
}

export interface ImportValidationResult<T> {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validItems: T[];
  errors: RowValidationError[];
}

export function validateMedicineImportCsv(csvText: string): ImportValidationResult<MedicineImportItem> {
  const parsed = parseCsv(csvText);
  const validItems: MedicineImportItem[] = [];
  const errors: RowValidationError[] = [];

  const seenBarcodes = new Set<string>();

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2; // Line 1 is header, so row 0 is Line 2

    // Map common aliases
    const name = row["name"] || row["medicine_name"] || row["medicine"] || row["item_name"] || row["Name"] || "";
    const genericName = row["generic_name"] || row["genericname"] || row["generic"] || row["Generic Name"] || "";
    const manufacturer = row["manufacturer"] || row["mfg"] || row["company"] || row["Manufacturer"] || "";
    const barcode = row["barcode"] || row["code"] || row["Barcode"] || "";
    const hsn = row["hsn"] || row["hsn_code"] || row["HSN"] || "";
    const gstRateRaw = row["gst_rate"] || row["gstrate"] || row["gst"] || row["gst_percent"] || row["GST Rate (%)"] || "0";
    const safetyLimitRaw = row["safety_limit"] || row["safetylimit"] || row["min_stock"] || row["Safety Limit"] || "15";

    const candidate = {
      name,
      genericName,
      manufacturer,
      barcode,
      hsn,
      gstRate: gstRateRaw === "" ? 0 : Number(gstRateRaw),
      safetyLimit: safetyLimitRaw === "" ? 15 : Number(safetyLimitRaw),
    };

    const result = medicineImportItemSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        row: rowNumber,
        item: name || `Row ${rowNumber}`,
        errors: result.error.issues.map((issue) => issue.message),
      });
    } else {
      // Check in-file barcode uniqueness if barcode provided
      if (result.data.barcode) {
        if (seenBarcodes.has(result.data.barcode)) {
          errors.push({
            row: rowNumber,
            item: name,
            errors: [`Duplicate barcode '${result.data.barcode}' found within import file`],
          });
          return;
        }
        seenBarcodes.add(result.data.barcode);
      }
      validItems.push(result.data);
    }
  });

  return {
    totalRows: parsed.rawRowCount,
    validCount: validItems.length,
    invalidCount: errors.length,
    validItems,
    errors,
  };
}

// --------------------------------------------------------------------------
// Supplier Import / Export Schema & Validation
// --------------------------------------------------------------------------

export const supplierImportItemSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(160, "Name exceeds 160 characters"),
  code: z.string().trim().max(40).optional().default(""),
  contactName: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().min(7, "Phone must have at least 7 digits").max(30, "Phone exceeds 30 digits"),
  email: z.string().trim().email("Invalid email format").optional().or(z.literal("")).default(""),
  gstin: z.string().trim().optional().or(z.literal("")).default(""),
  address: z.string().trim().max(500).optional().default(""),
  active: z.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.gstin && data.gstin.length > 0 && !isValidGstin(data.gstin)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid GSTIN format (must be 15-character statutory format)",
      path: ["gstin"],
    });
  }
});

export type SupplierImportItem = z.infer<typeof supplierImportItemSchema>;

export function validateSupplierImportCsv(csvText: string): ImportValidationResult<SupplierImportItem> {
  const parsed = parseCsv(csvText);
  const validItems: SupplierImportItem[] = [];
  const errors: RowValidationError[] = [];

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;

    const name = row["name"] || row["supplier_name"] || row["vendor"] || row["Name"] || "";
    const code = row["code"] || row["supplier_code"] || row["Code"] || "";
    const contactName = row["contact_name"] || row["contact"] || row["contact_person"] || row["Contact Person"] || "";
    const phone = row["phone"] || row["mobile"] || row["telephone"] || row["Phone"] || "";
    const email = row["email"] || row["mail"] || row["Email"] || "";
    const gstin = row["gstin"] || row["gst"] || row["GSTIN"] || "";
    const address = row["address"] || row["city"] || row["Address"] || "";
    const activeRaw = row["active"] || row["status"] || row["Active"] || "true";

    const candidate = {
      name,
      code,
      contactName,
      phone,
      email,
      gstin: gstin.toUpperCase(),
      address,
      active: activeRaw.toLowerCase() !== "false" && activeRaw.toLowerCase() !== "inactive",
    };

    const result = supplierImportItemSchema.safeParse(candidate);
    if (!result.success) {
      errors.push({
        row: rowNumber,
        item: name || `Row ${rowNumber}`,
        errors: result.error.issues.map((issue) => issue.message),
      });
    } else {
      validItems.push(result.data);
    }
  });

  return {
    totalRows: parsed.rawRowCount,
    validCount: validItems.length,
    invalidCount: errors.length,
    validItems,
    errors,
  };
}

// --------------------------------------------------------------------------
// Database Backup & Restore Manifest & Checksums
// --------------------------------------------------------------------------

export interface BackupManifest {
  version: "1.0";
  format: "pillbills-json-backup";
  storeId: string;
  storeName: string;
  storeCode: string;
  exportedAt: string;
  exportedBy: {
    userId: string;
    username: string;
  };
  tableCounts: Record<string, number>;
  checksum: string;
}

export interface BackupPayload {
  manifest: BackupManifest;
  data: Record<string, unknown[]>;
}

export function computeBackupChecksum(data: unknown): string {
  const canonicalString = JSON.stringify(data);
  return createHash("sha256").update(canonicalString).digest("hex");
}

export function validateBackupPayload(
  payload: unknown,
  currentStoreId?: string
): {
  isValid: boolean;
  manifest?: BackupManifest;
  errors: string[];
} {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { isValid: false, errors: ["Backup file content must be a valid JSON object"] };
  }

  const p = payload as Partial<BackupPayload>;

  if (!p.manifest || typeof p.manifest !== "object") {
    errors.push("Missing or invalid 'manifest' section in backup payload");
  } else {
    if (p.manifest.format !== "pillbills-json-backup") {
      errors.push(`Invalid backup format '${p.manifest.format}'. Expected 'pillbills-json-backup'`);
    }
    if (p.manifest.version !== "1.0") {
      errors.push(`Unsupported backup version '${p.manifest.version}'. Supported version: 1.0`);
    }
    if (!p.manifest.checksum || typeof p.manifest.checksum !== "string") {
      errors.push("Manifest missing cryptographic checksum");
    }
    if (currentStoreId && p.manifest.storeId && p.manifest.storeId !== currentStoreId) {
      errors.push(`Store ID mismatch: backup belongs to store '${p.manifest.storeId}', current store is '${currentStoreId}'`);
    }
  }

  if (!p.data || typeof p.data !== "object") {
    errors.push("Missing or invalid 'data' section in backup payload");
  } else if (p.manifest?.checksum) {
    // Verify checksum
    const computed = computeBackupChecksum(p.data);
    if (computed !== p.manifest.checksum) {
      errors.push("Cryptographic checksum mismatch! The backup data may be corrupted or tampered with.");
    }
  }

  return {
    isValid: errors.length === 0,
    manifest: p.manifest as BackupManifest | undefined,
    errors,
  };
}

export function canPerformRestore(
  confirmation: string | undefined
): { allowed: boolean; message: string } {
  if (confirmation !== "CONFIRM_RESTORE") {
    return {
      allowed: false,
      message: "Explicit confirmation required. Please provide confirmation text 'CONFIRM_RESTORE'.",
    };
  }
  return { allowed: true, message: "Confirmation verified." };
}

