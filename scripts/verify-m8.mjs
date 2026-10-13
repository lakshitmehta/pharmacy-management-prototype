// scripts/verify-m8.mjs - End-to-end verification for Milestone 8 (Reports Hub & Procurement Intelligence)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
  console.log("=== STARTING MILESTONE 8 END-TO-END VERIFICATION ===");

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

  // 2. Test Sales Reports API
  console.log("\n2. Testing Sales Reports Hub API (/api/reports/sales)...");
  // 2a. Day Book
  const salesDayBookRes = await fetch(`${BASE_URL}/api/reports/sales?subReport=day-book`, { headers });
  if (!salesDayBookRes.ok) throw new Error(`Failed to load sales day book: ${await salesDayBookRes.text()}`);
  const salesDayBook = await salesDayBookRes.json();
  if (!Array.isArray(salesDayBook.invoices) || !salesDayBook.metrics) {
    throw new Error("Invalid sales day-book payload structure");
  }
  console.log(`  ✓ Sales Day Book: ${salesDayBook.invoices.length} invoices, Total Sales: ₹${salesDayBook.metrics.totalSales}`);

  // 2b. Item-wise sales
  const salesItemRes = await fetch(`${BASE_URL}/api/reports/sales?subReport=item-wise`, { headers });
  if (!salesItemRes.ok) throw new Error(`Failed to load item-wise sales: ${await salesItemRes.text()}`);
  const salesItem = await salesItemRes.json();
  if (!Array.isArray(salesItem.items)) throw new Error("Invalid item-wise sales response");
  console.log(`  ✓ Item-wise Sales: ${salesItem.items.length} aggregated item records`);

  // 2c. Party-wise sales
  const salesPartyRes = await fetch(`${BASE_URL}/api/reports/sales?subReport=party-wise`, { headers });
  if (!salesPartyRes.ok) throw new Error(`Failed to load party-wise sales: ${await salesPartyRes.text()}`);
  const salesParty = await salesPartyRes.json();
  if (!Array.isArray(salesParty.parties)) throw new Error("Invalid party-wise sales response");
  console.log(`  ✓ Party-wise Sales: ${salesParty.parties.length} customer records`);

  // 2d. Discount analysis
  const salesDiscountRes = await fetch(`${BASE_URL}/api/reports/sales?subReport=discount-analysis`, { headers });
  if (!salesDiscountRes.ok) throw new Error(`Failed to load discount analysis: ${await salesDiscountRes.text()}`);
  const salesDiscount = await salesDiscountRes.json();
  if (!Array.isArray(salesDiscount.invoices)) throw new Error("Invalid discount analysis response");
  console.log(`  ✓ Discount Analysis: ${salesDiscount.invoices.length} discounted sales, Total Discount: ₹${salesDiscount.metrics.totalDiscount}`);

  // 3. Test Purchase Reports API
  console.log("\n3. Testing Purchase Reports API (/api/reports/purchases & /api/purchase-reports)...");
  // 3a. Purchase Day Book
  const purDayBookRes = await fetch(`${BASE_URL}/api/reports/purchases?subReport=day-book`, { headers });
  if (!purDayBookRes.ok) throw new Error(`Failed to load purchase day book: ${await purDayBookRes.text()}`);
  const purDayBook = await purDayBookRes.json();
  if (!Array.isArray(purDayBook.invoices) || !purDayBook.metrics) {
    throw new Error("Invalid purchase day-book payload structure");
  }
  console.log(`  ✓ Purchase Day Book: ${purDayBook.invoices.length} invoices, Total Purchases: ₹${purDayBook.metrics.totalPurchases}`);

  // 3b. Item-wise purchases
  const purItemRes = await fetch(`${BASE_URL}/api/reports/purchases?subReport=item-wise`, { headers });
  if (!purItemRes.ok) throw new Error(`Failed to load item-wise purchases: ${await purItemRes.text()}`);
  const purItem = await purItemRes.json();
  if (!Array.isArray(purItem.items)) throw new Error("Invalid item-wise purchase response");
  console.log(`  ✓ Item-wise Purchases: ${purItem.items.length} aggregated item records`);

  // 3c. Vendor analytics
  const purVendorRes = await fetch(`${BASE_URL}/api/reports/purchases?subReport=vendor-analytics`, { headers });
  if (!purVendorRes.ok) throw new Error(`Failed to load vendor analytics: ${await purVendorRes.text()}`);
  const purVendor = await purVendorRes.json();
  if (!Array.isArray(purVendor.vendors)) throw new Error("Invalid vendor analytics response");
  console.log(`  ✓ Vendor Analytics: ${purVendor.vendors.length} vendors tracked`);

  // 3d. Dedicated Purchase Intelligence API (/api/purchase-reports)
  const dedicatedPurRes = await fetch(`${BASE_URL}/api/purchase-reports`, { headers });
  if (!dedicatedPurRes.ok) throw new Error(`Failed to load dedicated purchase reports: ${await dedicatedPurRes.text()}`);
  const dedicatedPur = await dedicatedPurRes.json();
  if (!Array.isArray(dedicatedPur.purchases) || !Array.isArray(dedicatedPur.monthlyTrends) || !Array.isArray(dedicatedPur.vendorDistribution)) {
    throw new Error("Invalid /api/purchase-reports payload structure");
  }
  console.log(`  ✓ Procurement Intelligence: ${dedicatedPur.purchases.length} bills, ${dedicatedPur.monthlyTrends.length} monthly cohorts, ₹${dedicatedPur.metrics.totalProcurement} total spend`);

  // 4. Test Inventory Valuation & Velocity Reports
  console.log("\n4. Testing Inventory Analytics API (/api/reports/inventory)...");
  // 4a. Valuation
  const invValRes = await fetch(`${BASE_URL}/api/reports/inventory?type=valuation`, { headers });
  if (!invValRes.ok) throw new Error(`Failed to load inventory valuation: ${await invValRes.text()}`);
  const invVal = await invValRes.json();
  if (!Array.isArray(invVal.items) || !invVal.totals) throw new Error("Invalid inventory valuation response");
  console.log(`  ✓ Inventory Valuation: ${invVal.items.length} batches evaluated, Total Cost: ₹${invVal.totals.totalCost}, Total MRP: ₹${invVal.totals.totalMrp}, Potential Margin: ₹${invVal.totals.potentialProfit}`);

  // 4b. Stock Velocity
  const invVelRes = await fetch(`${BASE_URL}/api/reports/inventory?type=velocity`, { headers });
  if (!invVelRes.ok) throw new Error(`Failed to load inventory velocity: ${await invVelRes.text()}`);
  const invVel = await invVelRes.json();
  if (!Array.isArray(invVel.items)) throw new Error("Invalid inventory velocity response");
  const fastCount = invVel.items.filter((i) => i.classification === "FAST").length;
  const normalCount = invVel.items.filter((i) => i.classification === "NORMAL").length;
  const slowCount = invVel.items.filter((i) => i.classification === "SLOW").length;
  console.log(`  ✓ Stock Velocity: ${invVel.items.length} items analyzed (Fast: ${fastCount}, Normal: ${normalCount}, Slow: ${slowCount})`);

  // 4c. Reorder alerts
  const invReorderRes = await fetch(`${BASE_URL}/api/reports/inventory?type=reorder`, { headers });
  if (!invReorderRes.ok) throw new Error(`Failed to load reorder alerts: ${await invReorderRes.text()}`);
  const invReorder = await invReorderRes.json();
  if (!Array.isArray(invReorder.alerts)) throw new Error("Invalid inventory reorder response");
  console.log(`  ✓ Reorder Alerts: ${invReorder.alerts.length} low stock items identified`);

  // 5. Test GST Registers (GSTR-1, GSTR-2, GSTR-3B, HSN)
  console.log("\n5. Testing GST Registers & Tax Summary API (/api/reports/gst)...");
  const gstRes = await fetch(`${BASE_URL}/api/reports/gst`, { headers });
  if (!gstRes.ok) throw new Error(`Failed to load GST reports: ${await gstRes.text()}`);
  const gst = await gstRes.json();

  if (!gst.gstr1 || !gst.gstr2 || !gst.gstr3b || !Array.isArray(gst.hsnSummary)) {
    throw new Error("Invalid GST payload structure");
  }

  console.log(`  ✓ GSTR-1 Outward Supply: B2B: ${gst.gstr1.b2b.length}, B2C Slabs: ${gst.gstr1.b2c.length}, Outward Tax: ₹${gst.gstr1.summary.totalTax}`);
  console.log(`  ✓ GSTR-2 Inward ITC: Inward Supplies: ${gst.gstr2.inwardSupplies.length}, Eligible ITC: ₹${gst.gstr2.summary.totalEligibleItc}`);
  console.log(`  ✓ GSTR-3B Net Liability: Outward ₹${gst.gstr3b.outwardTax} - Eligible ITC ₹${gst.gstr3b.eligibleItc} = Net Tax Payable ₹${gst.gstr3b.netPayable}`);
  console.log(`  ✓ HSN Summary: ${gst.hsnSummary.length} HSN code classifications verified`);

  // 6. Test Financial P&L and Day Close API
  console.log("\n6. Testing Financial Statements & Day Close API (/api/reports/financial)...");
  const finRes = await fetch(`${BASE_URL}/api/reports/financial`, { headers });
  if (!finRes.ok) throw new Error(`Failed to load financial reports: ${await finRes.text()}`);
  const fin = await finRes.json();

  if (!fin.profitAndLoss || !fin.dayCloseSummary) {
    throw new Error("Invalid financial payload structure");
  }

  const pl = fin.profitAndLoss;
  console.log(`  ✓ Profit & Loss Statement:`);
  console.log(`      Revenue (Sales):        ₹${pl.netSalesRevenue.toFixed(2)}`);
  console.log(`      Opening Stock:          ₹${pl.openingStockCost.toFixed(2)}`);
  console.log(`      Net Purchases:        + ₹${pl.netPurchasesCost.toFixed(2)}`);
  console.log(`      Closing Stock:        - ₹${pl.closingStockCost.toFixed(2)}`);
  console.log(`      ---------------------------------------`);
  console.log(`      Cost of Goods Sold:     ₹${pl.cogs.toFixed(2)}`);
  console.log(`      Gross Profit:           ₹${pl.grossProfit.toFixed(2)} (${pl.grossMarginPercent.toFixed(1)}%)`);
  console.log(`      Operating Expenses:   - ₹${pl.operatingExpenses.toFixed(2)}`);
  console.log(`      ---------------------------------------`);
  console.log(`      Net Operating Profit:   ₹${pl.netOperatingProfit.toFixed(2)}`);

  const dc = fin.dayCloseSummary;
  console.log(`  ✓ Day Close Reconciliation:`);
  console.log(`      Date:                   ${dc.date}`);
  console.log(`      Opening Cash:           ₹${dc.totalOpeningCash.toFixed(2)}`);
  console.log(`      Cash Inflows:         + ₹${dc.cashInflows.toFixed(2)}`);
  console.log(`      Cash Outflows:        - ₹${dc.cashOutflows.toFixed(2)}`);
  console.log(`      Expected Drawer Cash:   ₹${dc.expectedClosingCash.toFixed(2)}`);

  // 7. Workspace Page Availability & Regression Suite Across All Milestones
  console.log("\n7. Checking workspace page availability and regression across ALL milestones...");
  const pagesToTest = [
    // Milestone 8
    { path: "/reports", name: "Reports Hub" },
    { path: "/purchase-reports", name: "Purchase Reports" },
    // Milestone 7
    { path: "/payables", name: "Accounts Payable" },
    { path: "/payments", name: "Supplier Payments" },
    { path: "/bank-book", name: "Bank & Cash Book" },
    { path: "/voucher-entry", name: "Voucher Entry" },
    { path: "/supplier-notes", name: "Supplier Notes" },
    // Milestones 1-6
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
  console.log("🎉 ALL MILESTONE 8 END-TO-END VERIFICATIONS PASSED! 🎉");
  console.log("========================================================");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
