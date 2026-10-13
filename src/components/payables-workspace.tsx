"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PayableSupplier = {
  id: string;
  name: string;
  code: string | null;
  contactName: string | null;
  phone: string | null;
  gstin: string | null;
  balance: number;
  unpaidInvoicesCount: number;
  oldestInvoiceDate: string;
  agingBucket: "CURRENT_0_30" | "OVERDUE_31_60" | "CRITICAL_60_PLUS";
  lastPaymentDate: string | null;
};

type PayablesMetrics = {
  totalPayables: number;
  activePayablesCount: number;
  criticalCount: number;
  overdueCount: number;
  totalPaidToSuppliers: number;
};

type SupplierDetail = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  balance: number;
  openInvoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    total: number;
    paid: number;
    outstanding: number;
    linesCount: number;
  }>;
  purchases: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    total: number;
    paid: number;
    outstanding: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    createdAt: string;
    allocations: Array<{
      invoiceNumber: string;
      amount: number;
    }>;
  }>;
  statement: Array<{
    id: string;
    side: "DEBIT" | "CREDIT";
    amount: number;
    runningBalance: number;
    description: string;
    createdAt: string;
  }>;
};

type PaymentVoucher = {
  id: string;
  voucherNumber: string;
  supplierName: string;
  supplierPhone: string | null;
  amount: number;
  method: string;
  reference: string | null;
  createdAt: string;
  previousBalance: number;
  newBalance: number;
  allocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    allocatedAmount: number;
  }>;
};

