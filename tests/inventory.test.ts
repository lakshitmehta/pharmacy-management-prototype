import { describe, expect, it } from "vitest";
import {
  calculateBatchStock,
  calculateInventoryValuation,
  categorizeExpiry,
  checkStockHealth,
  medicineCreateSchema,
  medicineUpdateSchema,
  stockAdjustmentSchema,
} from "@/domain/inventory";

describe("batch stock calculations", () => {
  it("accumulates inbound, outbound, and adjustment movements correctly", () => {
    const movements = [
      { type: "OPENING" as const, quantity: 100 },
      { type: "PURCHASE" as const, quantity: 50 },
      { type: "SALE" as const, quantity: 30 },
      { type: "CUSTOMER_RETURN" as const, quantity: 5 },
      { type: "SUPPLIER_RETURN" as const, quantity: 10 },
      { type: "ADJUSTMENT" as const, quantity: -5 },
    ];
    // 100 + 50 - 30 + 5 - 10 + (-5) = 110
    expect(calculateBatchStock(movements)).toBe(110);
  });

  it("handles positive adjustments correctly", () => {
    const movements = [
      { type: "OPENING" as const, quantity: 20 },
      { type: "ADJUSTMENT" as const, quantity: 8 },
    ];
    expect(calculateBatchStock(movements)).toBe(28);
  });

  it("handles zero movements and results in zero stock", () => {
    expect(calculateBatchStock([])).toBe(0);
  });
});

describe("inventory valuation calculations", () => {
  it("computes cost value, MRP value, and total units with currency rounding", () => {
    const valuation = calculateInventoryValuation([
      { stock: 10, purchaseRate: 15.5, mrp: 22.0 },
      { stock: 5, purchaseRate: 45.25, mrp: 60.0 },
    ]);
    // Cost: 10*15.5 + 5*45.25 = 155 + 226.25 = 381.25
    // MRP: 10*22 + 5*60 = 220 + 300 = 520
    // Units: 15
    expect(valuation).toEqual({
      stockValue: 381.25,
      mrpValue: 520.0,
      totalUnits: 15,
    });
  });

  it("does not count negative stock against positive asset valuation", () => {
    const valuation = calculateInventoryValuation([
      { stock: 10, purchaseRate: 10, mrp: 20 },
      { stock: -2, purchaseRate: 10, mrp: 20 },
    ]);
    expect(valuation.stockValue).toBe(100);
    expect(valuation.mrpValue).toBe(200);
    expect(valuation.totalUnits).toBe(10);
  });
});

describe("expiry categorization", () => {
  const ref = new Date("2026-09-09T00:00:00Z");

  it("flags past dates as EXPIRED", () => {
    const past = new Date("2026-09-08T00:00:00Z");
    expect(categorizeExpiry(past, ref)).toBe("EXPIRED");
  });

  it("flags dates within 90 days as NEAR_EXPIRY", () => {
    const today = new Date("2026-09-09T00:00:00Z");
    const in30Days = new Date("2026-10-09T00:00:00Z");
    const in90Days = new Date("2026-12-08T00:00:00Z");
    expect(categorizeExpiry(today, ref)).toBe("NEAR_EXPIRY");
    expect(categorizeExpiry(in30Days, ref)).toBe("NEAR_EXPIRY");
    expect(categorizeExpiry(in90Days, ref)).toBe("NEAR_EXPIRY");
  });

  it("flags dates beyond 90 days as HEALTHY", () => {
    const in95Days = new Date("2026-12-15T00:00:00Z");
    const nextYear = new Date("2027-12-31T00:00:00Z");
    expect(categorizeExpiry(in95Days, ref)).toBe("HEALTHY");
    expect(categorizeExpiry(nextYear, ref)).toBe("HEALTHY");
  });
});

describe("stock health status", () => {
  it("flags negative stock as NEGATIVE", () => {
    expect(checkStockHealth(-1, 15)).toBe("NEGATIVE");
  });

  it("flags stock at or below safety limit as LOW", () => {
    expect(checkStockHealth(0, 15)).toBe("LOW");
    expect(checkStockHealth(10, 15)).toBe("LOW");
    expect(checkStockHealth(15, 15)).toBe("LOW");
  });

  it("flags stock above safety limit as HEALTHY", () => {
    expect(checkStockHealth(16, 15)).toBe("HEALTHY");
    expect(checkStockHealth(100, 15)).toBe("HEALTHY");
  });
});

describe("validation schemas", () => {
  it("validates medicine creation with opening batch", () => {
    const valid = medicineCreateSchema.safeParse({
      name: "Dolo 650",
      genericName: "Paracetamol",
      manufacturer: "Micro Labs",
      barcode: "8901234567890",
      hsn: "30049099",
      gstRate: 12,
      safetyLimit: 20,
      openingBatch: {
        batchNumber: "DL-99",
        expiryDate: "2027-12-31",
        purchaseRate: 25.5,
        mrp: 32.0,
        packSize: 1,
        quantity: 50,
      },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects empty medicine name", () => {
    const invalid = medicineCreateSchema.safeParse({
      name: "   ",
      safetyLimit: 10,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates partial medicine updates", () => {
    const update = medicineUpdateSchema.safeParse({
      safetyLimit: 30,
      gstRate: 5,
    });
    expect(update.success).toBe(true);
  });

  it("rejects zero stock adjustment delta", () => {
    const invalid = stockAdjustmentSchema.safeParse({
      batchId: "batch-1",
      quantityDelta: 0,
      reason: "Inventory count audit",
    });
    expect(invalid.success).toBe(false);
  });

  it("accepts valid stock adjustment delta and reason", () => {
    const valid = stockAdjustmentSchema.safeParse({
      batchId: "batch-1",
      quantityDelta: -3,
      reason: "Damaged vial in storage",
      unitRate: 45.0,
    });
    expect(valid.success).toBe(true);
  });
});
