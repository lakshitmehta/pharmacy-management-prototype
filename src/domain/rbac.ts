import { z } from "zod";

export const standardRoles = [
  "OWNER",
  "MANAGER",
  "PHARMACIST",
  "CASHIER",
  "AUDITOR",
] as const;

export type StandardRole = (typeof standardRoles)[number];

export const roleDefaultPermissions: Record<StandardRole, string[]> = {
  OWNER: ["*"],
  MANAGER: [
    "billing",
    "inventory",
    "sales",
    "returns",
    "purchases",
    "reports",
    "customers",
    "payables",
    "banking",
    "vouchers",
    "audit",
    "settings",
  ],
  PHARMACIST: [
    "billing",
    "inventory",
    "sales",
    "returns",
    "purchases",
    "customers",
    "expiry",
  ],
  CASHIER: ["billing", "sales", "customers", "returns"],
  AUDITOR: ["reports", "sales", "purchases", "inventory", "audit"],
};

export function hasPermission(
  roles: Array<{ name: string; permissions?: unknown }>,
  requiredPermission: string
): boolean {
  if (!roles || roles.length === 0) return false;

  for (const r of roles) {
    if (r.name === "OWNER") return true;

    let perms: string[] = [];
    if (Array.isArray(r.permissions)) {
      perms = r.permissions as string[];
    } else if (typeof r.permissions === "string") {
      try {
        const parsed = JSON.parse(r.permissions);
        if (Array.isArray(parsed)) perms = parsed;
      } catch {
        // Fallback to defaults
      }
    } else if (r.name in roleDefaultPermissions) {
      perms = roleDefaultPermissions[r.name as StandardRole];
    }

    if (perms.includes("*") || perms.includes(requiredPermission)) {
      return true;
    }
  }

  return false;
}

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters")
    .max(50, "Display name cannot exceed 50 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long"),
  roleName: z.enum(standardRoles).default("PHARMACIST"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(50).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  password: z.string().min(8).max(100).optional().or(z.literal("")),
  roleName: z.enum(standardRoles).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

