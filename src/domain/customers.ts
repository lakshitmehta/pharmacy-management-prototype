import { z } from "zod";
import { allocateFifo, roundCurrency } from "@/domain/finance";
import { paymentMethods } from "@/domain/sales";

export { roundCurrency };

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().min(7, "Valid phone number (min 7 digits) is required").max(20),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = z.object({
  name: z.string().trim().min(1, "Customer name cannot be empty").max(120).optional(),
  phone: z.string().trim().min(7, "Phone must be at least 7 digits").max(20).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const khataReceiptSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  amount: z.coerce.number().positive("Receipt amount must be greater than zero"),
  method: z.enum(paymentMethods).default("CASH"),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
});

export type KhataReceiptInput = z.infer<typeof khataReceiptSchema>;

export function calculateCustomerBalance(
  entries: Array<{ side: "DEBIT" | "CREDIT"; amount: number }>
): number {
  const balance = entries.reduce((acc, entry) => {
    return entry.side === "DEBIT" ? acc + entry.amount : acc - entry.amount;
  }, 0);
  return roundCurrency(Math.max(0, balance));
}

export type KhataAgingBucket = "CURRENT_0_30" | "OVERDUE_31_60" | "HIGH_RISK_60_PLUS";

export function categorizeKhataAging(
  oldestDate: Date | string,
  referenceDate: Date = new Date()
): KhataAgingBucket {
  const d = new Date(oldestDate).getTime();
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  const diffDays = Math.floor((ref - d) / (1000 * 60 * 60 * 24));

  if (diffDays > 60) return "HIGH_RISK_60_PLUS";
  if (diffDays > 30) return "OVERDUE_31_60";
  return "CURRENT_0_30";
}

export type OpenInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  outstanding: number;
  createdAt: Date | string;
};

export function allocateReceiptFifo(
  amount: number,
  openInvoices: OpenInvoice[]
) {
  const balances = openInvoices.map((inv) => ({
    id: inv.id,
    amount: inv.total,
    outstanding: inv.outstanding,
  }));
  return allocateFifo(amount, balances);
}

