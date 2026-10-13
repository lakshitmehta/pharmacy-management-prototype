import { describe, expect, it } from "vitest";
import {
  parseCsv,
  generateCsv,
  validateMedicineImportCsv,
  validateSupplierImportCsv,
  computeBackupChecksum,
  validateBackupPayload,
  canPerformRestore,
} from "@/domain/backup-import";

describe("CSV parser & generator (RFC 4180)", () => {
  it("parses simple CSV text with headers", () => {
    const csv = `Name,Manufacturer,GST Rate\nParacetamol 500,Cipla,12\nAmoxicillin 250,Sun Pharma,5`;
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(["Name", "Manufacturer", "GST Rate"]);
    expect(parsed.rawRowCount).toBe(2);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]["name"]).toBe("Paracetamol 500");
    expect(parsed.rows[0]["manufacturer"]).toBe("Cipla");
    expect(parsed.rows[0]["gst_rate"]).toBe("12");
  });

  it("handles commas and escaped quotes inside quoted fields", () => {
    const csv = `name,description\n"Azithromycin, 500mg","Antibiotic with ""special"" coating"\nNormal Tab,Basic`;
    const parsed = parseCsv(csv);

    expect(parsed.rawRowCount).toBe(2);
    expect(parsed.rows[0]["name"]).toBe("Azithromycin, 500mg");
    expect(parsed.rows[0]["description"]).toBe('Antibiotic with "special" coating');
    expect(parsed.rows[1]["name"]).toBe("Normal Tab");
  });

  it("handles multiline quoted values and Windows CRLF endings", () => {
    const csv = "name,notes\r\n\"Medicine A\",\"Line 1\r\nLine 2\"\r\n\"Medicine B\",\"Single line\"\r\n";
    const parsed = parseCsv(csv);

    expect(parsed.rawRowCount).toBe(2);
    expect(parsed.rows[0]["name"]).toBe("Medicine A");
    expect(parsed.rows[0]["notes"]).toBe("Line 1\r\nLine 2");
    expect(parsed.rows[1]["name"]).toBe("Medicine B");
  });

  it("strips UTF-8 BOM if present", () => {
    const bomCsv = "\uFEFFname,code\nItem 1,CODE1";
    const parsed = parseCsv(bomCsv);

    expect(parsed.headers).toEqual(["name", "code"]);
    expect(parsed.rows[0]["name"]).toBe("Item 1");
  });

  it("generates RFC 4180 compliant CSV output", () => {
    const columns = [
      { key: "name", label: "Medicine Name" },
      { key: "notes", label: "Notes" },
    ];
    const records = [
      { name: "Paracetamol, 500mg", notes: 'Requires "caution"' },
      { name: "Cough Syrup", notes: "Normal" },
    ];

    const generated = generateCsv(columns, records);
    expect(generated).toContain('"Paracetamol, 500mg"');
    expect(generated).toContain('"Requires ""caution"""');
    expect(generated).toContain("Cough Syrup,Normal");
  });
});

describe("Medicine CSV import validation", () => {
  it("validates well-formed medicine rows", () => {
    const csv = `name,generic_name,manufacturer,barcode,hsn,gst_rate,safety_limit
Paracetamol 500mg,Paracetamol,Cipla,8901234567890,300490,12,20
Ibuprofen 400mg,Ibuprofen,Abbott,8901234567891,300490,5,10`;

    const result = validateMedicineImportCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(result.validItems.length).toBe(2);
    expect(result.validItems[0].name).toBe("Paracetamol 500mg");
    expect(result.validItems[0].gstRate).toBe(12);
    expect(result.validItems[0].safetyLimit).toBe(20);
  });

  it("detects missing required name and invalid numbers with row numbers", () => {
    const csv = `name,generic_name,gst_rate,safety_limit
,Paracetamol,12,15
Valid Med,Generic Med,-5,15
Another Med,Generic,12,-10`;

    const result = validateMedicineImportCsv(csv);
    expect(result.totalRows).toBe(3);
    expect(result.validCount).toBe(0);
    expect(result.invalidCount).toBe(3);

    // Row 2 is missing name
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].errors).toContain("Medicine name is required");

    // Row 3 has negative GST rate
    expect(result.errors[1].row).toBe(3);
    expect(result.errors[1].errors).toContain("GST rate cannot be negative");

    // Row 4 has negative safety limit
    expect(result.errors[2].row).toBe(4);
    expect(result.errors[2].errors).toContain("Safety limit cannot be negative");
  });

  it("detects in-file duplicate barcodes", () => {
    const csv = `name,barcode
Item One,BC12345
Item Two,BC12345`;

    const result = validateMedicineImportCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(result.errors[0].row).toBe(3);
    expect(result.errors[0].errors[0]).toContain("Duplicate barcode 'BC12345'");
  });
});

