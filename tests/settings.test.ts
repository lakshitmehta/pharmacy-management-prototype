import { describe, expect, it } from "vitest";
import { isValidGstin, storeSettingsUpdateSchema } from "@/domain/settings";
import { hasPermission, createUserSchema, updateUserSchema, roleDefaultPermissions } from "@/domain/rbac";
import { formatActionLabel, auditFilterSchema } from "@/domain/audit";

describe("storeSettings domain", () => {
  it("validates Indian GSTIN formats correctly", () => {
    // Valid 15-char Indian GSTINs
    expect(isValidGstin("07AAAAA0000A1Z5")).toBe(true);
    expect(isValidGstin("27ABCDE1234F1Z5")).toBe(true);
    expect(isValidGstin("")).toBe(true); // Optional
    expect(isValidGstin(null)).toBe(true);

    // Invalid GSTINs
    expect(isValidGstin("INVALID123")).toBe(false);
    expect(isValidGstin("1234567890123456")).toBe(false); // 16 chars
    expect(isValidGstin("07AAAAA0000A15")).toBe(false); // 14 chars
  });

  it("validates store settings update schema with valid payload", () => {
    const valid = storeSettingsUpdateSchema.safeParse({
      name: "City Health Pharmacy",
      phone: "9876543210",
      address: "123 Main Bazaar",
      gstin: "07AAAAA0000A1Z5",
      drugLicense: "DL-12345-R",
      invoicePrefix: "CHP",
      nextInvoiceNo: 105,
      discountDisplay: "PERCENTAGE",
      gstScheme: "REGULAR_MONTHLY",
      eInvoiceEnabled: true,
      ewayBillEnabled: false,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects invalid invoice prefix or negative next invoice number", () => {
    const invalid = storeSettingsUpdateSchema.safeParse({
      name: "Pharma",
      invoicePrefix: "",
      nextInvoiceNo: -5,
    });
    expect(invalid.success).toBe(false);
  });
});

describe("RBAC domain", () => {
  it("grants OWNER access to all permissions via wildcard", () => {
    const ownerRoles = [{ name: "OWNER", permissions: ["*"] }];
    expect(hasPermission(ownerRoles, "billing")).toBe(true);
    expect(hasPermission(ownerRoles, "settings")).toBe(true);
    expect(hasPermission(ownerRoles, "any_custom_permission")).toBe(true);
  });

  it("checks specific permissions for PHARMACIST and CASHIER", () => {
    const pharmacistRoles = [{ name: "PHARMACIST", permissions: roleDefaultPermissions.PHARMACIST }];
    const cashierRoles = [{ name: "CASHIER", permissions: roleDefaultPermissions.CASHIER }];

    // Pharmacist has inventory and expiry, but not settings
    expect(hasPermission(pharmacistRoles, "inventory")).toBe(true);
    expect(hasPermission(pharmacistRoles, "expiry")).toBe(true);
    expect(hasPermission(pharmacistRoles, "settings")).toBe(false);

    // Cashier has billing, but not inventory or settings
    expect(hasPermission(cashierRoles, "billing")).toBe(true);
    expect(hasPermission(cashierRoles, "inventory")).toBe(false);
    expect(hasPermission(cashierRoles, "settings")).toBe(false);
  });

  it("validates user creation schema", () => {
    const valid = createUserSchema.safeParse({
      username: "cashier_1",
      displayName: "Amit Kumar",
      password: "StrongPassword123",
      roleName: "CASHIER",
    });
    expect(valid.success).toBe(true);

    const invalidShortPass = createUserSchema.safeParse({
      username: "user1",
      displayName: "Test",
      password: "short",
      roleName: "CASHIER",
    });
    expect(invalidShortPass.success).toBe(false);
  });

  it("validates user update schema", () => {
    const valid = updateUserSchema.safeParse({
      displayName: "Amit K.",
      status: "INACTIVE",
      roleName: "PHARMACIST",
    });
    expect(valid.success).toBe(true);
  });
});

describe("audit domain", () => {
  it("formats audit action labels correctly", () => {
    expect(formatActionLabel("STORE_SETTINGS_UPDATE")).toBe("Store Settings Update");
    expect(formatActionLabel("USER_CREATE")).toBe("User Create");
    expect(formatActionLabel("SALE_VOID")).toBe("Sale Void");
  });

  it("parses audit filters with defaults", () => {
    const parsed = auditFilterSchema.parse({
      action: "LOGIN",
      limit: "50",
    });
    expect(parsed.action).toBe("LOGIN");
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });
});

