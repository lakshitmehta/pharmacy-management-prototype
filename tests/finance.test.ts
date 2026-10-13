import { describe, expect, it } from "vitest";
import { allocateFifo, assertBalanced, calculateSaleLine } from "@/domain/finance";
import { canOpenDevice } from "@/domain/sessions";

describe("sale calculations", () => {
  it("calculates discount, tax, and total", () => {
    expect(calculateSaleLine({ quantity: 2, unitRate: 100, discountPercent: 10, taxPercent: 5 })).toEqual({
      gross: 200,
      discount: 20,
      taxable: 180,
      tax: 9,
      total: 189,
    });
  });
});

describe("FIFO allocation", () => {
  it("allocates against oldest balances first", () => {
    expect(allocateFifo(125, [
      { id: "old", amount: 100, outstanding: 100 },
      { id: "new", amount: 100, outstanding: 100 },
    ])).toEqual([
      { invoiceId: "old", amount: 100 },
      { invoiceId: "new", amount: 25 },
    ]);
  });
});

describe("voucher balancing", () => {
  it("accepts equal debit and credit totals", () => {
    expect(() => assertBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }])).not.toThrow();
  });

  it("rejects unbalanced entries", () => {
    expect(() => assertBalanced([{ debit: 100, credit: 0 }])).toThrow(/must balance/);
  });
});

describe("device sessions", () => {
  it("allows an existing device signature to reconnect", () => {
    expect(canOpenDevice(5, true)).toBe(true);
  });

  it("blocks a sixth distinct device", () => {
    expect(canOpenDevice(5, false)).toBe(false);
  });
});
