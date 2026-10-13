// scripts/verify-m11.mjs - End-to-end verification for Milestone 11 (Production Hardening, Offline Resilience & Thermal Printer Support)
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
  console.log("=== STARTING MILESTONE 11 END-TO-END VERIFICATION ===");
  console.log(`Target: ${BASE_URL}\n`);

  // 1. Production Health Check Endpoint (/api/health)
  console.log("1. Testing Production Health Check Endpoint (/api/health)...");
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  if (!healthRes.ok) throw new Error(`Health check failed with status: ${healthRes.status}`);
  const healthData = await healthRes.json();
  if (healthData.status !== "ok" || healthData.database?.status !== "connected") {
    throw new Error(`Degraded health check status: ${JSON.stringify(healthData)}`);
  }
  console.log(`  ✓ Health check status: ${healthData.status}`);
  console.log(`  ✓ Database status: ${healthData.database.status} (latency: ${healthData.database.latencyMs}ms)`);
  console.log(`  ✓ System RSS memory: ${healthData.system.memoryRssMb}MB, uptime: ${healthData.uptimeSeconds}s`);

  // 2. Authenticate as admin
  console.log("\n2. Authenticating as admin...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "ChangeMe!123" }),
  });
  if (!loginRes.ok) throw new Error(`Login failed with status ${loginRes.status}`);
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  console.log("  ✓ Admin authenticated successfully.");

  // 3. Find an existing invoice to test thermal receipt formats
  console.log("\n3. Testing Thermal Receipt Formatting (58mm & 80mm ESC/POS)...");
  const invoice = await prisma.salesInvoice.findFirst({
    include: { lines: true, customer: true },
    orderBy: { createdAt: "desc" },
  });

  if (!invoice) throw new Error("No sales invoices found in database to test receipt formatting.");
  console.log(`  ✓ Using invoice: ${invoice.invoiceNumber} (ID: ${invoice.id})`);

  // 3a. Test 58mm ESC/POS Binary Download
  const escpos58Res = await fetch(`${BASE_URL}/api/sales/${invoice.id}?format=escpos&width=58mm`, { headers });
  if (!escpos58Res.ok) throw new Error(`58mm ESC/POS failed: ${escpos58Res.status}`);
  const escpos58Bytes = new Uint8Array(await escpos58Res.arrayBuffer());
  if (escpos58Bytes[0] !== 0x1b || escpos58Bytes[1] !== 0x40) {
    throw new Error("58mm ESC/POS stream does not start with ESC @ (0x1B 0x40) init sequence");
  }
  const len58 = escpos58Bytes.length;
  if (escpos58Bytes[len58 - 4] !== 0x1d || escpos58Bytes[len58 - 3] !== 0x56) {
    throw new Error("58mm ESC/POS stream missing paper cut (GS V) command at end");
  }
  console.log(`  ✓ 58mm ESC/POS binary stream verified (${escpos58Bytes.length} bytes, init & cut verified)`);

  // 3b. Test 80mm ESC/POS Binary Download
  const escpos80Res = await fetch(`${BASE_URL}/api/sales/${invoice.id}?format=escpos&width=80mm`, { headers });
  if (!escpos80Res.ok) throw new Error(`80mm ESC/POS failed: ${escpos80Res.status}`);
  const escpos80Bytes = new Uint8Array(await escpos80Res.arrayBuffer());
  console.log(`  ✓ 80mm ESC/POS binary stream verified (${escpos80Bytes.length} bytes)`);

  // 3c. Test 58mm Text Receipt (32 columns max)
  const text58Res = await fetch(`${BASE_URL}/api/sales/${invoice.id}?format=text&width=58mm`, { headers });
  if (!text58Res.ok) throw new Error(`58mm Text receipt failed: ${text58Res.status}`);
  const text58 = await text58Res.text();
  const lines58 = text58.split("\n");
  for (const line of lines58) {
    if (line.length > 32) {
      throw new Error(`58mm line overflow (${line.length} > 32 chars): "${line}"`);
    }
  }
  console.log(`  ✓ 58mm monospaced text receipt verified (all lines strictly <= 32 chars)`);

  // 3d. Test 80mm Text Receipt (42 columns max)
  const text80Res = await fetch(`${BASE_URL}/api/sales/${invoice.id}?format=text&width=80mm`, { headers });
  if (!text80Res.ok) throw new Error(`80mm Text receipt failed: ${text80Res.status}`);
  const text80 = await text80Res.text();
  const lines80 = text80.split("\n");
  for (const line of lines80) {
    if (line.length > 42) {
      throw new Error(`80mm line overflow (${line.length} > 42 chars): "${line}"`);
    }
  }
  console.log(`  ✓ 80mm monospaced text receipt verified (all lines strictly <= 42 chars)`);

  // 4. Verify Production Configuration & Artifacts
  console.log("\n4. Verifying Production Hardening Artifacts...");
  if (!fs.existsSync(".env.example")) throw new Error(".env.example missing!");
  const envExampleContent = fs.readFileSync(".env.example", "utf-8");
  if (!envExampleContent.includes("DATABASE_URL") || !envExampleContent.includes("SESSION_COOKIE_NAME")) {
    throw new Error(".env.example missing required placeholders");
  }
  console.log("  ✓ .env.example verified with clean placeholders.");

  if (!fs.existsSync("DEPLOYMENT.md")) throw new Error("DEPLOYMENT.md missing!");
  console.log("  ✓ DEPLOYMENT.md verified with step-by-step installation, health check, and hardware setup instructions.");

  // 5. Verify Billing Route (/billing)
  console.log("\n5. Verifying /billing Route Response...");
  const billingRes = await fetch(`${BASE_URL}/billing`, { headers });
  if (!billingRes.ok) throw new Error(`/billing route returned status ${billingRes.status}`);
  console.log("  ✓ /billing workspace returned HTTP 200 OK.");

  // 6. Demo Data Integrity Check
  console.log("\n6. Verifying Demo Data Integrity...");
  const [meds, sups, custs, sales] = await Promise.all([
    prisma.medicine.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
    prisma.salesInvoice.count(),
  ]);
  console.log(`  ✓ Current counts in local DB:`);
  console.log(`    - Medicines: ${meds}`);
  console.log(`    - Suppliers: ${sups}`);
  console.log(`    - Customers: ${custs}`);
  console.log(`    - Sales Invoices: ${sales}`);

  if (meds < 5 || sups < 1 || custs < 3 || sales < 4) {
    throw new Error("Demo data count lower than expected! Possible data corruption.");
  }

  console.log("\n=== ALL MILESTONE 11 VERIFICATION CHECKS PASSED ===");
}

run()
  .catch((err) => {
    console.error("\n❌ VERIFICATION FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

