import { z } from "zod";
import { roundCurrency } from "@/domain/finance";

export { roundCurrency };

// Types for Sales reporting
export type SaleReportLineItem = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  paymentMethod: string;
  medicineName: string;
  batchNumber: string;
  hsn?: string | null;
  gstRate: number;
  quantity: number;
  unitRate: number;
  discount: number;
  tax: number;
  total: number;
};

export type SaleInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  createdAt: Date | string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
};

// Types for Purchase reporting
export type PurchaseReportLineItem = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  supplierName: string;
  supplierGstin?: string | null;
  medicineName: string;
  batchNumber: string;
  hsn?: string | null;
  gstRate: number;
  quantity: number;
  freeQuantity: number;
  unitRate: number;
  tax: number;
  total: number;
  itcEligibility: string;
};

export type PurchaseInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  reverseCharge: boolean;
  status: string;
};

// Types for Inventory valuation & velocity
export type BatchValuationItem = {
  batchId: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: Date | string;
  stock: number;
  purchaseRate: number;
  mrp: number;
  costValue: number;
  mrpValue: number;
  unrealizedProfit: number;
  marginPercent: number;
};

// Types for Financial / P&L
export type ProfitAndLossInput = {
  grossSales: number;
  salesReturns: number;
  openingStockCost: number;
  purchasesCost: number;
  purchaseReturnsCost: number;
  closingStockCost: number;
  operatingExpenses: number;
  otherIncome?: number;
};

export type ProfitAndLossResult = {
  grossSales: number;
  salesReturns: number;
  netSalesRevenue: number;
  openingStockCost: number;
  purchasesCost: number;
  purchaseReturnsCost: number;
  netPurchasesCost: number;
  closingStockCost: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  otherIncome: number;
  netOperatingProfit: number;
  netProfitMarginPercent: number;
};

// Pure calculation functions
export function calculateProfitAndLoss(input: ProfitAndLossInput): ProfitAndLossResult {
  const grossSales = roundCurrency(input.grossSales);
  const salesReturns = roundCurrency(input.salesReturns);
  const netSalesRevenue = roundCurrency(Math.max(0, grossSales - salesReturns));

  const openingStockCost = roundCurrency(input.openingStockCost);
  const purchasesCost = roundCurrency(input.purchasesCost);
  const purchaseReturnsCost = roundCurrency(input.purchaseReturnsCost);
  const netPurchasesCost = roundCurrency(Math.max(0, purchasesCost - purchaseReturnsCost));
  const closingStockCost = roundCurrency(input.closingStockCost);

  // COGS = Opening Stock + Net Purchases - Closing Stock
  const rawCogs = openingStockCost + netPurchasesCost - closingStockCost;
  const cogs = roundCurrency(Math.max(0, rawCogs));

  const grossProfit = roundCurrency(netSalesRevenue - cogs);
  const grossMarginPercent = netSalesRevenue > 0 ? roundCurrency((grossProfit / netSalesRevenue) * 100) : 0;

  const operatingExpenses = roundCurrency(input.operatingExpenses);
  const otherIncome = roundCurrency(input.otherIncome || 0);

  const netOperatingProfit = roundCurrency(grossProfit - operatingExpenses + otherIncome);
  const netProfitMarginPercent =
    netSalesRevenue > 0 ? roundCurrency((netOperatingProfit / netSalesRevenue) * 100) : 0;

  return {
    grossSales,
    salesReturns,
    netSalesRevenue,
    openingStockCost,
    purchasesCost,
    purchaseReturnsCost,
    netPurchasesCost,
    closingStockCost,
    cogs,
    grossProfit,
    grossMarginPercent,
    operatingExpenses,
    otherIncome,
    netOperatingProfit,
    netProfitMarginPercent,
  };
}

// GST / GSTR Reporting
export type Gstr1Result = {
  b2b: Array<{
    gstin: string;
    partyName: string;
    invoiceCount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }>;
  b2c: Array<{
    gstRate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    total: number;
  }>;
  summary: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    totalValue: number;
  };
};

