import { describe, expect, it } from "vitest";
import {
  calculateSupplierBalance,
  categorizePayableAging,
  allocateSupplierPaymentFifo,
  supplierPaymentInputSchema,
  supplierNoteInputSchema,
} from "@/domain/payables";

describe("Supplier Payables Domain", () => {
  it("calculates supplier balance from debits (purchases) and credits (payments)", () => {
    // 2 purchase bills: 1000 + 500 = 1500 debit
    // 1 payment: 600 credit
    // Balance = 900
    const balance = calculateSupplierBalance([
      { side: "DEBIT", amount: 1000 },
      { side: "DEBIT", amount: 500 },
      { side: "CREDIT", amount: 600 },
    ]);
    expect(balance).toBe(900);
  });

  it("returns 0 balance when payments equal or exceed purchases", () => {
    const balance = calculateSupplierBalance([
      { side: "DEBIT", amount: 500 },
      { side: "CREDIT", amount: 500 },
    ]);
    expect(balance).toBe(0);
  });

  it("categorizes payable aging into 0-30, 31-60, and 60+ days", () => {
    const now = new Date("2026-09-10T00:00:00Z");

    const date10DaysAgo = new Date("2026-08-31T00:00:00Z");
    expect(categorizePayableAging(date10DaysAgo, now)).toBe("CURRENT_0_30");

    const date45DaysAgo = new Date("2026-07-27T00:00:00Z");
    expect(categorizePayableAging(date45DaysAgo, now)).toBe("OVERDUE_31_60");

    const date75DaysAgo = new Date("2026-06-27T00:00:00Z");
    expect(categorizePayableAging(date75DaysAgo, now)).toBe("CRITICAL_60_PLUS");
  });

  it("allocates supplier payment FIFO across oldest purchase invoices", () => {
    const openInvoices = [
      {
        id: "inv-2",
        invoiceNumber: "PUR-002",
        total: 500,
        paid: 100,
        outstanding: 400,
        invoiceDate: new Date("2026-08-15"),
      },
      {
        id: "inv-1",
        invoiceNumber: "PUR-001",
        total: 300,
        paid: 0,
        outstanding: 300,
        invoiceDate: new Date("2026-08-01"), // Oldest
      },
    ];

    // Pay 500: should fully pay inv-1 (300) and partially pay inv-2 (200)
    const allocations = allocateSupplierPaymentFifo(500, openInvoices);
    expect(allocations).toEqual([
      { invoiceId: "inv-1", amount: 300 },
      { invoiceId: "inv-2", amount: 200 },
    ]);
  });

  it("validates supplierPaymentInputSchema", () => {
    const valid = supplierPaymentInputSchema.safeParse({
      supplierId: "supp-1",
      amount: 1500,
      method: "UPI",
      reference: "NEFT987654",
    });
    expect(valid.success).toBe(true);

    const invalid = supplierPaymentInputSchema.safeParse({
      supplierId: "",
      amount: -50,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates supplierNoteInputSchema", () => {
    const validCreditNote = supplierNoteInputSchema.safeParse({
      supplierId: "supp-1",
      type: "CREDIT_NOTE",
      amount: 250,
      reason: "Expired stock return credit from distributor",
      returnQuantity: 5,
    });
    expect(validCreditNote.success).toBe(true);
  });
});
