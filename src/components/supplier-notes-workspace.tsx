"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SupplierNote = {
  id: string;
  supplierId: string;
  supplierName: string;
  side: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
  createdAt: string;
};

type SupplierItem = {
  id: string;
  name: string;
};

export function SupplierNotesWorkspace() {
  const [notes, setNotes] = useState<SupplierNote[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New Note Modal
  const [createModal, setCreateModal] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [noteType, setNoteType] = useState<"CREDIT_NOTE" | "DEBIT_NOTE">("CREDIT_NOTE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [notesRes, suppRes] = await Promise.all([
        fetch("/api/supplier-notes"),
        fetch("/api/suppliers"),
      ]);
      if (notesRes.ok) {
        const d = await notesRes.json();
        setNotes(d.notes ?? []);
      }
      if (suppRes.ok) {
        const s = await suppRes.json();
        setSuppliers(s.suppliers ?? []);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load supplier notes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || !amount || !reason.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          type: noteType,
          amount: Number(amount),
          reason: reason.trim(),
          reference: reference.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record supplier note.");
        setSubmitting(false);
        return;
      }

      setNotice(`${noteType === "CREDIT_NOTE" ? "Credit note" : "Debit note"} of ₹${data.note.amount} recorded.`);
      setCreateModal(false);
      setSupplierId("");
      setAmount("");
      setReason("");
      setReference("");
      void loadData();
    } catch (err) {
      console.error(err);
      setError("Network error while recording note.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workspace-container">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Stock & purchase</p>
          <h1>Credit / Debit Notes</h1>
          <p>
            Track distributor returns, expiry claims, price adjustments, and credit/debit notes linked to your supplier payables ledger.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/payables" className="action-btn">
            Accounts Payable →
          </Link>
          <button type="button" className="button-primary" onClick={() => setCreateModal(true)}>
            + New Supplier Note
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

      {/* Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Supplier Adjustment Notes ({notes.length})</h2>
          <button type="button" className="action-btn" onClick={() => void loadData()}>
            ↻ Refresh
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Date & Time</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Distributor</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Effect</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Description</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading supplier notes...
                  </td>
                </tr>
              ) : notes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    No supplier credit/debit notes recorded yet.
                  </td>
                </tr>
              ) : (
                notes.map((n) => (
                  <tr key={n.id}>
                    <td style={{ padding: "10px" }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{n.supplierName}</strong>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px" }}>
                      <span className="aging-badge" style={{
                        background: n.side === "CREDIT" ? "#ecfdf5" : "#fef2f2",
                        color: n.side === "CREDIT" ? "#065f46" : "#991b1b",
                        border: n.side === "CREDIT" ? "1px solid #a7f3d0" : "1px solid #fecaca",
                      }}>
                        {n.side === "CREDIT" ? "Credit Note (Reduces Due)" : "Debit Note (Increases Due)"}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{n.description}</td>
                    <td style={{ textAlign: "right", padding: "10px", fontWeight: "bold", color: n.side === "CREDIT" ? "#16a34a" : "#b45309" }}>
                      ₹{n.amount.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Note Modal */}
      {createModal && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Record Supplier Credit / Debit Note</h2>
              <button type="button" className="close-btn" onClick={() => setCreateModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateNote} className="modal-form">
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Select Supplier *
                </label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Note Type *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    className={`payment-method-btn ${noteType === "CREDIT_NOTE" ? "active" : ""}`}
                    onClick={() => setNoteType("CREDIT_NOTE")}
                  >
                    Credit Note (Reduces Due)
                  </button>
                  <button
                    type="button"
                    className={`payment-method-btn ${noteType === "DEBIT_NOTE" ? "active" : ""}`}
                    onClick={() => setNoteType("DEBIT_NOTE")}
                  >
                    Debit Note (Increases Due)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Adjustment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "1.05rem", fontWeight: "bold", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Reason / Particulars *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Expiry stock claim credit / Rate difference"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Distributor Note / Reference # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CN-88412"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={() => setCreateModal(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting || !amount || !supplierId}>
                  {submitting ? "Saving..." : "Record Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