export function aggregateGstr1(invoices: SaleInvoiceSummary[], lines: SaleReportLineItem[]): Gstr1Result {
  const b2bMap = new Map<
    string,
    { gstin: string; partyName: string; invoiceIds: Set<string>; taxable: number; cgst: number; sgst: number; igst: number; total: number }
  >();

  const b2cSlabs = new Map<number, { gstRate: number; taxable: number; cgst: number; sgst: number; total: number }>();
  [0, 5, 12, 18, 28].forEach((rate) => {
    b2cSlabs.set(rate, { gstRate: rate, taxable: 0, cgst: 0, sgst: 0, total: 0 });
  });

  for (const line of lines) {
    const inv = invoices.find((i) => i.id === line.invoiceId);
    if (!inv || inv.status === "VOIDED") continue;

    const hasGstin = Boolean(line.customerGstin && line.customerGstin.trim().length >= 15);
    const taxable = roundCurrency(line.total - line.tax);
    const halfTax = roundCurrency(line.tax / 2);

    if (hasGstin && line.customerGstin) {
      const key = line.customerGstin.trim().toUpperCase();
      const existing = b2bMap.get(key) || {
        gstin: key,
        partyName: line.customerName || "Registered Customer",
        invoiceIds: new Set<string>(),
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
      };
      existing.invoiceIds.add(line.invoiceId);
      existing.taxable = roundCurrency(existing.taxable + taxable);
      existing.cgst = roundCurrency(existing.cgst + halfTax);
      existing.sgst = roundCurrency(existing.sgst + (line.tax - halfTax));
      existing.total = roundCurrency(existing.total + line.total);
      b2bMap.set(key, existing);
    } else {
      const slabRate = [0, 5, 12, 18, 28].includes(line.gstRate) ? line.gstRate : Math.round(line.gstRate);
      const slab = b2cSlabs.get(slabRate) || { gstRate: slabRate, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      slab.taxable = roundCurrency(slab.taxable + taxable);
      slab.cgst = roundCurrency(slab.cgst + halfTax);
      slab.sgst = roundCurrency(slab.sgst + (line.tax - halfTax));
      slab.total = roundCurrency(slab.total + line.total);
      b2cSlabs.set(slabRate, slab);
    }
  }

  const b2b = Array.from(b2bMap.values()).map((b) => ({
    gstin: b.gstin,
    partyName: b.partyName,
    invoiceCount: b.invoiceIds.size,
    taxable: b.taxable,
    cgst: b.cgst,
    sgst: b.sgst,
    igst: b.igst,
    total: b.total,
  }));

  const b2c = Array.from(b2cSlabs.values()).filter((s) => s.total > 0);

  const b2bTaxable = b2b.reduce((s, b) => s + b.taxable, 0);
  const b2bCgst = b2b.reduce((s, b) => s + b.cgst, 0);
  const b2bSgst = b2b.reduce((s, b) => s + b.sgst, 0);
  const b2bIgst = b2b.reduce((s, b) => s + b.igst, 0);

  const b2cTaxable = b2c.reduce((s, b) => s + b.taxable, 0);
  const b2cCgst = b2c.reduce((s, b) => s + b.cgst, 0);
  const b2cSgst = b2c.reduce((s, b) => s + b.sgst, 0);

  const totalTaxable = roundCurrency(b2bTaxable + b2cTaxable);
  const totalCgst = roundCurrency(b2bCgst + b2cCgst);
  const totalSgst = roundCurrency(b2bSgst + b2cSgst);
  const totalIgst = roundCurrency(b2bIgst);
  const totalTax = roundCurrency(totalCgst + totalSgst + totalIgst);
  const totalValue = roundCurrency(totalTaxable + totalTax);

  return {
    b2b,
    b2c,
    summary: {
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax,
      totalValue,
    },
  };
}

export type Gstr2Result = {
  inwardSupplies: Array<{
    supplierGstin: string;
    supplierName: string;
    invoiceCount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    eligibleItc: number;
    ineligibleItc: number;
  }>;
  summary: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalTax: number;
    totalValue: number;
    totalEligibleItc: number;
    totalIneligibleItc: number;
  };
};