export function PayablesWorkspace() {
  const [payables, setPayables] = useState<PayableSupplier[]>([]);
  const [metrics, setMetrics] = useState<PayablesMetrics>({
    totalPayables: 0,
    activePayablesCount: 0,
    criticalCount: 0,
    overdueCount: 0,
    totalPaidToSuppliers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState<string>("all");

  // Payment Modal State
  const [payTarget, setPayTarget] = useState<PayableSupplier | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [payRef, setPayRef] = useState<string>("");
  const [paying, setPaying] = useState(false);

  // Success Voucher Modal
  const [voucher, setVoucher] = useState<PaymentVoucher | null>(null);

  // Supplier Statement Drawer
  const [detailSupplier, setDetailSupplier] = useState<SupplierDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"bills" | "statement" | "payments">("bills");

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPayables() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (agingFilter !== "all") q.set("aging", agingFilter);

      const res = await fetch(`/api/payables?${q.toString()}`);
      if (!res.ok) throw new Error("Failed to load accounts payable");
      const data = await res.json();
      setPayables(data.payables ?? []);
      if (data.metrics) setMetrics(data.metrics);
    } catch (err) {
      console.error(err);
      setError("Unable to load accounts payable ledger.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPayables();
  }, [search, agingFilter]);

  async function openSupplierDetail(supplierId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/payables/${supplierId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailSupplier(data.supplier);
      }
    } catch (err) {
      console.error("Failed to load supplier statement:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDisbursePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget || !payAmount) return;

    const numAmt = Number(payAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setError("Please enter a valid positive payment amount.");
      return;
    }

    setPaying(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: payTarget.id,
          amount: numAmt,
          method: payMethod,
          reference: payRef.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disburse payment.");
        setPaying(false);
        return;
      }

      setNotice(`Payment of ₹${data.payment.amount} disbursed to ${data.payment.supplierName}.`);
      setVoucher(data.payment);
      setPayTarget(null);
      setPayAmount("");
      setPayRef("");
      void loadPayables();
      if (detailSupplier && detailSupplier.id === payTarget.id) {
        void openSupplierDetail(payTarget.id);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while recording supplier payment.");
    } finally {
      setPaying(false);
    }
  }

  function getDaysOld(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  function getAgingBadge(bucket: PayableSupplier["agingBucket"]) {
    switch (bucket) {
      case "CRITICAL_60_PLUS":
        return <span className="aging-badge high-risk">60+ Days Critical</span>;
      case "OVERDUE_31_60":
        return <span className="aging-badge overdue">31–60 Days Overdue</span>;
      case "CURRENT_0_30":
      default:
        return <span className="aging-badge current">0–30 Days Current</span>;
    }
  }

  return (
    <div className="workspace-container">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Banking & payments</p>
          <h1>Accounts Payable</h1>
          <p>
            Track outstanding distributor bills, aging exposure (0–30, 31–60, 60+ days), and disburse payments with automated FIFO bill settlement.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/payments" className="action-btn">
            Payments Log →
          </Link>
          <Link href="/bank-book" className="action-btn">
            Bank & Cash Book →
          </Link>
          <Link href="/purchase-orders" className="button-primary">
            + Purchase Invoices
          </Link>
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

      {/* KPI Cards */}
      <div className="sales-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "22px" }}>
        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Total Outstanding Payables
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: metrics.totalPayables > 0 ? "#b45309" : "var(--ink)" }}>
            ₹{metrics.totalPayables.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Owed across {metrics.activePayablesCount} distributors
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Critical Payables (60+ Days)
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: metrics.criticalCount > 0 ? "#dc2626" : "var(--ink)" }}>
            {metrics.criticalCount} <span style={{ fontSize: "0.9rem", fontWeight: "normal" }}>accounts</span>
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Overdue (31–60d): {metrics.overdueCount} accounts
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Total Disbursed to Date
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "#16a34a" }}>
            ₹{metrics.totalPaidToSuppliers.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Lifetime procurement payments
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Payables Aging Split
          </span>
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
            <span className="aging-badge current" style={{ fontSize: "0.68rem" }}>0-30d: {payables.filter(p => p.balance > 0 && p.agingBucket === "CURRENT_0_30").length}</span>
            <span className="aging-badge overdue" style={{ fontSize: "0.68rem" }}>31-60d: {metrics.overdueCount}</span>
            <span className="aging-badge high-risk" style={{ fontSize: "0.68rem" }}>60d+: {metrics.criticalCount}</span>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="panel sales-toolbar" style={{ marginBottom: "18px", padding: "16px 20px" }}>
        <div className="sales-search-wrap" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            className="sales-search-input"
            placeholder="Search distributor by company name, contact, or phone..."
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
            Aging Stage:
            <select
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            >
              <option value="all">All Payables</option>
              <option value="CURRENT_0_30">0–30 Days (Current)</option>
              <option value="OVERDUE_31_60">31–60 Days (Overdue)</option>
              <option value="CRITICAL_60_PLUS">60+ Days (Critical Risk)</option>
            </select>
          </label>

          <button
            type="button"
            className="action-btn"
            onClick={() => void loadPayables()}
            style={{ marginLeft: "auto" }}
          >
            ↻ Refresh Payables
          </button>
        </div>
      </div>

      {/* Payables Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Distributor Payables Ledger ({payables.length})</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Showing registered suppliers with balances and aging
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Supplier / Distributor</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Amount Due</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Aging Risk</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Oldest Bill Age</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Pending Bills</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Last Payment</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading accounts payable...
                  </td>
                </tr>
              ) : payables.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    No supplier accounts matching current filters.
                  </td>
                </tr>
              ) : (
                payables.map((p) => {
                  const daysOld = getDaysOld(p.oldestInvoiceDate);
                  return (
                    <tr key={p.id}>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: "bold" }}>{p.name} {p.code ? `(${p.code})` : ""}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                          {p.phone || p.contactName || "No contact info"}
                          {p.gstin ? ` | GST: ${p.gstin}` : ""}
                        </div>
                      </td>
                      <td style={{ textAlign: "right", padding: "10px" }}>
                        <strong style={{ fontSize: "0.95rem", color: p.balance > 0 ? "#b45309" : "#16a34a" }}>
                          ₹{p.balance.toFixed(2)}
                        </strong>
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        {p.balance > 0 ? getAgingBadge(p.agingBucket) : <span className="status-badge" style={{ background: "#ecfdf5", color: "#065f46" }}>Settled</span>}
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        {p.balance > 0 ? (
                          <>
                            <span style={{ fontWeight: "bold" }}>{daysOld}</span> days ago
                            <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                              {new Date(p.oldestInvoiceDate).toLocaleDateString()}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        <span className="status-badge" style={{ padding: "3px 8px", background: "var(--paper)", border: "1px solid var(--line)" }}>
                          {p.unpaidInvoicesCount} bill{p.unpaidInvoicesCount === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", fontSize: "0.75rem", color: "var(--muted)" }}>
                        {p.lastPaymentDate ? new Date(p.lastPaymentDate).toLocaleDateString() : "No prior payment"}
                      </td>
                      <td style={{ textAlign: "right", padding: "10px" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => openSupplierDetail(p.id)}
                          >
                            Statement
                          </button>
                          {p.balance > 0 && (
                            <button
                              type="button"
                              className="action-btn"
                              style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
                              onClick={() => {
                                setPayTarget(p);
                                setPayAmount(String(p.balance));
                              }}
                            >
                              + Pay ₹
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Supplier Modal */}
      {payTarget && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Disburse Supplier Payment</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => {
                  setPayTarget(null);
                  setPayAmount("");
                  setPayRef("");
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDisbursePayment} className="modal-form">
              <div style={{ padding: "12px", background: "var(--paper)", borderRadius: "6px", marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Supplier:</span>
                  <strong>{payTarget.name} {payTarget.phone ? `(${payTarget.phone})` : ""}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Current Due:</span>
                  <strong style={{ color: "#b45309", fontSize: "1.05rem" }}>₹{payTarget.balance.toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)" }}>
                    Payment Amount (₹) *
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: "0.7rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => setPayAmount(String(payTarget.balance))}
                  >
                    Pay Full Due (₹{payTarget.balance.toFixed(2)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payTarget.balance}
                  required
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "1.1rem", fontWeight: "bold", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Payment Method *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {["CASH", "UPI", "CARD", "CREDIT"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`payment-method-btn ${payMethod === m ? "active" : ""}`}
                      onClick={() => setPayMethod(m)}
                      style={{ padding: "8px 4px", fontSize: "0.72rem" }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Reference / Cheque / UTR # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NEFT12345 / Cheque 004812"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "0.84rem", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                />
              </div>

              <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", marginBottom: "16px", fontSize: "0.75rem", color: "#166534" }}>
                ℹ <strong>FIFO Allocation:</strong> This disbursement will automatically knock off the oldest outstanding purchase bills first and record an outflow in your cash/bank book.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    setPayTarget(null);
                    setPayAmount("");
                    setPayRef("");
                  }}
                  disabled={paying}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={paying || !payAmount}
                >
                  {paying ? "Disbursing..." : `Confirm Payment of ₹${Number(payAmount || 0).toFixed(2)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Voucher Modal (Printable) */}
      {voucher && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Payment Advice Generated</h2>
              <button type="button" className="close-btn" onClick={() => setVoucher(null)}>
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>SUPPLIER PAYMENT ADVICE</h3>
                <p>ACCOUNTS PAYABLE DISBURSEMENT</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher #:</span>
                <strong>{voucher.voucherNumber}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Date:</span>
                <span>{new Date(voucher.createdAt).toLocaleString()}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Supplier:</span>
                <strong>{voucher.supplierName}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Payment Mode:</span>
                <strong>{voucher.method} {voucher.reference ? `(${voucher.reference})` : ""}</strong>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Previous Balance Due:</span>
                  <span>₹{voucher.previousBalance.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row" style={{ fontWeight: "bold", color: "#16a34a" }}>
                  <span>Amount Paid / Settled:</span>
                  <span>- ₹{voucher.amount.toFixed(2)}</span>
                </div>
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Remaining Payable Due:</span>
                    <span>₹{voucher.newBalance.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {voucher.allocations.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "bold", marginBottom: "4px" }}>
                    PURCHASE INVOICE ALLOCATIONS:
                  </div>
                  <table className="receipt-table">
                    <thead>
                      <tr>
                        <th>Purchase Invoice #</th>
                        <th style={{ textAlign: "right" }}>Settled Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voucher.allocations.map((a, idx) => (
                        <tr key={idx}>
                          <td>{a.invoiceNumber}</td>
                          <td style={{ textAlign: "right" }}>₹{a.allocatedAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="receipt-divider" />

              <div className="receipt-footer">
                <p>Posted to supplier ledger & cash book.</p>
                <small>Generated by PillBills Pharmacy Accounting</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ marginTop: "14px" }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => setVoucher(null)}
              >
                Done
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => window.print()}
              >
                🖨 Print Payment Advice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Statement & Open Bills Drawer */}
      {detailSupplier && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "750px" }}>
            <div className="modal-head">
              <div>
                <h2>{detailSupplier.name} {detailSupplier.code ? `(${detailSupplier.code})` : ""}</h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Phone: {detailSupplier.phone || "—"} | Outstanding Balance: <strong style={{ color: "#b45309" }}>₹{detailSupplier.balance.toFixed(2)}</strong>
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setDetailSupplier(null)}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--line)", margin: "10px 0 14px" }}>
              <button
                type="button"
                className={`tab-btn ${detailTab === "bills" ? "active" : ""}`}
                onClick={() => setDetailTab("bills")}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: detailTab === "bills" ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "none",
                  fontWeight: detailTab === "bills" ? "bold" : "normal",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                Open Bills ({detailSupplier.openInvoices.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${detailTab === "statement" ? "active" : ""}`}
                onClick={() => setDetailTab("statement")}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: detailTab === "statement" ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "none",
                  fontWeight: detailTab === "statement" ? "bold" : "normal",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                Running Ledger Statement
              </button>
              <button
                type="button"
                className={`tab-btn ${detailTab === "payments" ? "active" : ""}`}
                onClick={() => setDetailTab("payments")}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: detailTab === "payments" ? "2px solid var(--accent)" : "2px solid transparent",
                  background: "none",
                  fontWeight: detailTab === "payments" ? "bold" : "normal",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                Past Payments ({detailSupplier.payments.length})
              </button>
            </div>

            <div style={{ maxHeight: "380px", overflowY: "auto" }}>
              {detailLoading ? (
                <p style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>Loading statement...</p>
              ) : detailTab === "bills" ? (
                detailSupplier.openInvoices.length === 0 ? (
                  <p style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>All purchase bills are fully settled!</p>
                ) : (
                  <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Invoice Date</th>
                        <th style={{ textAlign: "right" }}>Bill Total</th>
                        <th style={{ textAlign: "right" }}>Paid</th>
                        <th style={{ textAlign: "right" }}>Outstanding Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailSupplier.openInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td><strong>{inv.invoiceNumber}</strong></td>
                          <td>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                          <td style={{ textAlign: "right" }}>₹{inv.total.toFixed(2)}</td>
                          <td style={{ textAlign: "right", color: "#16a34a" }}>₹{inv.paid.toFixed(2)}</td>
                          <td style={{ textAlign: "right", fontWeight: "bold", color: "#b45309" }}>₹{inv.outstanding.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : detailTab === "statement" ? (
                <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th style={{ textAlign: "right" }}>Debit (Purchase)</th>
                      <th style={{ textAlign: "right" }}>Credit (Payment)</th>
                      <th style={{ textAlign: "right" }}>Payable Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSupplier.statement.map((s) => (
                      <tr key={s.id}>
                        <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td>{s.description}</td>
                        <td style={{ textAlign: "right", color: s.side === "DEBIT" ? "#b45309" : undefined }}>
                          {s.side === "DEBIT" ? `₹${s.amount.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: s.side === "CREDIT" ? "#16a34a" : undefined }}>
                          {s.side === "CREDIT" ? `₹${s.amount.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{s.runningBalance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th style={{ textAlign: "left" }}>Allocated Invoices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSupplier.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td><span className="payment-pill">{p.method}</span></td>
                        <td>{p.reference || "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold", color: "#16a34a" }}>₹{p.amount.toFixed(2)}</td>
                        <td>{p.allocations.map(a => `${a.invoiceNumber} (₹${a.amount.toFixed(2)})`).join(", ") || "Unallocated"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "14px" }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => setDetailSupplier(null)}
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

