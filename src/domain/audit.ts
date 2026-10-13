import { z } from "zod";

export const auditActions = [
  "STORE_SETTINGS_UPDATE",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_STATUS_CHANGE",
  "LOGIN",
  "LOGOUT",
  "SALE_CREATE",
  "SALE_VOID",
  "STOCK_ADJUST",
  "PURCHASE_RECEIVE",
  "CUSTOMER_CREATE",
  "CUSTOMER_PAYMENT",
  "SUPPLIER_PAYMENT",
  "RETURN_PROCESS",
  "EXCHANGE_PROCESS",
  "VOUCHER_CREATE",
  "MEDICINE_IMPORT",
  "MEDICINE_EXPORT",
  "SUPPLIER_IMPORT",
  "SUPPLIER_EXPORT",
  "DATABASE_BACKUP",
  "DATABASE_RESTORE",
] as const;

export const auditFilterSchema = z.object({
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditFilterInput = z.infer<typeof auditFilterSchema>;

export function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

