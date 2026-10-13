// scripts/verify-m7.mjs - End-to-end verification for Milestone 7
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function run() {
  console.log("=== STARTING MILESTONE 7 END-TO-END VERIFICATION ===");

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

  // 2. Bank & Cash Book Accounts and Contra Transfers
  console.log("\n2. Testing Bank & Cash Book...");
  const bbRes = await fetch(`${BASE_URL}/api/bank-book`, { headers });
  if (!bbRes.ok) throw new Error(`Failed to load bank-book: ${await bbRes.text()}`);
  const bbData = await bbRes.json();
  console.log(`✓ Bank book initialized. Default bank accounts: ${bbData.bankAccounts.length}, Cash registers: ${bbData.cashRegisters.length}`);

  // Create dedicated Test Bank Account
  const bankAccountName = `HDFC Bank M7-${Date.now().toString().slice(-4)}`;
  const createBankRes = await fetch(`${BASE_URL}/api/bank-book/accounts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "BANK",
      name: bankAccountName,
      accountNumber: "50100" + Math.floor(100000 + Math.random() * 900000),
      ifscCode: "HDFC0001234",
      opening: 50000,
    }),
  });

  if (!createBankRes.ok) throw new Error(`Failed to create bank account: ${await createBankRes.text()}`);
  const bankAccData = await createBankRes.json();
  const testBankId = bankAccData.account.id;
  console.log(`✓ Created test bank account "${bankAccountName}" (ID: ${testBankId}) with opening balance ₹50,000`);

  // Find a cash register
  const cashRegisterId = bbData.cashRegisters[0]?.id;
  if (!cashRegisterId) throw new Error("No cash register found");

  // Perform Contra Transfer: Withdraw ₹10,000 from Bank into Cash Register
  console.log("\nTesting Contra Transfer (Bank to Cash)...");
  const contraRes = await fetch(`${BASE_URL}/api/bank-book`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      transferType: "BANK_TO_CASH",
      bankAccountId: testBankId,
      cashRegisterId: cashRegisterId,
      amount: 10000,
      reference: "ATM-WITHDRAWAL-M7",
      description: "Cash withdrawal for store counter liquidity",
    }),
  });

  if (!contraRes.ok) throw new Error(`Contra transfer failed: ${await contraRes.text()}`);
  const contraData = await contraRes.json();
  console.log(`✓ Contra transfer completed: ₹${contraData.amount} moved from Bank to Cash register (Ref: ${contraData.reference})`);

  // Verify Bank Account balance is now ₹40,000
  const bbCheckRes = await fetch(`${BASE_URL}/api/bank-book`, { headers });
  const bbCheckData = await bbCheckRes.json();
  const updatedBank = bbCheckData.bankAccounts.find((b) => b.id === testBankId);
  if (Math.round(updatedBank.balance) !== 40000) {
    throw new Error(`Expected bank balance 40,000, got ${updatedBank.balance}`);
  }
  console.log(`✓ Verified bank account balance successfully updated to ₹${updatedBank.balance}`);

  // 3. Accounts Payable: Supplier setup and Purchase Invoice
  console.log("\n3. Testing Supplier Payables...");
  const supListRes = await fetch(`${BASE_URL}/api/suppliers`, { headers });
  const supListData = await supListRes.json();
  let testSupplier = supListData.suppliers[0];

  if (!testSupplier) {
    const newSupRes = await fetch(`${BASE_URL}/api/suppliers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Apollo Pharma Distributors M7",
        phone: "9822334455",
        email: "apollo.m7@example.com",
        city: "Mumbai",
      }),
    });
    const newSupData = await newSupRes.json();
    testSupplier = newSupData.supplier;
  }
  console.log(`✓ Using supplier "${testSupplier.name}" (ID: ${testSupplier.id})`);

  // Ensure a medicine exists to buy
  const medRes = await fetch(`${BASE_URL}/api/medicines`, { headers });
  const medData = await medRes.json();
  let testMed = medData.medicines[0];
  if (!testMed) {
    throw new Error("No medicines found in catalog");
  }

  // Create Purchase Invoice for ₹12,000 (100 units @ 120)
  const invoiceNum = `M7-INV-${Date.now().toString().slice(-6)}`;
  console.log(`Creating purchase invoice ${invoiceNum} for ₹12,000...`);
  const purchaseRes = await fetch(`${BASE_URL}/api/purchases`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      supplierId: testSupplier.id,
      invoiceNumber: invoiceNum,
      invoiceDate: new Date().toISOString().split("T")[0],
      paymentMode: "CREDIT",
      notes: "Milestone 7 Payables verification purchase",
      lines: [
        {
          medicineId: testMed.id,
          batchNumber: `M7-BATCH-${Date.now().toString().slice(-4)}`,
          expiryDate: "2027-12-31",
          quantity: 100,
          freeQuantity: 0,
          unitRate: 100,
          mrp: 150,
          gstRate: 20,
        },
      ],
    }),
  });

  if (!purchaseRes.ok) throw new Error(`Purchase creation failed: ${await purchaseRes.text()}`);
  const purchaseData = await purchaseRes.json();
  const invoiceId = purchaseData.invoice.id;
  const invoiceTotal = purchaseData.invoice.total;
  console.log(`✓ Purchase invoice created: ID ${invoiceId}, Total ₹${invoiceTotal}`);

  // Query /api/payables
  const payablesRes = await fetch(`${BASE_URL}/api/payables`, { headers });
  const payablesData = await payablesRes.json();
  const supPayable = payablesData.payables.find((s) => s.id === testSupplier.id);
  if (!supPayable || supPayable.balance <= 0) {
    throw new Error("Supplier payable balance not reflected in /api/payables");
  }
  console.log(`✓ Supplier payable confirmed in registry: Balance ₹${supPayable.balance}, Open Bills: ${supPayable.unpaidInvoicesCount}`);

  // Query 360° statement
  const sup360Res = await fetch(`${BASE_URL}/api/payables/${testSupplier.id}`, { headers });
  const sup360Data = await sup360Res.json();
  if (!sup360Data.supplier || sup360Data.supplier.openInvoices.length === 0) {
    throw new Error("Supplier 360 statement missing open bills");
  }
  console.log(`✓ Supplier 360° Statement verified. Running balance: ₹${sup360Data.supplier.balance}`);

  // 4. Supplier Disbursements & FIFO Payment Allocation
  console.log("\n4. Testing Supplier Payments & FIFO Allocation...");
  const disburseAmount = 5000;
  const paymentRes = await fetch(`${BASE_URL}/api/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      supplierId: testSupplier.id,
      bankAccountId: testBankId,
      amount: disburseAmount,
      method: "UPI",
      reference: `UTR-${Date.now().toString().slice(-6)}`,
      notes: "Partial payment for purchase bills",
    }),
  });

  if (!paymentRes.ok) throw new Error(`Supplier payment failed: ${await paymentRes.text()}`);
  const paymentData = await paymentRes.json();
  console.log(`✓ Supplier payment recorded: ₹${paymentData.payment.amount} (ID: ${paymentData.payment.id})`);
  console.log(`  Allocations generated: ${paymentData.payment.allocations.length}`);
  for (const alloc of paymentData.payment.allocations) {
    console.log(`  - Allocated ₹${alloc.allocatedAmount} against invoice ${alloc.invoiceId}`);
  }

  // Verify updated payable balance
  const sup360AfterRes = await fetch(`${BASE_URL}/api/payables/${testSupplier.id}`, { headers });
  const sup360AfterData = await sup360AfterRes.json();
  const expectedBalance = Math.round((sup360Data.supplier.balance - disburseAmount) * 100) / 100;
  if (Math.round(sup360AfterData.supplier.balance * 100) / 100 !== expectedBalance) {
    throw new Error(`Expected balance ${expectedBalance}, got ${sup360AfterData.supplier.balance}`);
  }
  console.log(`✓ Supplier payable balance accurately reduced to ₹${sup360AfterData.supplier.balance}`);

  // 5. Double-Entry Voucher System
  console.log("\n5. Testing Double-Entry Voucher System...");
  
  // Test A: Unbalanced voucher should be REJECTED (400 Bad Request)
  console.log("Posting unbalanced voucher (Debit ₹1000 != Credit ₹800)...");
  const unbalRes = await fetch(`${BASE_URL}/api/vouchers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "JOURNAL",
      date: new Date().toISOString().split("T")[0],
      narration: "Unbalanced test voucher",
      lines: [
        { account: "Office Supplies", debit: 1000, credit: 0 },
        { account: "Bank Account", debit: 0, credit: 800 },
      ],
    }),
  });

  if (unbalRes.status !== 400) {
    throw new Error(`Expected 400 for unbalanced voucher, got ${unbalRes.status}`);
  }
  console.log("✓ Correctly rejected unbalanced voucher with 400 Bad Request.");

  // Test B: Balanced voucher should succeed with sequential numbering
  console.log("Posting balanced Journal Voucher (JV)...");
  const balRes = await fetch(`${BASE_URL}/api/vouchers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "JOURNAL",
      date: new Date().toISOString().split("T")[0],
      narration: "Store electricity and maintenance expense",
      lines: [
        { account: "Electricity Expense", debit: 2500, credit: 0 },
        { account: "HDFC Bank", debit: 0, credit: 2500 },
      ],
    }),
  });

  if (!balRes.ok) throw new Error(`Balanced voucher failed: ${await balRes.text()}`);
  const balData = await balRes.json();
  console.log(`✓ Balanced voucher created: Reference ${balData.voucher.voucherRef}, Number #${balData.voucher.number}, Total ₹${balData.voucher.totalAmount}`);

  // Query vouchers register
  const listVouchersRes = await fetch(`${BASE_URL}/api/vouchers`, { headers });
  const listVouchersData = await listVouchersRes.json();
  const createdVoucher = listVouchersData.vouchers.find((v) => v.id === balData.voucher.id);
  if (!createdVoucher || createdVoucher.lines.length !== 2) {
    throw new Error("Voucher not found in vouchers register");
  }
  console.log(`✓ Verified voucher appears in voucher register with ${createdVoucher.lines.length} lines.`);

  // 6. Supplier Returns & Credit/Debit Notes
  console.log("\n6. Testing Supplier Return Notes & Stock Deductions...");
  // Find a batch with stock to return via search-for-sale
  const searchMedRes = await fetch(`${BASE_URL}/api/medicines/search-for-sale`, { headers });
  const searchMedData = await searchMedRes.json();
  const availableMed = searchMedData.medicines.find((m) => m.batches.length > 0 && m.batches.some((b) => b.stock >= 5));

  if (!availableMed) throw new Error("No batch with >= 5 stock found for supplier return");
  const batchToReturn = availableMed.batches.find((b) => b.stock >= 5);
  const initialBatchStock = batchToReturn.stock;
  const returnQty = 2;
  const returnRate = Number(batchToReturn.purchaseRate || 50);

  const noteRes = await fetch(`${BASE_URL}/api/supplier-notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      supplierId: testSupplier.id,
      type: "CREDIT_NOTE",
      amount: returnQty * returnRate,
      reason: "Damaged packaging in transit",
      batchId: batchToReturn.id,
      returnQuantity: returnQty,
      reference: "RET-M7-001",
    }),
  });

  if (!noteRes.ok) throw new Error(`Supplier note creation failed: ${await noteRes.text()}`);
  const noteData = await noteRes.json();
  console.log(`✓ Supplier return note created: ID ${noteData.note.id}, Type ${noteData.note.type}, Amount ₹${noteData.note.amount}`);

  // Verify inventory deduction via search-for-sale
  const recheckMedRes = await fetch(`${BASE_URL}/api/medicines/search-for-sale`, { headers });
  const recheckMedData = await recheckMedRes.json();
  const recheckMed = recheckMedData.medicines.find((m) => m.id === availableMed.id);
  const updatedBatch = recheckMed.batches.find((b) => b.id === batchToReturn.id);
  if (updatedBatch.stock !== initialBatchStock - returnQty) {
    throw new Error(`Expected batch stock ${initialBatchStock - returnQty}, got ${updatedBatch?.stock}`);
  }
  console.log(`✓ Verified batch stock deducted from ${initialBatchStock} to ${updatedBatch.stock} via SUPPLIER_RETURN movement.`);

  // Verify DB record for movement
  const supReturnMvmt = await prisma.inventoryMovement.findFirst({
    where: { batchId: batchToReturn.id, type: "SUPPLIER_RETURN" },
  });
  if (!supReturnMvmt) throw new Error("SUPPLIER_RETURN inventory movement record not found in DB");
  console.log(`✓ Confirmed SUPPLIER_RETURN movement recorded in DB with qty ${supReturnMvmt.quantity}.`);

  // 7. Workspace Page Availability & Regression Suite
  console.log("\n7. Checking workspace page availability and regression across all milestones...");
  const pagesToTest = [
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
  console.log("🎉 ALL MILESTONE 7 END-TO-END VERIFICATIONS PASSED! 🎉");
  console.log("========================================================");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
