"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { roundCurrency } from "@/domain/vouchers";

type VoucherItem = {
  id: string;
  voucherRef: string;
  type: "PAYMENT" | "RECEIPT" | "JOURNAL" | "CONTRA";
  number: number;
  date: string;
  narration: string | null;
  totalAmount: number;
  lines: Array<{
    id: string;
    account: string;
    debit: number;
    credit: number;
  }>;
  createdAt: string;
};

type VoucherLineDraft = {
  account: string;
  debit: string;
  credit: string;
};

export function VoucherWorkspace() {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // New Voucher Modal
  const [createModal, setCreateModal] = useState(false);
  const [voucherType, setVoucherType] = useState<"PAYMENT" | "RECEIPT" | "JOURNAL" | "CONTRA">("JOURNAL");
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split("T")[0]);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<VoucherLineDraft[]>([
    { account: "", debit: "", credit: "" },
    { account: "", debit: "", credit: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Inspect Modal
  const [inspectVoucher, setInspectVoucher] = useState<VoucherItem | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadVouchers() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (typeFilter !== "all") q.set("type", typeFilter);

      const res = await fetch(`/api/vouchers?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.vouchers ?? []);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load vouchers register.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadVouchers();
  }, [search, typeFilter]);

  function updateLine(index: number, field: keyof VoucherLineDraft, val: string) {
    const updated = [...lines];
    updated[index][field] = val;
    // If debit entered, clear credit and vice-versa
    if (field === "debit" && Number(val) > 0) {
      updated[index].credit = "";
    } else if (field === "credit" && Number(val) > 0) {
      updated[index].debit = "";
    }
    setLines(updated);
  }

  function addLine() {
    setLines([...lines, { account: "", debit: "", credit: "" }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, idx) => idx !== index));
  }

  // Real-time balance calculations
  const totalDebit = roundCurrency(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = roundCurrency(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const difference = roundCurrency(Math.abs(totalDebit - totalCredit));
  const isBalanced = totalDebit > 0 && difference === 0;

  async function handlePostVoucher(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced) {
      setError("Debits and credits must balance before posting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const formattedLines = lines
        .filter((l) => l.account.trim() && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
        .map((l) => ({
          account: l.account.trim(),
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        }));

      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: voucherType,
          date: voucherDate,
          narration: narration.trim() || undefined,
          lines: formattedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post voucher.");
        setSubmitting(false);
        return;
      }

      setNotice(`Voucher ${data.voucher.voucherRef} posted successfully.`);
      setCreateModal(false);
      setNarration("");
      setLines([
        { account: "", debit: "", credit: "" },
        { account: "", debit: "", credit: "" },
      ]);
      void loadVouchers();
    } catch (err) {
      console.error(err);
      setError("Network error while posting voucher.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workspace-container">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Banking & payments</p>
          <h1>Voucher Entry</h1>
          <p>
            Post double-entry journal vouchers, payments, receipts, and contra entries with real-time balancing validation and sequential auditing.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/bank-book" className="action-btn">
            Bank & Cash Book →
          </Link>
          <button type="button" className="button-primary" onClick={() => setCreateModal(true)}>
            + Post Voucher
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="notice-banner" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #6ee7b7", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>✓ {notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}>✕</button>
        </div>
      )}
      {error && (
        <div className="notice-banner" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠ {error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}>✕</button>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="panel sales-toolbar" style={{ marginBottom: "18px", padding: "16px 20px" }}>
        <div className="sales-search-wrap" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            className="sales-search-input"
            placeholder="Search vouchers by narration or account name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="action-btn"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="sales-filters-row" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.72rem", fontWeight: "bold", color: "var(--muted)", textTransform: "uppercase" }}>
            Voucher Type:
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            >
              <option value="all">All Types</option>
              <option value="JOURNAL">Journal (JV)</option>
              <option value="PAYMENT">Payment (PV)</option>
              <option value="RECEIPT">Receipt (RV)</option>
              <option value="CONTRA">Contra (CV)</option>
            </select>
          </label>

          <button
            type="button"
            className="action-btn"
            onClick={() => void loadVouchers()}
            style={{ marginLeft: "auto" }}
          >
            ↻ Refresh Register
          </button>
        </div>
      </div>

      {/* Vouchers Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Audited Vouchers ({vouchers.length})</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Double-entry posted vouchers
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Voucher #</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Type</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Narration / Accounts</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Total Volume</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading vouchers register...
                  </td>
                </tr>
              ) : vouchers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    No vouchers posted yet. Click &quot;+ Post Voucher&quot; to create a double-entry voucher.
                  </td>
                </tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id}>
                    <td style={{ padding: "10px" }}>
                      <strong>{v.voucherRef}</strong>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px" }}>
                      <span className="payment-pill">{v.type}</span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      {new Date(v.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <div>{v.narration || <span style={{ color: "var(--muted)" }}>No narration</span>}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "2px" }}>
                        {v.lines.map((l) => `${l.account} (₹${(l.debit || l.credit).toFixed(2)})`).join(" | ")}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px", fontWeight: "bold" }}>
                      ₹{v.totalAmount.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px" }}>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => setInspectVoucher(v)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Post Voucher Modal */}
      {createModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "680px" }}>
            <div className="modal-head">
              <h2>Post Double-Entry Voucher</h2>
              <button type="button" className="close-btn" onClick={() => setCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handlePostVoucher} className="modal-form">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                    Voucher Type *
                  </label>
                  <select
                    value={voucherType}
                    onChange={(e) => setVoucherType(e.target.value as "JOURNAL" | "PAYMENT" | "RECEIPT" | "CONTRA")}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                  >
                    <option value="JOURNAL">Journal Voucher (JV)</option>
                    <option value="PAYMENT">Payment Voucher (PV)</option>
                    <option value="RECEIPT">Receipt Voucher (RV)</option>
                    <option value="CONTRA">Contra Voucher (CV)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                    Voucher Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Narration / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Office rent paid for the month of September"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              {/* Lines Table */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)" }}>
                    Voucher Accounts & Amounts *
                  </label>
                  <button type="button" className="action-btn" onClick={addLine} style={{ fontSize: "0.72rem" }}>
                    + Add Line
                  </button>
                </div>

                <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Account Name</th>
                      <th style={{ textAlign: "right", width: "110px" }}>Debit (₹)</th>
                      <th style={{ textAlign: "right", width: "110px" }}>Credit (₹)</th>
                      <th style={{ width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Rent A/C or Cash A/C"
                            value={l.account}
                            onChange={(e) => updateLine(idx, "account", e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={l.debit}
                            onChange={(e) => updateLine(idx, "debit", e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", textAlign: "right", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={l.credit}
                            onChange={(e) => updateLine(idx, "credit", e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", textAlign: "right", borderRadius: "4px", border: "1px solid var(--line)" }}
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {lines.length > 2 && (
                            <button
                              type="button"
                              className="action-btn danger-text"
                              onClick={() => removeLine(idx)}
                              style={{ padding: "2px 6px" }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: "bold", borderTop: "2px solid var(--line)" }}>
                      <td style={{ textAlign: "right" }}>Total:</td>
                      <td style={{ textAlign: "right", color: "#16a34a" }}>₹{totalDebit.toFixed(2)}</td>
                      <td style={{ textAlign: "right", color: "#16a34a" }}>₹{totalCredit.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Balance Status Banner */}
                <div style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  borderRadius: "5px",
                  fontSize: "0.78rem",
                  background: isBalanced ? "#f0fdf4" : "#fef2f2",
                  color: isBalanced ? "#166534" : "#991b1b",
                  border: isBalanced ? "1px solid #bbf7d0" : "1px solid #fecaca",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span>
                    {isBalanced
                      ? "✓ Debits and credits are balanced!"
                      : `⚠ Unbalanced: Difference of ₹${difference.toFixed(2)}. Debits must strictly equal Credits.`}
                  </span>
                  <strong>{isBalanced ? `₹${totalDebit.toFixed(2)}` : ""}</strong>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={() => setCreateModal(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting || !isBalanced}>
                  {submitting ? "Posting..." : "Confirm & Post Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Voucher Modal */}
      {inspectVoucher && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Voucher Inspection</h2>
              <button type="button" className="close-btn" onClick={() => setInspectVoucher(null)}>✕</button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>{inspectVoucher.type} VOUCHER</h3>
                <p>DOUBLE-ENTRY ACCOUNTING RECORD</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher #:</span>
                <strong>{inspectVoucher.voucherRef}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Date:</span>
                <span>{new Date(inspectVoucher.date).toLocaleDateString()}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Narration:</span>
                <span>{inspectVoucher.narration || "None"}</span>
              </div>

              <div className="receipt-divider" />

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th style={{ textAlign: "right" }}>Debit</th>
                    <th style={{ textAlign: "right" }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectVoucher.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.account}</td>
                      <td style={{ textAlign: "right" }}>{l.debit > 0 ? `₹${l.debit.toFixed(2)}` : "—"}</td>
                      <td style={{ textAlign: "right" }}>{l.credit > 0 ? `₹${l.credit.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total Balanced Volume:</span>
                    <span>₹{inspectVoucher.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="receipt-footer">
                <p>Verified double-entry posted record.</p>
                <small>Generated by PillBills Pharmacy System</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ marginTop: "14px" }}>
              <button type="button" className="action-btn" onClick={() => setInspectVoucher(null)}>Close</button>
              <button type="button" className="button-primary" onClick={() => window.print()}>🖨 Print Voucher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

