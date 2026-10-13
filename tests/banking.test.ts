import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  contraTransferSchema,
  manualCashEntrySchema,
} from "@/domain/banking";
import {
  voucherCreateSchema,
  voucherLineSchema,
} from "@/domain/vouchers";

describe("Banking & Cash Domain", () => {
  it("calculates account balance from opening, inflows (debit), and outflows (credit)", () => {
    // Opening = 5,000
    // Inflows: 2,000 + 1,500 = 3,500 debit
    // Outflows: 4,000 credit
    // Balance = 5,000 + 3,500 - 4,000 = 4,500
    const balance = calculateAccountBalance(5000, [
      { side: "DEBIT", amount: 2000 },
      { side: "DEBIT", amount: 1500 },
      { side: "CREDIT", amount: 4000 },
    ]);
    expect(balance).toBe(4500);
  });

  it("validates contraTransferSchema", () => {
    const valid = contraTransferSchema.safeParse({
      transferType: "CASH_TO_BANK",
      bankAccountId: "bank-1",
      cashRegisterId: "cash-1",
      amount: 10000,
      description: "Day-end cash deposit",
    });
    expect(valid.success).toBe(true);

    const invalid = contraTransferSchema.safeParse({
      transferType: "CASH_TO_BANK",
      bankAccountId: "",
      cashRegisterId: "cash-1",
      amount: -100,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates manualCashEntrySchema", () => {
    const valid = manualCashEntrySchema.safeParse({
      targetType: "CASH",
      accountId: "cash-1",
      type: "OUTFLOW",
      amount: 250,
      description: "Tea and cleaning supplies expense",
    });
    expect(valid.success).toBe(true);
  });
});

describe("Double-Entry Vouchers Domain", () => {
  it("validates single voucher line specifying either debit or credit", () => {
    const validDebit = voucherLineSchema.safeParse({
      account: "Purchases A/C",
      debit: 500,
      credit: 0,
    });
    expect(validDebit.success).toBe(true);

    const validCredit = voucherLineSchema.safeParse({
      account: "Cash A/C",
      debit: 0,
      credit: 500,
    });
    expect(validCredit.success).toBe(true);

    const invalidBoth = voucherLineSchema.safeParse({
      account: "Bad Line",
      debit: 500,
      credit: 500,
    });
    expect(invalidBoth.success).toBe(false);
  });

  it("accepts balanced multi-line voucher", () => {
    const balancedVoucher = voucherCreateSchema.safeParse({
      type: "PAYMENT",
      date: new Date(),
      narration: "Rent payment for counter space",
      lines: [
        { account: "Rent Expense A/C", debit: 12000, credit: 0 },
        { account: "Main Bank A/C", debit: 0, credit: 12000 },
      ],
    });
    expect(balancedVoucher.success).toBe(true);
  });

  it("rejects unbalanced voucher where debits !== credits", () => {
    const unbalancedVoucher = voucherCreateSchema.safeParse({
      type: "JOURNAL",
      date: new Date(),
      narration: "Unbalanced entry",
      lines: [
        { account: "Account A", debit: 500, credit: 0 },
        { account: "Account B", debit: 0, credit: 400 },
      ],
    });
    expect(unbalancedVoucher.success).toBe(false);
  });
});

