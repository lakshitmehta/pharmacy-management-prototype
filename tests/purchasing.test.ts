import { describe, expect, it } from "vitest";
import { calculatePurchaseTotals, supplierInputSchema } from "@/domain/purchasing";
import { calculateStock } from "@/domain/inventory";

describe("supplier validation", () => {
  it("requires a company name and usable phone number", () => {
    expect(supplierInputSchema.safeParse({ name: "", phone: "123", active: true }).success).toBe(false);
    expect(supplierInputSchema.safeParse({ name: "Apex Distributors", phone: "9819167712", active: true }).success).toBe(true);
  });
});

describe("purchase calculations", () => {
  it("calculates taxable subtotal, GST, and total across lines", () => {
    expect(calculatePurchaseTotals([
      { medicineId: "m1", batchNumber: "B1", expiryDate: new Date("2027-01-01"), quantity: 10, freeQuantity: 1, unitRate: 20, mrp: 25, hsn: "3004", gstRate: 5, itcEligibility: "ELIGIBLE" },
      { medicineId: "m2", batchNumber: "B2", expiryDate: new Date("2027-06-01"), quantity: 5, freeQuantity: 0, unitRate: 40, mrp: 50, hsn: "3004", gstRate: 12, itcEligibility: "BLOCKED" },
    ])).toEqual({ subtotal: 400, tax: 34, total: 434 });
  });
});

describe("inventory movement integration rule", () => {
  it("adds received purchase quantity and free quantity to stock", () => {
    expect(calculateStock([
      { quantity: 10, direction: "IN" },
      { quantity: 1, direction: "IN" },
      { quantity: 3, direction: "OUT" },
    ])).toBe(8);
  });
});
