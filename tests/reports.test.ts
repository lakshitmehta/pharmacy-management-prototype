import { describe, expect, it } from "vitest";
import {
  calculateProfitAndLoss,
  aggregateGstr1,
  aggregateGstr2,
  calculateGstr3bSummary,
  aggregateHsnSummary,
  calculateStockValuation,
  calculateFastSlowMoving,
} from "@/domain/reports";

describe("calculateProfitAndLoss", () => {
  it("computes COGS, gross profit, and net operating profit accurately", () => {
    const input = {
      grossSales: 150000,
      salesReturns: 5000, // Net Revenue = 145000
      openingStockCost: 40000,
      purchasesCost: 90000,
      purchaseReturnsCost: 5000, // Net Purchases = 85000
      closingStockCost: 35000, // COGS = 40000 + 85000 - 35000 = 90000
      operatingExpenses: 25000, // Net Profit = (145000 - 90000) - 25000 = 30000
      otherIncome: 2000, // Net Profit with other income = 32000
    };

    const result = calculateProfitAndLoss(input);

    expect(result.netSalesRevenue).toBe(145000);
    expect(result.netPurchasesCost).toBe(85000);
    expect(result.cogs).toBe(90000);
    expect(result.grossProfit).toBe(55000);
    expect(result.grossMarginPercent).toBe(37.93);
    expect(result.netOperatingProfit).toBe(32000);
    expect(result.netProfitMarginPercent).toBe(22.07);
  });

  it("handles zero sales gracefully without division by zero", () => {
    const input = {
      grossSales: 0,
      salesReturns: 0,
      openingStockCost: 1000,
      purchasesCost: 0,
      purchaseReturnsCost: 0,
      closingStockCost: 1000,
      operatingExpenses: 500,
    };

    const result = calculateProfitAndLoss(input);
    expect(result.grossMarginPercent).toBe(0);
    expect(result.netProfitMarginPercent).toBe(0);
    expect(result.netOperatingProfit).toBe(-500);
  });
});

describe("aggregateGstr1", () => {
  it("segregates registered B2B parties from unregistered B2C walk-in customers", () => {
    const invoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        createdAt: new Date(),
        customerGstin: "07AAAAA0000A1Z5",
        paymentMethod: "CASH",
        subtotal: 1000,
        discount: 0,
        tax: 120,
        total: 1120,
        status: "POSTED",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-002",
        createdAt: new Date(),
        customerGstin: null, // B2C
        paymentMethod: "UPI",
        subtotal: 500,
        discount: 0,
        tax: 60,
        total: 560,
        status: "POSTED",
      },
    ];

    const lines = [
      {
        invoiceId: "inv-1",
        invoiceNumber: "INV-001",
        invoiceDate: new Date(),
        customerName: "Apollo Clinic",
        customerGstin: "07AAAAA0000A1Z5",
        paymentMethod: "CASH",
        medicineName: "Amoxicillin 500mg",
        batchNumber: "B1",
        gstRate: 12,
        quantity: 10,
        unitRate: 100,
        discount: 0,
        tax: 120,
        total: 1120,
      },
      {
        invoiceId: "inv-2",
        invoiceNumber: "INV-002",
        invoiceDate: new Date(),
        customerName: "Walk-in",
        customerGstin: null,
        paymentMethod: "UPI",
        medicineName: "Paracetamol 650mg",
        batchNumber: "B2",
        gstRate: 12,
        quantity: 5,
        unitRate: 100,
        discount: 0,
        tax: 60,
        total: 560,
      },
    ];

    const result = aggregateGstr1(invoices, lines);

    // B2B entry
    expect(result.b2b.length).toBe(1);
    expect(result.b2b[0].gstin).toBe("07AAAAA0000A1Z5");
    expect(result.b2b[0].taxable).toBe(1000);
    expect(result.b2b[0].cgst).toBe(60);
    expect(result.b2b[0].sgst).toBe(60);

    // B2C entry
    expect(result.b2c.length).toBe(1);
    expect(result.b2c[0].gstRate).toBe(12);
    expect(result.b2c[0].taxable).toBe(500);

    // Grand totals
    expect(result.summary.totalTaxable).toBe(1500);
    expect(result.summary.totalTax).toBe(180);
    expect(result.summary.totalValue).toBe(1680);
  });
});

