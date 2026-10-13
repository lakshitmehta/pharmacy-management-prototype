import { z } from "zod";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const gstSchemes = [
  "REGULAR_MONTHLY",
  "REGULAR_QUARTERLY",
  "COMPOSITION",
  "UNREGISTERED",
] as const;

export const discountDisplayModes = [
  "AMOUNT",
  "PERCENTAGE",
  "BOTH",
] as const;

export function isValidGstin(gstin: string | null | undefined): boolean {
  if (!gstin || gstin.trim() === "") return true; // Optional
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export const storeSettingsUpdateSchema = z.object({
  name: z.string().trim().min(2, "Store name must be at least 2 characters").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(250).optional().or(z.literal("")),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => !val || GSTIN_REGEX.test(val), {
      message: "Invalid GSTIN format (must be 15 characters alphanumeric, e.g. 07AAAAA0000A1Z5)",
    })
    .optional()
    .or(z.literal("")),
  drugLicense: z.string().trim().max(100).optional().or(z.literal("")),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Invoice prefix cannot be empty")
    .max(10, "Invoice prefix cannot exceed 10 characters")
    .default("INV"),
  nextInvoiceNo: z.coerce.number().int().positive("Next invoice number must be positive").default(1),
  discountDisplay: z.enum(discountDisplayModes).default("AMOUNT"),
  footerNotice: z.string().trim().max(250).optional().or(z.literal("")),
  terms: z.string().trim().max(500).optional().or(z.literal("")),
  gstScheme: z.enum(gstSchemes).default("REGULAR_MONTHLY"),
  eInvoiceEnabled: z.boolean().default(false),
  ewayBillEnabled: z.boolean().default(false),
});

export type StoreSettingsUpdateInput = z.infer<typeof storeSettingsUpdateSchema>;

