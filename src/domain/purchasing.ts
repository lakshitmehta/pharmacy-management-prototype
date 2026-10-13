import { z } from "zod";

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const purchaseLineSchema = z.object({
  medicineId: z.string().min(1),
  batchNumber: z.string().trim().min(1).max(80),
  expiryDate: z.coerce.date(),
  quantity: z.coerce.number().int().positive(),
  freeQuantity: z.coerce.number().int().nonnegative().default(0),
  unitRate: z.coerce.number().nonnegative(),
  mrp: z.coerce.number().nonnegative(),
  hsn: z.string().trim().max(20).optional().or(z.literal("")),
  gstRate: z.coerce.number().min(0).max(100),
  itcEligibility: z.enum(["ELIGIBLE", "BLOCKED", "RULE_42_43", "OTHER_INELIGIBLE"]).default("ELIGIBLE"),
});

export const purchaseInputSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().trim().min(1).max(80),
  invoiceDate: z.coerce.date(),
  reverseCharge: z.boolean().default(false),
  lines: z.array(purchaseLineSchema).min(1),
});

export const purchaseOrderInputSchema = z.object({
  supplierId: z.string().min(1),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  lines: z.array(z.object({
    medicineId: z.string().min(1),
    quantity: z.coerce.number().int().positive(),
    freeQuantity: z.coerce.number().int().nonnegative().default(0),
    unitRate: z.coerce.number().nonnegative(),
    mrp: z.coerce.number().nonnegative(),
  })).min(1),
});

export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

export function calculatePurchaseLine(line: PurchaseLineInput) {
  const taxable = line.quantity * line.unitRate;
  const tax = taxable * (line.gstRate / 100);
  return { taxable: roundCurrency(taxable), tax: roundCurrency(tax), total: roundCurrency(taxable + tax) };
}

export function calculatePurchaseTotals(lines: PurchaseLineInput[]) {
  return lines.reduce((totals, line) => {
    const calculated = calculatePurchaseLine(line);
    return {
      subtotal: roundCurrency(totals.subtotal + calculated.taxable),
      tax: roundCurrency(totals.tax + calculated.tax),
      total: roundCurrency(totals.total + calculated.total),
    };
  }, { subtotal: 0, tax: 0, total: 0 });
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
