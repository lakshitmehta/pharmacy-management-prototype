import { z } from "zod";
import { allocateFifo, roundCurrency } from "@/domain/finance";

export { roundCurrency };

export const payableAgingBuckets = [
  "CURRENT_0_30",
  "OVERDUE_31_60",
  "CRITICAL_60_PLUS",
] as const;

export type PayableAgingBucket = (typeof payableAgingBuckets)[number];

export type SupplierLedgerItem = {
  side: "DEBIT" | "CREDIT";
  amount: number;
};

/**
 * Calculates net supplier payable balance.
 * In PillBills:
 * - DEBIT = Purchase Invoice / Store owes supplier (increases debt)
 * - CREDIT = Payment made to supplier / Credit note / Return (decreases debt)
 */
export function calculateSupplierBalance(entries: SupplierLedgerItem[]): number {
  const debits = entries.filter((e) => e.side === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
  const credits = entries.filter((e) => e.side === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
  return roundCurrency(Math.max(0, debits - credits));
}

/**
 * Categorizes the oldest unpaid purchase invoice into aging buckets.
 */
export function categorizePayableAging(
  oldestDate: Date | string,
  now: Date = new Date()
): PayableAgingBucket {
  const d = oldestDate instanceof Date ? oldestDate : new Date(oldestDate);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) return "CURRENT_0_30";
  if (diffDays <= 60) return "OVERDUE_31_60";
  return "CRITICAL_60_PLUS";
}

export type OpenPurchaseInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  outstanding: number;
  invoiceDate: Date | string;
};

/**
 * Allocates a supplier payment amount FIFO against the oldest open purchase invoices.
 */
export function allocateSupplierPaymentFifo(
  paymentAmount: number,
  openInvoices: OpenPurchaseInvoice[]
) {
  const sorted = [...openInvoices].sort((a, b) => {
    const da = a.invoiceDate instanceof Date ? a.invoiceDate : new Date(a.invoiceDate);
    const db = b.invoiceDate instanceof Date ? b.invoiceDate : new Date(b.invoiceDate);
    return da.getTime() - db.getTime();
  });

  return allocateFifo(
    paymentAmount,
    sorted.map((inv) => ({
      id: inv.id,
      amount: inv.total,
      outstanding: inv.outstanding,
    }))
  );
}

// Zod Validation Schemas
export const supplierPaymentInputSchema = z.object({
  supplierId: z.string().min(1, "Supplier ID is required"),
  amount: z.coerce.number().positive("Payment amount must be greater than zero"),
  method: z.enum(["CASH", "UPI", "CARD", "CREDIT", "CHEMIST", "OWN_USE"]).default("CASH"),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
  bankAccountId: z.string().optional().or(z.literal("")),
  cashRegisterId: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(250).optional().or(z.literal("")),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentInputSchema>;

export const supplierNoteInputSchema = z.object({
  supplierId: z.string().min(1, "Supplier ID is required"),
  type: z.enum(["CREDIT_NOTE", "DEBIT_NOTE"]),
  amount: z.coerce.number().positive("Note amount must be greater than zero"),
  reason: z.string().trim().min(1, "Reason is required").max(250),
  batchId: z.string().optional().or(z.literal("")),
  returnQuantity: z.coerce.number().int().positive().optional(),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
});

export type SupplierNoteInput = z.infer<typeof supplierNoteInputSchema>;

