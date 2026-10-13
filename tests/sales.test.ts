import { describe, expect, it } from "vitest";
import {
  calculateSalesLine,
  calculateSalesTotals,
  calculateChangeDue,
  validateBatchForSale,
  salesInvoiceInputSchema,
  customerInputSchema,
  voidInvoiceSchema,
} from "@/domain/sales";

describe("calculateSalesLine", () => {
  it("calculates line with no discount and standard 5% GST", () => {
    const line = calculateSalesLine({
      quantity: 2,
      unitRate: 100,
      discountPercent: 0,
      taxPercent: 5,
    });
    expect(line).toEqual({
      gross: 200,
      discount: 0,
      taxable: 200,
      tax: 10,
      total: 210,
    });
  });

  it("calculates line with 10% line discount and 12% GST", () => {
    const line = calculateSalesLine({
      quantity: 3,
      unitRate: 50,
      discountPercent: 10,
      taxPercent: 12,
    });
    // Gross: 150
    // Discount: 15
    // Taxable: 135
    // Tax: 135 * 0.12 = 16.20
    // Total: 151.20
    expect(line).toEqual({
      gross: 150,
      discount: 15,
      taxable: 135,
      tax: 16.2,
      total: 151.2,
    });
  });

  it("handles decimal rates and currency rounding accurately", () => {
    const line = calculateSalesLine({
      quantity: 7,
      unitRate: 13.33,
      discountPercent: 5,
      taxPercent: 18,
    });
    // Gross: 7 * 13.33 = 93.31
    // Discount: 93.31 * 0.05 = 4.6655 -> 4.67
    // Taxable: 93.31 - 4.67 = 88.64
    // Tax: 88.64 * 0.18 = 15.9552 -> 15.96
    // Total: 88.64 + 15.96 = 104.60
    expect(line.gross).toBe(93.31);
    expect(line.discount).toBe(4.67);
    expect(line.taxable).toBe(88.64);
    expect(line.tax).toBe(15.96);
    expect(line.total).toBe(104.6);
  });
});

describe("calculateSalesTotals", () => {
  it("sums multiple lines without bill discount", () => {
    const totals = calculateSalesTotals([
      { quantity: 2, unitRate: 100, discountPercent: 0, taxPercent: 5 }, // Taxable 200, Tax 10, Total 210
      { quantity: 1, unitRate: 200, discountPercent: 10, taxPercent: 12 }, // Taxable 180, Tax 21.60, Total 201.60
    ]);

    expect(totals.subtotal).toBe(380);
    expect(totals.lineDiscounts).toBe(20);
    expect(totals.billDiscount).toBe(0);
    expect(totals.taxable).toBe(380);
    expect(totals.tax).toBe(31.6);
    expect(totals.total).toBe(411.6);
  });

  it("applies bill-level discount proportionally across taxable and tax", () => {
    const totals = calculateSalesTotals(
      [
        { quantity: 1, unitRate: 100, discountPercent: 0, taxPercent: 10 }, // Taxable 100, Tax 10
      ],
      10 // 10% overall bill discount
    );

    // Bill discount: 10%
    // Net Taxable: 90
    // Net Tax: 90 * 0.10 = 9
    // Net Total: 99
    expect(totals.subtotal).toBe(100);
    expect(totals.billDiscount).toBe(10);
    expect(totals.taxable).toBe(90);
    expect(totals.tax).toBe(9);
    expect(totals.total).toBe(99);
  });
});

describe("calculateChangeDue", () => {
  it("calculates exact change when tendered exceeds total", () => {
    expect(calculateChangeDue(500, 342.5)).toBe(157.5);
  });

  it("returns zero when tendered equals total", () => {
    expect(calculateChangeDue(250, 250)).toBe(0);
  });

  it("returns zero when tendered is less than total", () => {
    expect(calculateChangeDue(200, 250)).toBe(0);
  });
});

describe("validateBatchForSale", () => {
  const refDate = new Date("2026-09-09T10:00:00Z");

  it("approves valid batch with sufficient stock and healthy shelf life", () => {
    const result = validateBatchForSale(
      {
        batchNumber: "B-101",
        expiryDate: new Date("2027-06-30"),
        stock: 50,
      },
      10,
      refDate
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects batch if expired prior to sale date", () => {
    const result = validateBatchForSale(
      {
        batchNumber: "EXP-99",
        expiryDate: new Date("2026-08-15"),
        stock: 20,
      },
      5,
      refDate
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects batch if requested quantity exceeds available stock", () => {
    const result = validateBatchForSale(
      {
        batchNumber: "B-102",
        expiryDate: new Date("2027-12-31"),
        stock: 8,
      },
      10,
      refDate
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/insufficient stock/i);
  });
});

describe("sales validation schemas", () => {
  it("validates well-formed sales invoice input", () => {
    const valid = salesInvoiceInputSchema.safeParse({
      paymentMethod: "CASH",
      tenderedAmount: 500,
      lines: [
        {
          medicineId: "med-1",
          batchId: "batch-1",
          quantity: 2,
          unitRate: 45.5,
          discountPercent: 5,
          taxPercent: 5,
        },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it("rejects sale with empty lines array", () => {
    const invalid = salesInvoiceInputSchema.safeParse({
      paymentMethod: "CASH",
      lines: [],
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects non-positive quantity", () => {
    const invalid = salesInvoiceInputSchema.safeParse({
      paymentMethod: "CASH",
      lines: [
        {
          medicineId: "med-1",
          batchId: "batch-1",
          quantity: 0,
          unitRate: 50,
        },
      ],
    });
    expect(invalid.success).toBe(false);
  });

  it("validates customer input", () => {
    const valid = customerInputSchema.safeParse({
      name: "Amit Sharma",
      phone: "9876543210",
      email: "amit@example.com",
      gstin: "07AAAAA0000A1Z5",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects customer with short phone number", () => {
    const invalid = customerInputSchema.safeParse({
      name: "Amit Sharma",
      phone: "123",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates void reason with minimum length requirement", () => {
    expect(voidInvoiceSchema.safeParse({ reason: "Customer cancelled prescription" }).success).toBe(true);
    expect(voidInvoiceSchema.safeParse({ reason: "no" }).success).toBe(false);
  });
});

