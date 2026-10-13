import { z } from "zod";

export type InventoryMovementInput = {
  quantity: number;
  direction: "IN" | "OUT";
};

export function calculateStock(movements: InventoryMovementInput[]) {
  return movements.reduce((stock, movement) => {
    if (!Number.isInteger(movement.quantity) || movement.quantity < 0) {
      throw new Error("Inventory movement quantity must be a non-negative integer");
    }
    return stock + (movement.direction === "IN" ? movement.quantity : -movement.quantity);
  }, 0);
}

export type TypedMovement = {
  type: "PURCHASE" | "SALE" | "CUSTOMER_RETURN" | "SUPPLIER_RETURN" | "ADJUSTMENT" | "OPENING";
  quantity: number;
};

export function calculateBatchStock(movements: TypedMovement[]): number {
  return movements.reduce((acc, m) => {
    switch (m.type) {
      case "OPENING":
      case "PURCHASE":
      case "CUSTOMER_RETURN":
        return acc + m.quantity;
      case "SALE":
      case "SUPPLIER_RETURN":
        return acc - m.quantity;
      case "ADJUSTMENT":
        return acc + m.quantity;
      default:
        return acc;
    }
  }, 0);
}

export type ValuationItem = {
  stock: number;
  purchaseRate: number;
  mrp: number;
};

export function calculateInventoryValuation(items: ValuationItem[]) {
  return items.reduce(
    (totals, item) => {
      const effectiveStock = Math.max(0, item.stock);
      const costValue = effectiveStock * item.purchaseRate;
      const mrpValue = effectiveStock * item.mrp;
      return {
        stockValue: roundCurrency(totals.stockValue + costValue),
        mrpValue: roundCurrency(totals.mrpValue + mrpValue),
        totalUnits: totals.totalUnits + effectiveStock,
      };
    },
    { stockValue: 0, mrpValue: 0, totalUnits: 0 }
  );
}

export type ExpiryStatus = "EXPIRED" | "NEAR_EXPIRY" | "HEALTHY";

export function categorizeExpiry(expiryDate: Date, referenceDate: Date = new Date()): ExpiryStatus {
  const exp = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate()).getTime();
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime();
  const diffDays = Math.floor((exp - ref) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "EXPIRED";
  if (diffDays <= 90) return "NEAR_EXPIRY";
  return "HEALTHY";
}

export type StockHealth = "NEGATIVE" | "LOW" | "HEALTHY";

export function checkStockHealth(stock: number, safetyLimit: number): StockHealth {
  if (stock < 0) return "NEGATIVE";
  if (stock <= safetyLimit) return "LOW";
  return "HEALTHY";
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const medicineCreateSchema = z.object({
  name: z.string().trim().min(1, "Medicine name is required").max(200),
  genericName: z.string().trim().max(200).optional().or(z.literal("")),
  manufacturer: z.string().trim().max(200).optional().or(z.literal("")),
  barcode: z.string().trim().max(80).optional().or(z.literal("")),
  hsn: z.string().trim().max(20).optional().or(z.literal("")),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  safetyLimit: z.coerce.number().int().nonnegative().default(15),
  openingBatch: z.object({
    batchNumber: z.string().trim().min(1, "Batch number is required").max(80),
    expiryDate: z.coerce.date(),
    purchaseRate: z.coerce.number().nonnegative("Purchase rate cannot be negative"),
    mrp: z.coerce.number().nonnegative("MRP cannot be negative"),
    packSize: z.coerce.number().int().positive().default(1),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    supplierId: z.string().optional().or(z.literal("")),
  }).optional(),
});

export const medicineUpdateSchema = z.object({
  name: z.string().trim().min(1, "Medicine name cannot be empty").max(200).optional(),
  genericName: z.string().trim().max(200).optional().or(z.literal("")),
  manufacturer: z.string().trim().max(200).optional().or(z.literal("")),
  barcode: z.string().trim().max(80).optional().or(z.literal("")),
  hsn: z.string().trim().max(20).optional().or(z.literal("")),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  safetyLimit: z.coerce.number().int().nonnegative().optional(),
});

export const stockAdjustmentSchema = z.object({
  batchId: z.string().min(1, "Batch ID is required"),
  quantityDelta: z.coerce.number().int().refine((val) => val !== 0, { message: "Adjustment delta cannot be zero" }),
  reason: z.string().trim().min(1, "Reason is required").max(300),
  unitRate: z.coerce.number().nonnegative().optional(),
});

export type MedicineCreateInput = z.infer<typeof medicineCreateSchema>;
export type MedicineUpdateInput = z.infer<typeof medicineUpdateSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
