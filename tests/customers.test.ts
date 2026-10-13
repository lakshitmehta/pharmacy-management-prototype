import { describe, expect, it } from "vitest";
import {
  calculateCustomerBalance,
  categorizeKhataAging,
  allocateReceiptFifo,
  customerCreateSchema,
  customerUpdateSchema,
  khataReceiptSchema,
} from "@/domain/customers";

describe("calculateCustomerBalance", () => {
  it("computes net balance from debit and credit ledger entries", () => {
    const entries = [
      { side: "DEBIT" as const, amount: 250.0 }, // Sale invoice
      { side: "DEBIT" as const, amount: 150.0 }, // Another sale invoice
      { side: "CREDIT" as const, amount: 100.0 }, // Partial payment receipt
    ];
    // 250 + 150 - 100 = 300
    expect(calculateCustomerBalance(entries)).toBe(300.0);
  });

  it("returns zero when all debits are settled", () => {
    const entries = [
      { side: "DEBIT" as const, amount: 500.0 },
      { side: "CREDIT" as const, amount: 500.0 },
    ];
    expect(calculateCustomerBalance(entries)).toBe(0);
  });

  it("guards against negative balance from overpayment", () => {
    const entries = [
      { side: "DEBIT" as const, amount: 100.0 },
      { side: "CREDIT" as const, amount: 120.0 },
    ];
    expect(calculateCustomerBalance(entries)).toBe(0);
  });
});

describe("categorizeKhataAging", () => {
  const ref = new Date("2026-09-09T00:00:00Z");

  it("flags bills within 30 days as CURRENT_0_30", () => {
    const d15 = new Date("2026-08-25T00:00:00Z");
    expect(categorizeKhataAging(d15, ref)).toBe("CURRENT_0_30");
  });

  it("flags bills between 31 and 60 days as OVERDUE_31_60", () => {
    const d45 = new Date("2026-07-26T00:00:00Z");
    expect(categorizeKhataAging(d45, ref)).toBe("OVERDUE_31_60");
  });

  it("flags bills older than 60 days as HIGH_RISK_60_PLUS", () => {
    const d90 = new Date("2026-06-11T00:00:00Z");
    expect(categorizeKhataAging(d90, ref)).toBe("HIGH_RISK_60_PLUS");
  });
});

describe("allocateReceiptFifo", () => {
  it("allocates payment to oldest unpaid invoices first", () => {
    const openInvoices = [
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        total: 100,
        paid: 0,
        outstanding: 100,
        createdAt: "2026-08-01",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-002",
        total: 200,
        paid: 0,
        outstanding: 200,
        createdAt: "2026-08-15",
      },
      {
        id: "inv-3",
        invoiceNumber: "INV-003",
        total: 150,
        paid: 0,
        outstanding: 150,
        createdAt: "2026-09-01",
      },
    ];

    // Customer pays ₹250
    const allocations = allocateReceiptFifo(250, openInvoices);

    expect(allocations).toEqual([
      { invoiceId: "inv-1", amount: 100 }, // Fully pays inv-1
      { invoiceId: "inv-2", amount: 150 }, // Partially pays inv-2 (150 of 200)
    ]);
  });
});

describe("customer schemas", () => {
  it("validates valid customer creation input", () => {
    const parsed = customerCreateSchema.safeParse({
      name: "Harish Patel",
      phone: "9825098250",
      email: "harish@example.com",
      notes: "Regular patient",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid customer phone number", () => {
    const parsed = customerCreateSchema.safeParse({
      name: "Test",
      phone: "123", // too short
    });
    expect(parsed.success).toBe(false);
  });

  it("validates customer update schema", () => {
    const parsed = customerUpdateSchema.safeParse({
      name: "Harish Patel Updated",
      phone: "9825098251",
    });
    expect(parsed.success).toBe(true);
  });

  it("validates khata receipt schema", () => {
    const valid = khataReceiptSchema.safeParse({
      customerId: "cust-1",
      amount: 150.5,
      method: "UPI",
      reference: "UPI/123456/REF",
    });
    expect(valid.success).toBe(true);

    const invalid = khataReceiptSchema.safeParse({
      customerId: "cust-1",
      amount: -10, // negative amount
    });
    expect(invalid.success).toBe(false);
  });
});

