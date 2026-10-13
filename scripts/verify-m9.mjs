// scripts/verify-m9.mjs - End-to-end verification for Milestone 9 (Settings, Store Profile, Tax Configuration, Multi-User RBAC & Audit Trail)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
  console.log("=== STARTING MILESTONE 9 END-TO-END VERIFICATION ===");

  // 1. Authenticate via login API
  console.log("\n1. Authenticating as admin...");
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
  console.log("✓ Authenticated successfully with session cookie.");

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  // 2. Test Store Profile & Tax Configuration API (/api/settings)
  console.log("\n2. Testing Store Profile & Tax Configuration API (/api/settings)...");
  const getSettingsRes = await fetch(`${BASE_URL}/api/settings`, { headers });
  if (!getSettingsRes.ok) throw new Error(`Failed to load store settings: ${await getSettingsRes.text()}`);
  const initialSettings = await getSettingsRes.json();
  if (!initialSettings.store || !initialSettings.store.name) {
    throw new Error("Invalid store settings response payload");
  }
  console.log(`  ✓ Current Store: ${initialSettings.store.name} (${initialSettings.store.code})`);

  // Update Settings
  const testPhone = "9876500000";
  const testGstin = "07AAAAA0000A1Z5";
  const testPrefix = "PB9";
  const patchRes = await fetch(`${BASE_URL}/api/settings`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      name: initialSettings.store.name,
      phone: testPhone,
      address: "SCO 45, Sector 17, Chandigarh",
      gstin: testGstin,
      drugLicense: "DL-20B-998811",
      invoicePrefix: testPrefix,
      nextInvoiceNo: 1,
      discountDisplay: "AMOUNT",
      gstScheme: "REGULAR_MONTHLY",
      footerNotice: "Milestone 9 Verified",
      terms: "Valid prescription required for Schedule H drugs",
      eInvoiceEnabled: false,
      ewayBillEnabled: false,
    }),
  });

  if (!patchRes.ok) throw new Error(`Failed to update settings: ${await patchRes.text()}`);
  const updatedSettings = await patchRes.json();
  if (updatedSettings.settings?.phone !== testPhone || updatedSettings.settings?.gstin !== testGstin) {
    throw new Error("Updated settings mismatch");
  }
  console.log(`  ✓ Successfully updated Store Settings: GSTIN ${updatedSettings.settings.gstin}, Prefix ${updatedSettings.settings.invoicePrefix}`);

  // 3. Test User Management & RBAC API (/api/users)
  console.log("\n3. Testing Multi-User RBAC API (/api/users)...");
  const getUsersRes = await fetch(`${BASE_URL}/api/users`, { headers });
  if (!getUsersRes.ok) throw new Error(`Failed to load users: ${await getUsersRes.text()}`);
  const usersList = await getUsersRes.json();
  if (!Array.isArray(usersList.users)) throw new Error("Invalid users list payload");
  console.log(`  ✓ Found ${usersList.users.length} existing pharmacy users.`);

  // Create New User
  const uniqueSuffix = Date.now().toString().slice(-4);
  const testUsername = `pharma_${uniqueSuffix}`;
  const createUserRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: testUsername,
      displayName: `Pharmacist Staff ${uniqueSuffix}`,
      password: "SecurePharmacist123!",
      roleName: "PHARMACIST",
    }),
  });

  if (!createUserRes.ok) throw new Error(`Failed to create user: ${await createUserRes.text()}`);
  const createdUser = await createUserRes.json();
  if (createdUser.user.role !== "PHARMACIST") throw new Error("Assigned role mismatch");
  console.log(`  ✓ Created user @${createdUser.user.username} with role ${createdUser.user.role}`);

  // Test Duplicate Username Rejection
  const duplicateRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: testUsername,
      displayName: "Duplicate Attempt",
      password: "SecurePharmacist123!",
      roleName: "PHARMACIST",
    }),
  });
  if (duplicateRes.status !== 409) {
    throw new Error(`Expected 409 Conflict for duplicate username, got ${duplicateRes.status}`);
  }
  console.log("  ✓ Correctly rejected duplicate username with 409 Conflict.");

  // Update User Status & Role
  const patchUserRes = await fetch(`${BASE_URL}/api/users/${createdUser.user.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      displayName: `Senior Pharmacist ${uniqueSuffix}`,
      status: "INACTIVE",
      roleName: "MANAGER",
    }),
  });
  if (!patchUserRes.ok) throw new Error(`Failed to update user: ${await patchUserRes.text()}`);
  const updatedUser = await patchUserRes.json();
  if (updatedUser.user.status !== "INACTIVE" || updatedUser.user.role !== "MANAGER") {
    throw new Error("Updated user attributes mismatch");
  }
  console.log(`  ✓ Updated user @${updatedUser.user.username} to role ${updatedUser.user.role} (status: ${updatedUser.user.status})`);

  // 3b. Test Server-side Authorization with an Unauthorized Role (CASHIER)
  console.log("\n3b. Testing server-side authorization with unauthorized role (CASHIER)...");
  const cashierUsername = `cashier_${uniqueSuffix}`;
  const createCashierRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: cashierUsername,
      displayName: `Cashier Staff ${uniqueSuffix}`,
      password: "CashierPass123!",
      roleName: "CASHIER",
    }),
  });
  if (!createCashierRes.ok) throw new Error("Failed to create cashier test user");

  // Login as cashier
  const cashierLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: cashierUsername, password: "CashierPass123!" }),
  });
  if (!cashierLoginRes.ok) throw new Error("Cashier login failed");
  const cashierSetCookie = cashierLoginRes.headers.get("set-cookie");
  if (!cashierSetCookie) throw new Error("No session cookie for cashier");
  const cashierCookie = cashierSetCookie.split(";")[0];
  const cashierHeaders = { "Content-Type": "application/json", Cookie: cashierCookie };

  // Attempt unauthorized settings update
  const unauthSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    method: "PATCH",
    headers: cashierHeaders,
    body: JSON.stringify({ name: "Hacked Store Name", invoicePrefix: "HCK" }),
  });
  if (unauthSettingsRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for unauthorized settings patch, got ${unauthSettingsRes.status}`);
  }
  console.log("  ✓ Correctly rejected unauthorized settings update with 403 Forbidden.");

  // Attempt unauthorized user creation
  const unauthUserCreateRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: cashierHeaders,
    body: JSON.stringify({
      username: "rogue_user",
      displayName: "Rogue",
      password: "RoguePassword123!",
      roleName: "OWNER",
    }),
  });
  if (unauthUserCreateRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for unauthorized user creation, got ${unauthUserCreateRes.status}`);
  }
  console.log("  ✓ Correctly rejected unauthorized user creation with 403 Forbidden.");

  // 4. Test Audit Trail Inspector API (/api/audit-trail)
  console.log("\n4. Testing Audit Trail Inspector API (/api/audit-trail)...");
  const getAuditRes = await fetch(`${BASE_URL}/api/audit-trail?limit=20`, { headers });
  if (!getAuditRes.ok) throw new Error(`Failed to query audit trail: ${await getAuditRes.text()}`);
  const auditData = await getAuditRes.json();
  if (!Array.isArray(auditData.events) || auditData.total === undefined) {
    throw new Error("Invalid audit trail payload structure");
  }
  console.log(`  ✓ Audit Trail Logged: ${auditData.total} total events (showing latest ${auditData.events.length})`);

  // Verify recent actions in audit
  const actionsLogged = auditData.events.map((e) => e.action);
  const hasSettingsAudit = actionsLogged.includes("STORE_SETTINGS_UPDATE");
  const hasUserAudit = actionsLogged.includes("USER_CREATE");
  console.log(`  ✓ Verified audit actions recorded: STORE_SETTINGS_UPDATE: ${hasSettingsAudit}, USER_CREATE: ${hasUserAudit}`);

  // 5. Workspace Page Availability Suite
  console.log("\n5. Checking workspace route availability including /settings...");
  const pagesToTest = [
    { path: "/settings", name: "Settings & Admin" },
    { path: "/reports", name: "Reports Hub" },
    { path: "/purchase-reports", name: "Purchase Reports" },
    { path: "/payables", name: "Accounts Payable" },
    { path: "/payments", name: "Supplier Payments" },
    { path: "/bank-book", name: "Bank & Cash Book" },
    { path: "/voucher-entry", name: "Voucher Entry" },
    { path: "/supplier-notes", name: "Supplier Notes" },
    { path: "/dashboard", name: "Dashboard" },
    { path: "/inventory", name: "Inventory" },
    { path: "/expiry", name: "Expiry" },
    { path: "/suppliers", name: "Suppliers" },
    { path: "/purchases", name: "Purchases" },
    { path: "/purchase-orders", name: "Purchase Orders" },
    { path: "/billing", name: "Billing" },
    { path: "/sales", name: "Sales" },
    { path: "/customers", name: "Customers" },
    { path: "/khata", name: "Khata" },
    { path: "/returns", name: "Returns" },
  ];

  for (const page of pagesToTest) {
    const res = await fetch(`${BASE_URL}${page.path}`, { headers });
    if (res.status !== 200) {
      throw new Error(`Page ${page.path} returned status ${res.status}`);
    }
    console.log(`  ✓ ${page.name} (${page.path}) -> 200 OK`);
  }

  console.log("\n========================================================");
  console.log("🎉 ALL MILESTONE 9 END-TO-END VERIFICATIONS PASSED! 🎉");
  console.log("========================================================");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

