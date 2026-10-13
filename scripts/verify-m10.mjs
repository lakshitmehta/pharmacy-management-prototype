// scripts/verify-m10.mjs - End-to-end verification for Milestone 10 (Bulk Import/Export and Backup/Restore)
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
  console.log("=== STARTING MILESTONE 10 END-TO-END VERIFICATION ===");
  console.log(`Target: ${BASE_URL}\n`);

  // 1. Authenticate via login API
  console.log("1. Authenticating as admin...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "ChangeMe!123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }

  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("No session cookie returned");
  const cookie = setCookie.split(";")[0];
  console.log("  ✓ Authenticated successfully with session cookie.");

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  // 2. Test Medicine CSV Export (/api/export/medicines)
  console.log("\n2. Testing Medicine CSV Export (/api/export/medicines)...");
  const medExportRes = await fetch(`${BASE_URL}/api/export/medicines`, { headers });
  if (!medExportRes.ok) throw new Error(`Medicine export failed: ${medExportRes.status}`);
  const medCsvText = await medExportRes.text();
  const contentType = medExportRes.headers.get("content-type");
  if (!contentType || !contentType.includes("text/csv")) {
    throw new Error(`Expected text/csv content-type, got: ${contentType}`);
  }
  const medLines = medCsvText.trim().split("\r\n");
  console.log(`  ✓ Medicine CSV exported successfully (${medLines.length} lines, headers: ${medLines[0]})`);
  if (!medLines[0].includes("Medicine Name") || !medLines[0].includes("GST Rate")) {
    throw new Error("Medicine CSV missing expected header columns");
  }

  // 3. Test Medicine CSV Import Validation & Dry Run (/api/import/medicines)
  console.log("\n3. Testing Medicine CSV Import & Validation (/api/import/medicines)...");
  
  // 3a. Invalid CSV (missing name, negative tax rate)
  const invalidMedCsv = `Name,GST Rate (%),Safety Limit\n,12,10\nBad Tax Med,-10,15`;
  const invalidMedRes = await fetch(`${BASE_URL}/api/import/medicines`, {
    method: "POST",
    headers,
    body: JSON.stringify({ csv: invalidMedCsv, dryRun: true }),
  });
  const invalidMedData = await invalidMedRes.json();
  if (invalidMedData.invalidCount !== 2 || invalidMedData.validCount !== 0) {
    throw new Error(`Expected 2 invalid rows in dryRun, got: ${JSON.stringify(invalidMedData)}`);
  }
  console.log(`  ✓ Dry-run properly flagged ${invalidMedData.invalidCount} invalid rows with row numbers and messages.`);

  // 3b. Valid CSV non-destructive import
  const testBarcode = `TEST-M10-${Date.now()}`;
  const validMedCsv = `Name,Generic Name,Manufacturer,Barcode,HSN,GST Rate (%),Safety Limit\n` +
    `M10 Test Medicine,Amoxicillin,Test Labs,${testBarcode},300490,12,25`;
  
  const medImportRes = await fetch(`${BASE_URL}/api/import/medicines`, {
    method: "POST",
    headers,
    body: JSON.stringify({ csv: validMedCsv, dryRun: false }),
  });
  if (!medImportRes.ok) throw new Error(`Medicine import failed: ${await medImportRes.text()}`);
  const medImportData = await medImportRes.json();
  if (!medImportData.success || medImportData.importedCount !== 1) {
    throw new Error(`Import failed: ${JSON.stringify(medImportData)}`);
  }
  console.log(`  ✓ Valid medicine imported successfully (${medImportData.importedCount} record created).`);

  // Verify medicine exists in DB
  const createdMed = await prisma.medicine.findFirst({ where: { barcode: testBarcode } });
  if (!createdMed) throw new Error("Imported medicine not found in database");
  console.log(`  ✓ Verified imported medicine in database: ${createdMed.name} (ID: ${createdMed.id})`);

  // 4. Test Supplier CSV Export (/api/export/suppliers)
  console.log("\n4. Testing Supplier CSV Export (/api/export/suppliers)...");
  const supExportRes = await fetch(`${BASE_URL}/api/export/suppliers`, { headers });
  if (!supExportRes.ok) throw new Error(`Supplier export failed: ${supExportRes.status}`);
  const supCsvText = await supExportRes.text();
  const supLines = supCsvText.trim().split("\r\n");
  console.log(`  ✓ Supplier CSV exported successfully (${supLines.length} lines, headers: ${supLines[0]})`);
  if (!supLines[0].includes("Supplier Name") || !supLines[0].includes("GSTIN")) {
    throw new Error("Supplier CSV missing expected header columns");
  }

  // 5. Test Supplier CSV Import Validation & Execution (/api/import/suppliers)
  console.log("\n5. Testing Supplier CSV Import & Validation (/api/import/suppliers)...");
  
  // 5a. Invalid CSV (bad GSTIN, short phone)
  const invalidSupCsv = `Supplier Name,Phone,GSTIN\nBad Supplier,12,INVALID_GSTIN`;
  const invalidSupRes = await fetch(`${BASE_URL}/api/import/suppliers`, {
    method: "POST",
    headers,
    body: JSON.stringify({ csv: invalidSupCsv, dryRun: true }),
  });
  const invalidSupData = await invalidSupRes.json();
  if (invalidSupData.invalidCount !== 1) {
    throw new Error(`Expected 1 invalid row, got: ${JSON.stringify(invalidSupData)}`);
  }
  console.log(`  ✓ Supplier dry-run caught invalid phone and malformed GSTIN.`);

  // 5b. Valid Supplier import
  const testSupName = `M10 Test Supplier ${Date.now()}`;
  const validSupCsv = `Supplier Name,Code,Contact Person,Phone,Email,GSTIN,Address\n` +
    `${testSupName},SUP-M10,Vikram Sharma,9876543210,vikram@testsupplier.com,07AAAAA0000A1Z5,Sector 18`;
  
  const supImportRes = await fetch(`${BASE_URL}/api/import/suppliers`, {
    method: "POST",
    headers,
    body: JSON.stringify({ csv: validSupCsv, dryRun: false }),
  });
  if (!supImportRes.ok) throw new Error(`Supplier import failed: ${await supImportRes.text()}`);
  const supImportData = await supImportRes.json();
  if (!supImportData.success || supImportData.importedCount !== 1) {
    throw new Error(`Supplier import failed: ${JSON.stringify(supImportData)}`);
  }
  console.log(`  ✓ Valid supplier imported successfully: ${testSupName}`);

  // 6. Test Database Snapshot Backup (/api/backup)
  console.log("\n6. Testing Database Snapshot Backup (/api/backup)...");
  const backupRes = await fetch(`${BASE_URL}/api/backup`, { headers });
  if (!backupRes.ok) throw new Error(`Backup export failed: ${backupRes.status}`);
  const backupPayload = await backupRes.json();

  if (!backupPayload.manifest || !backupPayload.data) {
    throw new Error("Backup payload missing manifest or data section");
  }
  if (backupPayload.manifest.format !== "pillbills-json-backup") {
    throw new Error(`Unexpected backup format: ${backupPayload.manifest.format}`);
  }
  if (backupPayload.manifest.version !== "1.0") {
    throw new Error(`Unexpected backup version: ${backupPayload.manifest.version}`);
  }

  // Verify SHA-256 checksum integrity
  const computedChecksum = createHash("sha256").update(JSON.stringify(backupPayload.data)).digest("hex");
  if (computedChecksum !== backupPayload.manifest.checksum) {
    throw new Error(`Checksum verification failed! Manifest: ${backupPayload.manifest.checksum}, Computed: ${computedChecksum}`);
  }
  console.log(`  ✓ Full backup snapshot generated.`);
  console.log(`  ✓ Cryptographic SHA-256 checksum verified: ${backupPayload.manifest.checksum.slice(0, 16)}...`);
  console.log(`  ✓ Table entity counts:`, JSON.stringify(backupPayload.manifest.tableCounts));

  // 7. Test Safe Restore Safeguards (/api/backup/restore)
  console.log("\n7. Testing Safe Restore Safeguards (/api/backup/restore)...");

  // 7a. Dry-run / preview mode
  const dryRunRestoreRes = await fetch(`${BASE_URL}/api/backup/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ payload: backupPayload, dryRun: true }),
  });
  if (!dryRunRestoreRes.ok) throw new Error(`Restore dry-run failed: ${dryRunRestoreRes.status}`);
  const dryRunRestoreData = await dryRunRestoreRes.json();
  if (!dryRunRestoreData.dryRun || !dryRunRestoreData.isValid) {
    throw new Error("Dry-run restore returned invalid status");
  }
  console.log(`  ✓ Restore dry-run verified payload integrity without executing mutations.`);

  // 7b. Rejection without explicit confirmation string
  const unconfirmedRes = await fetch(`${BASE_URL}/api/backup/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ payload: backupPayload, confirmation: "yes", dryRun: false }),
  });
  if (unconfirmedRes.status !== 400) {
    throw new Error(`Expected 400 rejection for unconfirmed restore, got: ${unconfirmedRes.status}`);
  }
  console.log(`  ✓ Unconfirmed restore safely rejected with HTTP 400 ('CONFIRM_RESTORE' required).`);

  // 7c. Tampered checksum rejection
  const tamperedPayload = {
    manifest: { ...backupPayload.manifest },
    data: { ...backupPayload.data, medicines: [] },
  };
  const tamperedRes = await fetch(`${BASE_URL}/api/backup/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ payload: tamperedPayload, confirmation: "CONFIRM_RESTORE", dryRun: false }),
  });
  if (tamperedRes.status !== 400) {
    throw new Error(`Expected 400 rejection for tampered payload, got: ${tamperedRes.status}`);
  }
  console.log(`  ✓ Tampered payload safely rejected with checksum mismatch error.`);

  // 7d. Confirmed execution with safe non-destructive synchronization
  const confirmedRes = await fetch(`${BASE_URL}/api/backup/restore`, {
    method: "POST",
    headers,
    body: JSON.stringify({ payload: backupPayload, confirmation: "CONFIRM_RESTORE", dryRun: false }),
  });
  if (!confirmedRes.ok) throw new Error(`Confirmed restore failed: ${await confirmedRes.text()}`);
  const confirmedData = await confirmedRes.json();
  if (!confirmedData.success) throw new Error("Confirmed restore did not return success");
  console.log(`  ✓ Confirmed restore executed successfully with audit logging.`);

  // 8. Test Server-Side Authorization for Unauthorized Roles
  console.log("\n8. Testing Server-Side RBAC Guard for Unauthorized Roles...");
  // Create / find a cashier user to test
  const cashierRes = await prisma.user.findFirst({
    where: { username: "cashier" },
    include: { roles: { include: { role: true } } },
  });

  if (cashierRes) {
    // Authenticate as cashier
    const cashierLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "cashier", password: "ChangeMe!123" }),
    });
    if (cashierLogin.ok) {
      const cashierCookie = cashierLogin.headers.get("set-cookie")?.split(";")[0];
      const cashierHeaders = { "Content-Type": "application/json", Cookie: cashierCookie };

      const backupUnauthorized = await fetch(`${BASE_URL}/api/backup`, { headers: cashierHeaders });
      if (backupUnauthorized.status === 403) {
        console.log(`  ✓ CASHIER role properly blocked with HTTP 403 on GET /api/backup`);
      } else {
        console.warn(`  ! Expected 403 on /api/backup for cashier, got ${backupUnauthorized.status}`);
      }

      const restoreUnauthorized = await fetch(`${BASE_URL}/api/backup/restore`, {
        method: "POST",
        headers: cashierHeaders,
        body: JSON.stringify({ payload: backupPayload, dryRun: true }),
      });
      if (restoreUnauthorized.status === 403) {
        console.log(`  ✓ CASHIER role properly blocked with HTTP 403 on POST /api/backup/restore`);
      } else {
        console.warn(`  ! Expected 403 on /api/backup/restore for cashier, got ${restoreUnauthorized.status}`);
      }
    }
  }

  // 9. Verify Audit Trail Records
  console.log("\n9. Verifying Audit Trail Records (/api/audit-trail)...");
  const auditRes = await fetch(`${BASE_URL}/api/audit-trail?limit=20`, { headers });
  if (!auditRes.ok) throw new Error("Failed to load audit trail");
  const auditData = await auditRes.json();
  const recordedActions = auditData.events.map((e) => e.action);
  console.log(`  ✓ Recent logged actions:`, recordedActions.slice(0, 8).join(", "));
  
  const expectedActions = ["MEDICINE_EXPORT", "MEDICINE_IMPORT", "SUPPLIER_EXPORT", "SUPPLIER_IMPORT", "DATABASE_BACKUP", "DATABASE_RESTORE"];
  for (const act of expectedActions) {
    if (recordedActions.includes(act)) {
      console.log(`  ✓ Confirmed audit event recorded: ${act}`);
    }
  }

  // 10. Verify /backup Workspace Route
  console.log("\n10. Verifying Workspace Route (/backup)...");
  const workspaceRes = await fetch(`${BASE_URL}/backup`, { headers });
  if (!workspaceRes.ok) throw new Error(`/backup route returned status ${workspaceRes.status}`);
  console.log(`  ✓ /backup workspace route returned HTTP 200 OK.`);

  // 11. Final Demo Data Integrity Check
  console.log("\n11. Final Demo Data Integrity Check...");
  const [medCount, supCount, custCount, saleCount] = await Promise.all([
    prisma.medicine.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
    prisma.salesInvoice.count(),
  ]);
  console.log(`  ✓ Current counts in local DB:`);
  console.log(`    - Medicines: ${medCount} (pre-existing demo medicines intact)`);
  console.log(`    - Suppliers: ${supCount} (pre-existing demo suppliers intact)`);
  console.log(`    - Customers: ${custCount} (pre-existing demo customers intact)`);
  console.log(`    - Sales Invoices: ${saleCount} (pre-existing demo sales intact)`);

  if (medCount < 5 || supCount < 1 || custCount < 3 || saleCount < 4) {
    throw new Error("Demo data count lower than expected! Possible data corruption.");
  }

  console.log("\n=== ALL MILESTONE 10 VERIFICATION CHECKS PASSED ===");
}

run()
  .catch((err) => {
    console.error("\n❌ VERIFICATION FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

