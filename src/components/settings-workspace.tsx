/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { isValidGstin } from "@/domain/settings";
import { roleDefaultPermissions } from "@/domain/rbac";
import { formatActionLabel } from "@/domain/audit";

type ActiveTab = "profile" | "users" | "audit";

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  role: string;
  permissions: string[];
}

interface AuditItem {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: any;
  createdAt: string;
  user: {
    username: string;
    displayName: string;
  } | null;
}

export function SettingsWorkspace() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile & Tax State
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [drugLicense, setDrugLicense] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [nextInvoiceNo, setNextInvoiceNo] = useState(1);
  const [discountDisplay, setDiscountDisplay] = useState("AMOUNT");
  const [gstScheme, setGstScheme] = useState("REGULAR_MONTHLY");
  const [footerNotice, setFooterNotice] = useState("");
  const [terms, setTerms] = useState("");
  const [eInvoiceEnabled, setEInvoiceEnabled] = useState(false);
  const [ewayBillEnabled, setEwayBillEnabled] = useState(false);

  // Users State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("PHARMACIST");

  // Edit User Modal
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");

  // Audit State
  const [auditEvents, setAuditEvents] = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [selectedAuditItem, setSelectedAuditItem] = useState<AuditItem | null>(null);

  // Fetch Settings Data
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        if (res.status === 403) throw new Error("You do not have administrative permissions to view settings.");
        throw new Error("Failed to load store settings");
      }
      const data = await res.json();
      setStoreName(data.store?.name || "");
      setStoreCode(data.store?.code || "");
      if (data.settings) {
        setPhone(data.settings.phone || "");
        setAddress(data.settings.address || "");
        setGstin(data.settings.gstin || "");
        setDrugLicense(data.settings.drugLicense || "");
        setInvoicePrefix(data.settings.invoicePrefix || "INV");
        setNextInvoiceNo(data.settings.nextInvoiceNo || 1);
        setDiscountDisplay(data.settings.discountDisplay || "AMOUNT");
        setGstScheme(data.settings.gstScheme || "REGULAR_MONTHLY");
        setFooterNotice(data.settings.footerNotice || "");
        setTerms(data.settings.terms || "");
        setEInvoiceEnabled(Boolean(data.settings.eInvoiceEnabled));
        setEwayBillEnabled(Boolean(data.settings.ewayBillEnabled));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Users
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load user directory.");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Audit Trail
  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (auditActionFilter) params.set("action", auditActionFilter);
      params.set("limit", "100");

      const res = await fetch(`/api/audit-trail?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load audit trail.");
      const data = await res.json();
      setAuditEvents(data.events || []);
      setAuditTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load audit trail.");
    } finally {
      setLoading(false);
    }
  }, [auditActionFilter]);

  useEffect(() => {
    if (activeTab === "profile") {
      void loadSettings();
    } else if (activeTab === "users") {
      void loadUsers();
    } else if (activeTab === "audit") {
      void loadAudit();
    }
  }, [activeTab, loadSettings, loadUsers, loadAudit]);

  // Handle Save Settings
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (gstin && !isValidGstin(gstin)) {
      setError("Please enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          drugLicense: drugLicense.trim() || undefined,
          invoicePrefix: invoicePrefix.trim(),
          nextInvoiceNo: Number(nextInvoiceNo),
          discountDisplay,
          gstScheme,
          footerNotice: footerNotice.trim() || undefined,
          terms: terms.trim() || undefined,
          eInvoiceEnabled,
          ewayBillEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setNotice("Store profile, tax configuration, and invoice parameters updated successfully.");
    } catch (err: any) {
      setError(err.message || "Network error while saving settings.");
    } finally {
      setSaving(false);
    }
  }

  // Handle Create User
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim(),
          password: newPassword,
          roleName: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user.");
      }

      setNotice(`User @${data.user.username} created with ${data.user.role} role.`);
      setAddUserModalOpen(false);
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      void loadUsers();
    } catch (err: any) {
      setError(err.message || "Error creating user account.");
    } finally {
      setSaving(false);
    }
  }

  // Handle Update User
  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;

    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        displayName: editDisplayName.trim(),
        roleName: editRole,
      };
      if (editPassword.trim()) {
        if (editPassword.trim().length < 8) {
          throw new Error("New password must be at least 8 characters long.");
        }
        payload.password = editPassword.trim();
      }

      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user.");
      }

      setNotice(`User @${data.user.username} updated.`);
      setEditUser(null);
      void loadUsers();
    } catch (err: any) {
      setError(err.message || "Error updating user.");
    } finally {
      setSaving(false);
    }
  }

  // Handle Toggle User Status
  async function handleToggleStatus(user: UserItem) {
    const nextStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status.");
      }

      setNotice(`User @${user.username} is now ${nextStatus.toLowerCase()}.`);
      void loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to toggle status.");
    }
  }

  return (
    <div className="workspace-container" style={{ padding: "24px", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <span style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>
            Administration &amp; Compliance
          </span>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "bold", margin: "4px 0", color: "var(--ink)" }}>
            System Settings &amp; Control
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
            Configure pharmacy profile, statutory tax rules, multi-user permissions (RBAC), and review immutable audit records.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <span className="badge" style={{ padding: "6px 12px", background: "#f1f5f9", borderRadius: "6px", fontSize: "0.82rem", fontWeight: "bold" }}>
            Store: {storeCode || "DEMO-001"}
          </span>
        </div>
      </div>

      {/* Notifications / Errors */}
      {notice && (
        <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: "6px", marginBottom: "16px", fontSize: "0.88rem" }}>
          ✓ {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "6px", marginBottom: "16px", fontSize: "0.88rem" }}>
          ⚠ {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--line)", marginBottom: "24px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "profile" ? "2px solid #2563eb" : "2px solid transparent",
            background: "none",
            color: activeTab === "profile" ? "#2563eb" : "var(--muted)",
            fontWeight: activeTab === "profile" ? "bold" : "normal",
            cursor: "pointer",
            fontSize: "0.92rem",
          }}
        >
          🏥 Store Profile &amp; Tax Configuration
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "users" ? "2px solid #2563eb" : "2px solid transparent",
            background: "none",
            color: activeTab === "users" ? "#2563eb" : "var(--muted)",
            fontWeight: activeTab === "users" ? "bold" : "normal",
            cursor: "pointer",
            fontSize: "0.92rem",
          }}
        >
          👥 User Management &amp; RBAC
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "audit" ? "2px solid #2563eb" : "2px solid transparent",
            background: "none",
            color: activeTab === "audit" ? "#2563eb" : "var(--muted)",
            fontWeight: activeTab === "audit" ? "bold" : "normal",
            cursor: "pointer",
            fontSize: "0.92rem",
          }}
        >
          📜 Audit Trail Inspector ({auditTotal})
        </button>
        <Link
          href="/backup"
          style={{
            marginLeft: "auto",
            padding: "10px 16px",
            color: "#059669",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "0.92rem",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          📦 Data &amp; Backup &rarr;
        </Link>
      </div>

      {loading && (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
          Loading configuration data...
        </div>
      )}

      {/* TAB 1: STORE PROFILE & TAX */}
      {!loading && activeTab === "profile" && (
        <form onSubmit={handleSaveSettings}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px" }}>
            {/* General Pharmacy Info */}
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1.05rem", fontWeight: "bold", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
                Pharmacy Identity &amp; Contact
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Pharmacy Trading Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Official Contact Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Physical Address
                  </label>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Complete street address, city, state, pin"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
              </div>
            </div>

            {/* Statutory Compliance & Tax */}
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1.05rem", fontWeight: "bold", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
                Statutory Compliance &amp; GST
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    GSTIN (15 characters)
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: gstin && !isValidGstin(gstin) ? "1px solid #ef4444" : "1px solid var(--line)",
                      borderRadius: "6px",
                      textTransform: "uppercase",
                    }}
                  />
                  {gstin && !isValidGstin(gstin) && (
                    <span style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "2px", display: "block" }}>
                      Invalid format. Must match standard 15-character Indian GSTIN.
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Drug License (DL) Numbers
                  </label>
                  <input
                    type="text"
                    value={drugLicense}
                    onChange={(e) => setDrugLicense(e.target.value)}
                    placeholder="e.g. 20-B/21-B MH-123456"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    GST Filing Scheme
                  </label>
                  <select
                    value={gstScheme}
                    onChange={(e) => setGstScheme(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  >
                    <option value="REGULAR_MONTHLY">Regular Monthly (Standard GSTR-1 &amp; GSTR-3B)</option>
                    <option value="REGULAR_QUARTERLY">Regular Quarterly (QRMP Scheme)</option>
                    <option value="COMPOSITION">Composition Scheme (Quarterly CMP-08)</option>
                    <option value="UNREGISTERED">Unregistered / Exempt</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: "20px", marginTop: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.84rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={eInvoiceEnabled}
                      onChange={(e) => setEInvoiceEnabled(e.target.checked)}
                    />
                    E-Invoicing Enabled
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.84rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ewayBillEnabled}
                      onChange={(e) => setEwayBillEnabled(e.target.checked)}
                    />
                    E-Way Bill Enabled
                  </label>
                </div>
              </div>
            </div>

            {/* Invoicing & Counter Rules */}
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "1.05rem", fontWeight: "bold", borderBottom: "1px solid var(--line)", paddingBottom: "8px" }}>
                Invoicing &amp; Sequential Billing
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                      Invoice Prefix *
                    </label>
                    <input
                      type="text"
                      required
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                      placeholder="e.g. INV or DEMO"
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                      Next Sequence # *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={nextInvoiceNo}
                      onChange={(e) => setNextInvoiceNo(parseInt(e.target.value) || 1)}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Discount Display Mode on Bill
                  </label>
                  <select
                    value={discountDisplay}
                    onChange={(e) => setDiscountDisplay(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  >
                    <option value="AMOUNT">Flat Amount (₹)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="BOTH">Both (Amount &amp; %)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Receipt Footer Note
                  </label>
                  <input
                    type="text"
                    value={footerNotice}
                    onChange={(e) => setFooterNotice(e.target.value)}
                    placeholder="e.g. Get Well Soon! Open 24/7."
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", color: "var(--ink)", marginBottom: "4px" }}>
                    Terms &amp; Return Policy Notice
                  </label>
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="e.g. Returns accepted within 7 days with original invoice."
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={saving}
              className="primary-button"
              style={{ padding: "10px 24px", fontSize: "0.95rem" }}
            >
              {saving ? "Saving Changes..." : "Save Store & Tax Configuration"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: USERS & RBAC */}
      {!loading && activeTab === "users" && (
        <div>
          {/* Action Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>Registered Pharmacy Accounts</h2>
              <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Staff members authorized to log in and perform counter or back-office tasks.
              </span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => setAddUserModalOpen(true)}
              style={{ padding: "8px 16px" }}
            >
              + Add New User
            </button>
          </div>

          {/* User Table */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden", marginBottom: "32px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>Username</th>
                  <th style={{ padding: "12px 16px" }}>Display Name</th>
                  <th style={{ padding: "12px 16px" }}>Role</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Created Date</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "bold" }}>@{u.username}</td>
                    <td style={{ padding: "12px 16px" }}>{u.displayName}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          background:
                            u.role === "OWNER"
                              ? "#fef3c7"
                              : u.role === "MANAGER"
                              ? "#e0e7ff"
                              : u.role === "PHARMACIST"
                              ? "#dcfce7"
                              : "#f1f5f9",
                          color:
                            u.role === "OWNER"
                              ? "#92400e"
                              : u.role === "MANAGER"
                              ? "#3730a3"
                              : u.role === "PHARMACIST"
                              ? "#166534"
                              : "#475569",
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "0.72rem",
                          fontWeight: "bold",
                          background: u.status === "ACTIVE" ? "#dcfce7" : "#fee2e2",
                          color: u.status === "ACTIVE" ? "#166534" : "#991b1b",
                        }}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--muted)" }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditUser(u);
                          setEditDisplayName(u.displayName);
                          setEditRole(u.role);
                          setEditPassword("");
                        }}
                        style={{
                          padding: "4px 8px",
                          marginRight: "6px",
                          border: "1px solid var(--line)",
                          borderRadius: "4px",
                          background: "#ffffff",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        style={{
                          padding: "4px 8px",
                          border: "1px solid var(--line)",
                          borderRadius: "4px",
                          background: u.status === "ACTIVE" ? "#fff1f2" : "#f0fdf4",
                          color: u.status === "ACTIVE" ? "#9f1239" : "#166534",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RBAC Role Permissions Matrix Reference */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem", fontWeight: "bold" }}>
              Role-Based Access Control (RBAC) Permissions Matrix
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              {Object.entries(roleDefaultPermissions).map(([role, perms]) => (
                <div key={role} style={{ border: "1px solid var(--line)", borderRadius: "6px", padding: "12px", background: "#f8fafc" }}>
                  <strong style={{ fontSize: "0.86rem", color: "var(--ink)", display: "block", marginBottom: "6px" }}>
                    {role}
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "0.78rem", color: "var(--muted)" }}>
                    {perms.map((p) => (
                      <li key={p}>{p === "*" ? "Full Root Access (*)" : p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {!loading && activeTab === "audit" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>Immutable Audit Log</h2>
              <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Permanent chronological record of critical pharmacy business events and security actions.
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                style={{ padding: "6px 12px", border: "1px solid var(--line)", borderRadius: "6px", fontSize: "0.85rem" }}
              >
                <option value="">All Actions ({auditTotal})</option>
                <option value="STORE_SETTINGS_UPDATE">Store Settings Update</option>
                <option value="USER_CREATE">User Create</option>
                <option value="USER_UPDATE">User Update</option>
                <option value="LOGIN">Login</option>
                <option value="LOGOUT">Logout</option>
                <option value="SALE_CREATE">Sale Create</option>
                <option value="SALE_VOID">Sale Void</option>
                <option value="STOCK_ADJUST">Stock Adjust</option>
                <option value="PURCHASE_RECEIVE">Purchase Receive</option>
                <option value="RETURN_PROCESS">Return Process</option>
              </select>
            </div>
          </div>

          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px" }}>Timestamp</th>
                  <th style={{ padding: "10px 14px" }}>User</th>
                  <th style={{ padding: "10px 14px" }}>Action</th>
                  <th style={{ padding: "10px 14px" }}>Entity</th>
                  <th style={{ padding: "10px 14px" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: "500" }}>
                      {evt.user ? `${evt.user.displayName} (@${evt.user.username})` : "System / Automated"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "0.74rem",
                          fontWeight: "bold",
                          background: "#e2e8f0",
                          color: "#1e293b",
                        }}
                      >
                        {formatActionLabel(evt.action)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--muted)" }}>
                      {evt.entity ? `${evt.entity} ${evt.entityId ? `(#${evt.entityId.slice(-6)})` : ""}` : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {evt.metadata ? (
                        <button
                          type="button"
                          onClick={() => setSelectedAuditItem(evt)}
                          style={{
                            border: "none",
                            background: "none",
                            color: "#2563eb",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            padding: 0,
                          }}
                        >
                          View Payload
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>None</span>
                      )}
                    </td>
                  </tr>
                ))}
                {auditEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
                      No audit events found matching current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Add Staff Member</h2>
              <button type="button" className="close-btn" onClick={() => setAddUserModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateUser} style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. rahul_pharmacist"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Password (min 8 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Role Assignment *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  >
                    <option value="PHARMACIST">Pharmacist (Counter, Inventory, Expiry)</option>
                    <option value="CASHIER">Cashier (Billing POS, Returns)</option>
                    <option value="MANAGER">Manager (Purchasing, Reports, Full POS)</option>
                    <option value="AUDITOR">Auditor (Read-only Reports &amp; Audit)</option>
                    <option value="OWNER">Owner (Full Root Superadmin)</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setAddUserModalOpen(false)} style={{ padding: "8px 16px" }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="primary-button" style={{ padding: "8px 20px" }}>
                  {saving ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Edit Staff Member (@{editUser.username})</h2>
              <button type="button" className="close-btn" onClick={() => setEditUser(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateUser} style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Role Assignment *
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  >
                    <option value="PHARMACIST">Pharmacist (Counter, Inventory, Expiry)</option>
                    <option value="CASHIER">Cashier (Billing POS, Returns)</option>
                    <option value="MANAGER">Manager (Purchasing, Reports, Full POS)</option>
                    <option value="AUDITOR">Auditor (Read-only Reports &amp; Audit)</option>
                    <option value="OWNER">Owner (Full Root Superadmin)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Reset Password (optional, min 8 chars)
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep existing password"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--line)", borderRadius: "6px" }}
                  />
                </div>
              </div>
              <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setEditUser(null)} style={{ padding: "8px 16px" }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="primary-button" style={{ padding: "8px 20px" }}>
                  {saving ? "Updating..." : "Update User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Detail Modal */}
      {selectedAuditItem && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "540px" }}>
            <div className="modal-head">
              <h2>Audit Event Details</h2>
              <button type="button" className="close-btn" onClick={() => setSelectedAuditItem(null)}>✕</button>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: "12px", fontSize: "0.88rem" }}>
                <strong>Action:</strong> {selectedAuditItem.action}
              </div>
              <div style={{ marginBottom: "12px", fontSize: "0.88rem" }}>
                <strong>User:</strong> {selectedAuditItem.user ? `${selectedAuditItem.user.displayName} (@${selectedAuditItem.user.username})` : "System"}
              </div>
              <div style={{ marginBottom: "12px", fontSize: "0.88rem" }}>
                <strong>Time:</strong> {new Date(selectedAuditItem.createdAt).toLocaleString()}
              </div>
              <div style={{ marginBottom: "12px", fontSize: "0.88rem" }}>
                <strong>Payload:</strong>
                <pre style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", fontSize: "0.8rem", overflowX: "auto", marginTop: "6px" }}>
                  {JSON.stringify(selectedAuditItem.metadata, null, 2)}
                </pre>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setSelectedAuditItem(null)} style={{ padding: "8px 16px" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