describe("aggregateGstr2 & calculateGstr3bSummary", () => {
  it("tracks eligible ITC and computes net GST payable", () => {
    const purchaseInvoices = [
      {
        id: "p-1",
        invoiceNumber: "PINV-101",
        invoiceDate: new Date(),
        supplierId: "sup-1",
        supplierName: "Apex Pharma",
        supplierGstin: "27AABCA1111A1Z1",
        subtotal: 10000,
        tax: 1200,
        total: 11200,
        reverseCharge: false,
        status: "POSTED",
      },
    ];

    const purchaseLines = [
      {
        invoiceId: "p-1",
        invoiceNumber: "PINV-101",
        invoiceDate: new Date(),
        supplierName: "Apex Pharma",
        supplierGstin: "27AABCA1111A1Z1",
        medicineName: "Azithromycin 500",
        batchNumber: "AZ-01",
        gstRate: 12,
        quantity: 100,
        freeQuantity: 0,
        unitRate: 100,
        tax: 1200,
        total: 11200,
        itcEligibility: "ELIGIBLE",
      },
    ];

    const gstr2 = aggregateGstr2(purchaseInvoices, purchaseLines);
    expect(gstr2.summary.totalEligibleItc).toBe(1200);

    const mockGstr1 = {
      b2b: [],
      b2c: [],
      summary: {
        totalTaxable: 20000,
        totalCgst: 1000,
        totalSgst: 1000,
        totalIgst: 0,
        totalTax: 2000,
        totalValue: 22000,
      },
    };

    const gstr3b = calculateGstr3bSummary(mockGstr1, gstr2);
    expect(gstr3b.outwardTax).toBe(2000);
    expect(gstr3b.eligibleItc).toBe(1200);
    expect(gstr3b.netPayable).toBe(800); // 2000 - 1200 = 800 net tax payable
  });
});

describe("aggregateHsnSummary", () => {
  it("groups lines by HSN code and aggregates quantities and tax", () => {
    const lines = [
      {
        invoiceId: "1",
        invoiceNumber: "1",
        invoiceDate: new Date(),
        paymentMethod: "CASH",
        medicineName: "Dolo 650",
        batchNumber: "B1",
        hsn: "3004",
        gstRate: 12,
        quantity: 20,
        unitRate: 30,
        discount: 0,
        tax: 72,
        total: 672,
      },
      {
        invoiceId: "2",
        invoiceNumber: "2",
        invoiceDate: new Date(),
        paymentMethod: "CASH",
        medicineName: "Crocin 500",
        batchNumber: "B2",
        hsn: "3004",
        gstRate: 12,
        quantity: 10,
        unitRate: 25,
        discount: 0,
        tax: 30,
        total: 280,
      },
      {
        invoiceId: "3",
        invoiceNumber: "3",
        invoiceDate: new Date(),
        paymentMethod: "CASH",
        medicineName: "Surgical Tape",
        batchNumber: "B3",
        hsn: "9018",
        gstRate: 18,
        quantity: 5,
        unitRate: 100,
        discount: 0,
        tax: 90,
        total: 590,
      },
    ];

    const hsnList = aggregateHsnSummary(lines);
    expect(hsnList.length).toBe(2);

    const hsn3004 = hsnList.find((h) => h.hsn === "3004");
    expect(hsn3004?.totalQuantity).toBe(30);
    expect(hsn3004?.totalTax).toBe(102);
  });
});

describe("calculateStockValuation", () => {
  it("computes cost valuation, MRP valuation and overall margin", () => {
    const batches = [
      {
        id: "b-1",
        medicineId: "m-1",
        medicineName: "Augmentin 625",
        batchNumber: "AUG-01",
        expiryDate: "2027-01-01",
        stock: 50,
        purchaseRate: 120, // 50 * 120 = 6000
        mrp: 200, // 50 * 200 = 10000
      },
    ];

    const result = calculateStockValuation(batches);
    expect(result.totals.totalCost).toBe(6000);
    expect(result.totals.totalMrp).toBe(10000);
    expect(result.totals.potentialProfit).toBe(4000);
    expect(result.totals.overallMarginPercent).toBe(40);
  });
});

describe("calculateFastSlowMoving", () => {
  it("classifies medicines based on daily sales velocity", () => {
    const medicines = [
      { id: "m-1", name: "Paracetamol 650" },
      { id: "m-2", name: "Rare Injection" },
    ];
    const salesLines = [
      { medicineId: "m-1", quantity: 60 }, // 60 units in 30 days = 2.0 / day -> FAST
      { medicineId: "m-2", quantity: 2 }, // 2 units in 30 days = 0.07 / day -> SLOW
    ];

    const velocity = calculateFastSlowMoving(medicines, salesLines, 30);
    const m1 = velocity.find((v) => v.medicineId === "m-1");
    const m2 = velocity.find((v) => v.medicineId === "m-2");

    expect(m1?.classification).toBe("FAST");
    expect(m2?.classification).toBe("SLOW");
  });
});

