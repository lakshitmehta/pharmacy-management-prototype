import { z } from "zod";
import { roundCurrency } from "@/domain/finance";
import { paymentMethods } from "@/domain/sales";

export { roundCurrency };

export const returnReasons = [
  "PATIENT_RECOVERED",
  "WRONG_MEDICINE_DISPENSED",
  "ADVERSE_REACTION",
  "NEAR_EXPIRY_REJECTED",
  "EXCESS_QUANTITY",
  "DOCTOR_CHANGED_PRESCRIPTION",
  "OTHER",
] as const;

export type ReturnReasonType = (typeof returnReasons)[number];

export const returnSettlementTypes = [
  "REFUND_CASH",
  "REFUND_UPI",
  "KHATA_CREDIT",
  "STORE_CREDIT",
] as const;

export type ReturnSettlementType = (typeof returnSettlementTypes)[number];

export const salesReturnLineInputSchema = z.object({
  salesLineId: z.string().min(1, "Sales line ID is required"),
  batchId: z.string().min(1, "Batch ID is required"),
  quantity: z.coerce.number().int().positive("Return quantity must be greater than zero"),
  reason: z.string().trim().min(1, "Return reason is required").max(200),
});

export type SalesReturnLineInput = z.infer<typeof salesReturnLineInputSchema>;

export const salesReturnInputSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  settlementType: z.enum(returnSettlementTypes).default("REFUND_CASH"),
  refundReference: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  lines: z.array(salesReturnLineInputSchema).min(1, "At least one item must be returned"),
});

export type SalesReturnInput = z.infer<typeof salesReturnInputSchema>;

export const salesExchangeLineInputSchema = z.object({
  medicineId: z.string().min(1, "Medicine ID is required"),
  batchId: z.string().min(1, "Batch ID is required"),
  quantity: z.coerce.number().int().positive("Exchange quantity must be greater than zero"),
  unitRate: z.coerce.number().nonnegative("Unit rate cannot be negative"),
  mrp: z.coerce.number().nonnegative("MRP cannot be negative"),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});

export const salesExchangeInputSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  returnLines: z.array(salesReturnLineInputSchema).min(1, "At least one item must be returned"),
  replacementLines: z.array(salesExchangeLineInputSchema).min(1, "At least one replacement item is required"),
  settlementMethod: z.enum(paymentMethods).default("CASH"),
  paymentReference: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export type SalesExchangeInput = z.infer<typeof salesExchangeInputSchema>;

export function validateReturnQuantity(
  originalQuantity: number,
  alreadyReturned: number,
  requestedQuantity: number
): { valid: boolean; returnable: number; error?: string } {
  const returnable = Math.max(0, originalQuantity - alreadyReturned);

  if (requestedQuantity <= 0) {
    return { valid: false, returnable, error: "Return quantity must be positive." };
  }

  if (requestedQuantity > returnable) {
    return {
      valid: false,
      returnable,
      error: `Cannot return ${requestedQuantity} units. Only ${returnable} units remain eligible for return.`,
    };
  }

  return { valid: true, returnable };
}

export type CalculatedReturnLine = {
  salesLineId: string;
  quantity: number;
  unitRate: number;
  refundGross: number;
  refundDiscount: number;
  refundTaxable: number;
  refundTax: number;
  refundTotal: number;
};

export function calculateReturnLineRefund(
  line: {
    id: string;
    quantity: number;
    unitRate: number;
    discount: number;
    tax: number;
    total: number;
  },
  returnQuantity: number
): CalculatedReturnLine {
  if (line.quantity <= 0) {
    throw new Error("Original line quantity must be greater than zero");
  }

  const ratio = returnQuantity / line.quantity;
  const refundGross = roundCurrency(line.unitRate * returnQuantity);
  const refundDiscount = roundCurrency(line.discount * ratio);
  const refundTaxable = roundCurrency(refundGross - refundDiscount);
  const refundTax = roundCurrency(line.tax * ratio);
  const refundTotal = roundCurrency(refundTaxable + refundTax);

  return {
    salesLineId: line.id,
    quantity: returnQuantity,
    unitRate: line.unitRate,
    refundGross,
    refundDiscount,
    refundTaxable,
    refundTax,
    refundTotal,
  };
}

export type ReturnTotals = {
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  totalRefund: number;
  lines: CalculatedReturnLine[];
};

export function calculateReturnTotals(lines: CalculatedReturnLine[]): ReturnTotals {
  const gross = roundCurrency(lines.reduce((sum, l) => sum + l.refundGross, 0));
  const discount = roundCurrency(lines.reduce((sum, l) => sum + l.refundDiscount, 0));
  const taxable = roundCurrency(lines.reduce((sum, l) => sum + l.refundTaxable, 0));
  const tax = roundCurrency(lines.reduce((sum, l) => sum + l.refundTax, 0));
  const totalRefund = roundCurrency(lines.reduce((sum, l) => sum + l.refundTotal, 0));

  return { gross, discount, taxable, tax, totalRefund, lines };
}

export type ExchangeDifferential = {
  returnTotal: number;
  replacementTotal: number;
  difference: number; // positive = customer pays difference, negative = store refunds customer
  settlementType: "CUSTOMER_PAYS" | "STORE_REFUNDS" | "EVEN_EXCHANGE";
};

export function calculateExchangeDifferential(
  returnTotal: number,
  replacementTotal: number
): ExchangeDifferential {
  const ret = roundCurrency(returnTotal);
  const rep = roundCurrency(replacementTotal);
  const diff = roundCurrency(rep - ret);

  if (diff > 0) {
    return {
      returnTotal: ret,
      replacementTotal: rep,
      difference: diff,
      settlementType: "CUSTOMER_PAYS",
    };
  } else if (diff < 0) {
    return {
      returnTotal: ret,
      replacementTotal: rep,
      difference: Math.abs(diff),
      settlementType: "STORE_REFUNDS",
    };
  }

  return {
    returnTotal: ret,
    replacementTotal: rep,
    difference: 0,
    settlementType: "EVEN_EXCHANGE",
  };
}

