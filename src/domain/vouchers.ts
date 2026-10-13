import { z } from "zod";
import { assertBalanced, roundCurrency } from "@/domain/finance";

export { assertBalanced, roundCurrency };

export const voucherTypes = ["PAYMENT", "RECEIPT", "JOURNAL", "CONTRA"] as const;
export type VoucherTypeEnum = (typeof voucherTypes)[number];

export const voucherLineSchema = z.object({
  account: z.string().trim().min(1, "Account name is required").max(100),
  debit: z.coerce.number().min(0, "Debit amount cannot be negative").default(0),
  credit: z.coerce.number().min(0, "Credit amount cannot be negative").default(0),
}).refine(
  (line) => (line.debit > 0 && line.credit === 0) || (line.credit > 0 && line.debit === 0),
  { message: "A voucher line must specify either a debit OR a credit amount, not both." }
);

export type VoucherLineInput = z.infer<typeof voucherLineSchema>;

export const voucherCreateSchema = z.object({
  type: z.enum(voucherTypes),
  date: z.coerce.date().default(() => new Date()),
  narration: z.string().trim().max(300).optional().or(z.literal("")),
  lines: z.array(voucherLineSchema).min(2, "Voucher must contain at least 2 lines (debit and credit)"),
}).refine(
  (voucher) => {
    const totalDebit = roundCurrency(voucher.lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = roundCurrency(voucher.lines.reduce((s, l) => s + l.credit, 0));
    return totalDebit > 0 && totalDebit === totalCredit;
  },
  { message: "Voucher debits and credits must balance and be greater than zero." }
);

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