describe("Supplier CSV import validation", () => {
  it("validates well-formed supplier rows", () => {
    const csv = `name,code,contact_name,phone,email,gstin,address
Apollo Wholesale,SUP001,Rajesh Kumar,9876543210,orders@apollo.com,07AAAAA0000A1Z5,New Delhi
MedLife Distributors,SUP002,Sunil Sharma,9123456789,info@medlife.in,27ABCDE1234F1Z5,Mumbai`;

    const result = validateSupplierImportCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(result.validItems[0].name).toBe("Apollo Wholesale");
    expect(result.validItems[0].gstin).toBe("07AAAAA0000A1Z5");
  });

  it("reports detailed errors for invalid phone, invalid email, and malformed GSTIN", () => {
    const csv = `name,phone,email,gstin
No Phone Supplier,,test@test.com,07AAAAA0000A1Z5
Bad Email Supplier,9876543210,not-an-email,07AAAAA0000A1Z5
Bad GSTIN Supplier,9876543210,valid@test.com,INVALID_GSTIN_123`;

    const result = validateSupplierImportCsv(csv);
    expect(result.totalRows).toBe(3);
    expect(result.validCount).toBe(0);
    expect(result.invalidCount).toBe(3);

    // Row 2: phone too short
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].errors).toContain("Phone must have at least 7 digits");

    // Row 3: bad email
    expect(result.errors[1].row).toBe(3);
    expect(result.errors[1].errors).toContain("Invalid email format");

    // Row 4: bad GSTIN
    expect(result.errors[2].row).toBe(4);
    expect(result.errors[2].errors).toContain("Invalid GSTIN format (must be 15-character statutory format)");
  });
});

describe("Backup & restore manifest and checksum safety", () => {
  const dummyData = {
    medicines: [{ id: "m1", name: "Paracetamol" }],
    suppliers: [{ id: "s1", name: "Cipla Dist" }],
  };

  it("computes reproducible SHA-256 checksums", () => {
    const checksum1 = computeBackupChecksum(dummyData);
    const checksum2 = computeBackupChecksum(dummyData);
    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("validates valid backup structure and checksum", () => {
    const checksum = computeBackupChecksum(dummyData);
    const validBackup = {
      manifest: {
        version: "1.0",
        format: "pillbills-json-backup",
        storeId: "store-demo",
        storeName: "Demo Pharmacy",
        storeCode: "DEMO",
        exportedAt: new Date().toISOString(),
        exportedBy: { userId: "user-1", username: "owner" },
        tableCounts: { medicines: 1, suppliers: 1 },
        checksum,
      },
      data: dummyData,
    };

    const validation = validateBackupPayload(validBackup, "store-demo");
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
    expect(validation.manifest?.storeCode).toBe("DEMO");
  });

  it("detects tampered backup content where checksum does not match data", () => {
    const originalChecksum = computeBackupChecksum(dummyData);
    const tamperedBackup = {
      manifest: {
        version: "1.0",
        format: "pillbills-json-backup",
        storeId: "store-demo",
        storeName: "Demo Pharmacy",
        storeCode: "DEMO",
        exportedAt: new Date().toISOString(),
        exportedBy: { userId: "user-1", username: "owner" },
        tableCounts: { medicines: 1, suppliers: 1 },
        checksum: originalChecksum,
      },
      data: {
        ...dummyData,
        medicines: [{ id: "m1", name: "Tampered Medicine Name" }],
      },
    };

    const validation = validateBackupPayload(tamperedBackup, "store-demo");
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain("Cryptographic checksum mismatch");
  });

  it("detects store ID mismatch", () => {
    const checksum = computeBackupChecksum(dummyData);
    const payload = {
      manifest: {
        version: "1.0",
        format: "pillbills-json-backup",
        storeId: "store-other",
        storeName: "Other Pharmacy",
        storeCode: "OTHER",
        exportedAt: new Date().toISOString(),
        exportedBy: { userId: "user-1", username: "owner" },
        tableCounts: { medicines: 1, suppliers: 1 },
        checksum,
      },
      data: dummyData,
    };

    const validation = validateBackupPayload(payload, "store-demo");
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain("Store ID mismatch");
  });

  it("enforces explicit confirmation string for restore execution", () => {
    const unconfirmed = canPerformRestore("yes");
    expect(unconfirmed.allowed).toBe(false);
    expect(unconfirmed.message).toContain("CONFIRM_RESTORE");

    const confirmed = canPerformRestore("CONFIRM_RESTORE");
    expect(confirmed.allowed).toBe(true);
  });
});