export function aggregateGstr2(invoices: PurchaseInvoiceSummary[], lines: PurchaseReportLineItem[]): Gstr2Result {
  const map = new Map<
    string,
    {
      supplierGstin: string;
      supplierName: string;
      invoiceIds: Set<string>;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
      eligibleItc: number;
      ineligibleItc: number;
    }
  >();

  for (const line of lines) {
    const inv = invoices.find((i) => i.id === line.invoiceId);
    if (!inv || inv.status === "VOIDED") continue;

    const gstin = line.supplierGstin?.trim().toUpperCase() || "UNREGISTERED";
    const existing = map.get(gstin) || {
      supplierGstin: gstin,
      supplierName: line.supplierName,
      invoiceIds: new Set<string>(),
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
      eligibleItc: 0,
      ineligibleItc: 0,
    };

    const taxable = roundCurrency(line.quantity * line.unitRate);
    const halfTax = roundCurrency(line.tax / 2);

    existing.invoiceIds.add(line.invoiceId);
    existing.taxable = roundCurrency(existing.taxable + taxable);
    existing.cgst = roundCurrency(existing.cgst + halfTax);
    existing.sgst = roundCurrency(existing.sgst + (line.tax - halfTax));
    existing.total = roundCurrency(existing.total + line.total);

    if (line.itcEligibility === "ELIGIBLE") {
      existing.eligibleItc = roundCurrency(existing.eligibleItc + line.tax);
    } else {
      existing.ineligibleItc = roundCurrency(existing.ineligibleItc + line.tax);
    }

    map.set(gstin, existing);
  }

  const inwardSupplies = Array.from(map.values()).map((s) => ({
    supplierGstin: s.supplierGstin,
    supplierName: s.supplierName,
    invoiceCount: s.invoiceIds.size,
    taxable: s.taxable,
    cgst: s.cgst,
    sgst: s.sgst,
    igst: s.igst,
    total: s.total,
    eligibleItc: s.eligibleItc,
    ineligibleItc: s.ineligibleItc,
  }));

  const totalTaxable = roundCurrency(inwardSupplies.reduce((s, i) => s + i.taxable, 0));
  const totalCgst = roundCurrency(inwardSupplies.reduce((s, i) => s + i.cgst, 0));
  const totalSgst = roundCurrency(inwardSupplies.reduce((s, i) => s + i.sgst, 0));
  const totalTax = roundCurrency(totalCgst + totalSgst);
  const totalValue = roundCurrency(inwardSupplies.reduce((s, i) => s + i.total, 0));
  const totalEligibleItc = roundCurrency(inwardSupplies.reduce((s, i) => s + i.eligibleItc, 0));
  const totalIneligibleItc = roundCurrency(inwardSupplies.reduce((s, i) => s + i.ineligibleItc, 0));

  return {
    inwardSupplies,
    summary: {
      totalTaxable,
      totalCgst,
      totalSgst,
      totalTax,
      totalValue,
      totalEligibleItc,
      totalIneligibleItc,
    },
  };
}

export function calculateGstr3bSummary(gstr1: Gstr1Result, gstr2: Gstr2Result) {
  const outwardTaxable = gstr1.summary.totalTaxable;
  const outwardTax = gstr1.summary.totalTax;
  const eligibleItc = gstr2.summary.totalEligibleItc;
  const netPayable = roundCurrency(Math.max(0, outwardTax - eligibleItc));
  const carryForwardItc = roundCurrency(Math.max(0, eligibleItc - outwardTax));

  return {
    outwardTaxable,
    outwardTax,
    outwardCgst: gstr1.summary.totalCgst,
    outwardSgst: gstr1.summary.totalSgst,
    eligibleItc,
    itcCgst: gstr2.summary.totalCgst,
    itcSgst: gstr2.summary.totalSgst,
    netPayable,
    carryForwardItc,
  };
}

