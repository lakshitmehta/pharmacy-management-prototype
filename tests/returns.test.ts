import { describe, expect, it } from "vitest";
import {
  validateReturnQuantity,
  calculateReturnLineRefund,
  calculateReturnTotals,
  calculateExchangeDifferential,
  salesReturnInputSchema,
  salesExchangeInputSchema,
} from "@/domain/returns";

describe("validateReturnQuantity", () => {
  it("allows return within eligible returnable limit", () => {
    const res = validateReturnQuantity(10, 2, 5); // 10 original, 2 already returned, requesting 5
    expect(res.valid).toBe(true);
    expect(res.returnable).toBe(8);
  });

  it("rejects return exceeding remaining returnable units", () => {
    const res = validateReturnQuantity(10, 4, 7); // 6 remaining, requesting 7
    expect(res.valid).toBe(false);
    expect(res.returnable).toBe(6);
    expect(res.error).toMatch(/Cannot return 7 units/);
  });

  it("rejects zero or negative return request", () => {
    const res = validateReturnQuantity(10, 0, 0);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/positive/);
  });
});

describe("calculateReturnLineRefund", () => {
  it("computes exact proportional refund including tax and line discount", () => {
    const originalLine = {
      id: "line-1",
      quantity: 4,
      unitRate: 100, // Gross: 400
      discount: 40, // 10% discount
      tax: 18, // 5% of taxable 360 = 18
      total: 378,
    };

    // Returning 2 units (half the line)
    const refund = calculateReturnLineRefund(originalLine, 2);

    expect(refund).toEqual({
      salesLineId: "line-1",
      quantity: 2,
      unitRate: 100,
      refundGross: 200,
      refundDiscount: 20,
      refundTaxable: 180,
      refundTax: 9,
      refundTotal: 189, // Exactly half of 378
    });
  });

  it("aggregates multiple return lines into return totals", () => {
    const lines = [
      {
        salesLineId: "line-1",
        quantity: 2,
        unitRate: 100,
        refundGross: 200,
        refundDiscount: 20,
        refundTaxable: 180,
        refundTax: 9,
        refundTotal: 189,
      },
      {
        salesLineId: "line-2",
        quantity: 1,
        unitRate: 50,
        refundGross: 50,
        refundDiscount: 0,
        refundTaxable: 50,
        refundTax: 6,
        refundTotal: 56,
      },
    ];

    const totals = calculateReturnTotals(lines);
    expect(totals.gross).toBe(250);
    expect(totals.discount).toBe(20);
    expect(totals.taxable).toBe(230);
    expect(totals.tax).toBe(15);
    expect(totals.totalRefund).toBe(245);
    expect(totals.lines).toHaveLength(2);
  });
});

describe("calculateExchangeDifferential", () => {
  it("determines customer payment when replacement exceeds return value", () => {
    const diff = calculateExchangeDifferential(150, 220);
    expect(diff).toEqual({
      returnTotal: 150,
      replacementTotal: 220,
      difference: 70,
      settlementType: "CUSTOMER_PAYS",
    });
  });

  it("determines store refund when return exceeds replacement value", () => {
    const diff = calculateExchangeDifferential(250, 180);
    expect(diff).toEqual({
      returnTotal: 250,
      replacementTotal: 180,
      difference: 70,
      settlementType: "STORE_REFUNDS",
    });
  });

  it("detects even value exchange", () => {
    const diff = calculateExchangeDifferential(100, 100);
    expect(diff).toEqual({
      returnTotal: 100,
      replacementTotal: 100,
      difference: 0,
      settlementType: "EVEN_EXCHANGE",
    });
  });
});

describe("return & exchange schemas", () => {
  it("validates well-formed sales return schema", () => {
    const valid = salesReturnInputSchema.safeParse({
      invoiceId: "inv-101",
      settlementType: "KHATA_CREDIT",
      lines: [
        {
          salesLineId: "line-1",
          batchId: "batch-1",
          quantity: 2,
          reason: "DOCTOR_CHANGED_PRESCRIPTION",
        },
      ],
    });
    expect(valid.success).toBe(true);
  });

  it("rejects return with empty lines array", () => {
    const invalid = salesReturnInputSchema.safeParse({
      invoiceId: "inv-101",
      lines: [],
    });
    expect(invalid.success).toBe(false);
  });

  it("validates sales exchange schema", () => {
    const valid = salesExchangeInputSchema.safeParse({
      invoiceId: "inv-101",
      returnLines: [
        {
          salesLineId: "line-1",
          batchId: "batch-1",
          quantity: 1,
          reason: "WRONG_MEDICINE_DISPENSED",
        },
      ],
      replacementLines: [
        {
          medicineId: "med-2",
          batchId: "batch-2",
          quantity: 1,
          unitRate: 120,
          mrp: 120,
          taxPercent: 5,
        },
      ],
      settlementMethod: "CASH",
    });
    expect(valid.success).toBe(true);
  });
});

