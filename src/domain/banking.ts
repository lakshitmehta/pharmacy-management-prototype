import { z } from "zod";
import { roundCurrency } from "@/domain/finance";

export { roundCurrency };

export type AccountEntry = {
  side: "DEBIT" | "CREDIT";
  amount: number;
};

/**
 * Calculates current balance of a Bank Account or Cash Register.
 * For asset accounts (Cash / Bank):
 * - DEBIT = Inflow (increases balance)
 * - CREDIT = Outflow (decreases balance)
 */
export function calculateAccountBalance(opening: number, entries: AccountEntry[]): number {
  const debits = entries.filter((e) => e.side === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
  const credits = entries.filter((e) => e.side === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
  return roundCurrency(opening + debits - credits);
}

// Zod Schemas
export const createBankAccountSchema = z
  .object({
    name: z.string().trim().min(2, "Bank account name is required").max(100),
    opening: z.coerce.number().min(0, "Opening balance cannot be negative").default(0),
    openingBalance: z.coerce.number().min(0, "Opening balance cannot be negative").optional(),
  })
  .transform((data) => ({
    name: data.name,
    opening: data.openingBalance !== undefined ? data.openingBalance : data.opening,
  }));

export const createCashRegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Cash register name is required").max(100),
    opening: z.coerce.number().min(0, "Opening balance cannot be negative").default(0),
    openingBalance: z.coerce.number().min(0, "Opening balance cannot be negative").optional(),
  })
  .transform((data) => ({
    name: data.name,
    opening: data.openingBalance !== undefined ? data.openingBalance : data.opening,
  }));

export const manualCashEntrySchema = z.object({
  targetType: z.enum(["BANK", "CASH"]),
  accountId: z.string().min(1, "Account ID is required"),
  type: z.enum(["INFLOW", "OUTFLOW"]),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().trim().min(2, "Description is required").max(200),
  referenceId: z.string().trim().max(100).optional().or(z.literal("")),
});

export type ManualCashEntryInput = z.infer<typeof manualCashEntrySchema>;

export const contraTransferSchema = z.object({
  transferType: z.enum(["CASH_TO_BANK", "BANK_TO_CASH"]),
  bankAccountId: z.string().min(1, "Bank account is required"),
  cashRegisterId: z.string().min(1, "Cash register is required"),
  amount: z.coerce.number().positive("Transfer amount must be greater than zero"),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
});

export type ContraTransferInput = z.infer<typeof contraTransferSchema>;

