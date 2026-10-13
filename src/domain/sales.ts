import { z } from "zod";

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const paymentMethods = [
  "CASH",
  "UPI",
  "CARD",
  "CREDIT",
  "CHEMIST",
  "OWN_USE",
] as const;

export type PaymentMethodType = (typeof paymentMethods)[number];

export const salesLineInputSchema = z.object({
  medicineId: z.string().min(1, "Medicine ID is required"),
  batchId: z.string().min(1, "Batch ID is required"),
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero"),
  unitRate: z.coerce.number().nonnegative("Unit rate cannot be negative"),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});

export type SalesLineInput = z.infer<typeof salesLineInputSchema>;

export const customerQuickInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().min(7, "Phone must be at least 7 digits").max(20),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export const salesInvoiceInputSchema = z.object({
  customerId: z.string().optional().or(z.literal("")),
  newCustomer: customerQuickInputSchema.optional(),
  doctorName: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  paymentMethod: z.enum(paymentMethods).default("CASH"),
  tenderedAmount: z.coerce.number().nonnegative().optional(),
  paymentReference: z.string().trim().max(100).optional().or(z.literal("")),
  billDiscountPercent: z.coerce.number().min(0).max(100).default(0),
  lines: z.array(salesLineInputSchema).min(1, "At least one item is required on the bill"),
});

export type SalesInvoiceInput = z.infer<typeof salesInvoiceInputSchema>;

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().min(7, "Valid phone number is required").max(20),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(3, "A cancellation reason of at least 3 characters is required").max(300),
});

export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

export type CalculatedSaleLine = {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};

export function calculateSalesLine(input: {
  quantity: number;
  unitRate: number;
  discountPercent?: number;
  taxPercent?: number;
}): CalculatedSaleLine {
  const discountPercent = input.discountPercent ?? 0;
  const taxPercent = input.taxPercent ?? 0;

  const gross = roundCurrency(input.quantity * input.unitRate);
  const discount = roundCurrency(gross * (discountPercent / 100));
  const taxable = roundCurrency(gross - discount);
  const tax = roundCurrency(taxable * (taxPercent / 100));
  const total = roundCurrency(taxable + tax);

  return { gross, discount, taxable, tax, total };
}

export type SalesTotals = {
  subtotal: number;
  lineDiscounts: number;
  billDiscount: number;
  taxable: number;
  tax: number;
  total: number;
  lineCalculations: CalculatedSaleLine[];
};

export function calculateSalesTotals(
  lines: Array<{
    quantity: number;
    unitRate: number;
    discountPercent?: number;
    taxPercent?: number;
  }>,
  billDiscountPercent: number = 0
): SalesTotals {
  const lineCalculations = lines.map((line) => calculateSalesLine(line));

  const subtotal = roundCurrency(lineCalculations.reduce((sum, l) => sum + l.taxable, 0));
  const lineDiscounts = roundCurrency(lineCalculations.reduce((sum, l) => sum + l.discount, 0));

  const validBillDiscountPercent = Math.min(100, Math.max(0, billDiscountPercent));
  const discountFactor = 1 - validBillDiscountPercent / 100;

  const taxable = roundCurrency(subtotal * discountFactor);
  const billDiscount = roundCurrency(subtotal - taxable);

  const tax = roundCurrency(
    lineCalculations.reduce((sum, l) => sum + l.tax * discountFactor, 0)
  );

  const total = roundCurrency(taxable + tax);

  return {
    subtotal,
    lineDiscounts,
    billDiscount,
    taxable,
    tax,
    total,
    lineCalculations,
  };
}

export function calculateChangeDue(tendered: number, total: number): number {
  if (tendered < total) return 0;
  return roundCurrency(tendered - total);
}

export type BatchStockValidation = {
  valid: boolean;
  error?: string;
};

export function validateBatchForSale(
  batch: {
    batchNumber: string;
    expiryDate: Date | string;
    stock: number;
  },
  requestedQuantity: number,
  referenceDate: Date = new Date()
): BatchStockValidation {
  const expiry = new Date(batch.expiryDate);
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  if (expiry < ref) {
    return {
      valid: false,
      error: `Batch ${batch.batchNumber} has expired on ${expiry.toISOString().slice(0, 10)} and cannot be dispensed.`,
    };
  }

  if (requestedQuantity > batch.stock) {
    return {
      valid: false,
      error: `Insufficient stock for batch ${batch.batchNumber}. Available: ${batch.stock}, requested: ${requestedQuantity}.`,
    };
  }

  return { valid: true };
}