export function aggregateHsnSummary(lines: SaleReportLineItem[]) {
  const map = new Map<
    string,
    { hsn: string; description: string; totalQuantity: number; taxableValue: number; totalTax: number; totalValue: number }
  >();

  for (const line of lines) {
    const hsnCode = line.hsn?.trim() || "3004";
    const existing = map.get(hsnCode) || {
      hsn: hsnCode,
      description: line.medicineName,
      totalQuantity: 0,
      taxableValue: 0,
      totalTax: 0,
      totalValue: 0,
    };

    const taxable = roundCurrency(line.total - line.tax);
    existing.totalQuantity += line.quantity;
    existing.taxableValue = roundCurrency(existing.taxableValue + taxable);
    existing.totalTax = roundCurrency(existing.totalTax + line.tax);
    existing.totalValue = roundCurrency(existing.totalValue + line.total);
    map.set(hsnCode, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
}

// Stock Valuation & Velocity
export function calculateStockValuation(batches: Array<{
  id: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: Date | string;
  stock: number;
  purchaseRate: number;
  mrp: number;
}>): {
  items: BatchValuationItem[];
  totals: { totalCost: number; totalMrp: number; potentialProfit: number; overallMarginPercent: number };
} {
  const items: BatchValuationItem[] = batches.map((b) => {
    const costValue = roundCurrency(b.stock * b.purchaseRate);
    const mrpValue = roundCurrency(b.stock * b.mrp);
    const unrealizedProfit = roundCurrency(mrpValue - costValue);
    const marginPercent = mrpValue > 0 ? roundCurrency((unrealizedProfit / mrpValue) * 100) : 0;

    return {
      batchId: b.id,
      medicineId: b.medicineId,
      medicineName: b.medicineName,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      stock: b.stock,
      purchaseRate: b.purchaseRate,
      mrp: b.mrp,
      costValue,
      mrpValue,
      unrealizedProfit,
      marginPercent,
    };
  });

  const totalCost = roundCurrency(items.reduce((s, i) => s + i.costValue, 0));
  const totalMrp = roundCurrency(items.reduce((s, i) => s + i.mrpValue, 0));
  const potentialProfit = roundCurrency(totalMrp - totalCost);
  const overallMarginPercent = totalMrp > 0 ? roundCurrency((potentialProfit / totalMrp) * 100) : 0;

  return {
    items,
    totals: {
      totalCost,
      totalMrp,
      potentialProfit,
      overallMarginPercent,
    },
  };
}

export function calculateFastSlowMoving(
  medicines: Array<{ id: string; name: string }>,
  salesLines: Array<{ medicineId: string; quantity: number }>,
  periodDays: number = 30
) {
  const qtyMap = new Map<string, number>();
  salesLines.forEach((l) => {
    qtyMap.set(l.medicineId, (qtyMap.get(l.medicineId) || 0) + l.quantity);
  });

  return medicines.map((m) => {
    const unitsSold = qtyMap.get(m.id) || 0;
    const velocityPerDay = roundCurrency(unitsSold / Math.max(1, periodDays));
    let classification: "FAST" | "NORMAL" | "SLOW";
    if (velocityPerDay >= 1.0) classification = "FAST";
    else if (velocityPerDay >= 0.2) classification = "NORMAL";
    else classification = "SLOW";

    return {
      medicineId: m.id,
      medicineName: m.name,
      unitsSold,
      velocityPerDay,
      classification,
    };
  }).sort((a, b) => b.unitsSold - a.unitsSold);
}

// Zod Schemas for API Filters
export const reportFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  subReport: z.string().optional(),
  paymentMethod: z.string().optional(),
  supplierId: z.string().optional(),
});

export type ReportFilterInput = z.infer<typeof reportFilterSchema>;

