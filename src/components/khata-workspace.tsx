"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Debtor = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  unpaidInvoicesCount: number;
  oldestDate: string;
  agingBucket: "CURRENT_0_30" | "OVERDUE_31_60" | "HIGH_RISK_60_PLUS";
  lastPaymentDate: string | null;
};

type KhataMetrics = {
  totalOutstanding: number;
  creditCustomersCount: number;
  highRiskCount: number;
  overdueCount: number;
  totalReceiptsCollected: number;
  todayReceiptsCollected: number;
};

type ReceiptResult = {
  receipt: {
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    createdAt: string;
    customerName: string;
    customerPhone: string;
    previousBalance: number;
    newBalance: number;
    allocations: Array<{
      invoiceId: string;
      invoiceNumber: string;
      allocatedAmount: number;
    }>;
  };
};

type StatementEntry = {
  id: string;
  side: "DEBIT" | "CREDIT";
  amount: number;
  runningBalance: number;
  description: string;
  createdAt: string;
};

export function KhataWorkspace() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [metrics, setMetrics] = useState<KhataMetrics>({
    totalOutstanding: 0,
    creditCustomersCount: 0,
    highRiskCount: 0,
    overdueCount: 0,
    totalReceiptsCollected: 0,
    todayReceiptsCollected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState<string>("all");

  // Payment modal state
  const [collectTarget, setCollectTarget] = useState<Debtor | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState<string>("");
  const [paying, setPaying] = useState(false);

  // Success voucher modal state
  const [voucher, setVoucher] = useState<ReceiptResult["receipt"] | null>(null);

  // Statement drawer state
  const [statementCustomer, setStatementCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);
  const [statementEntries, setStatementEntries] = useState<StatementEntry[]>([]);
  const [statementLoading, setStatementLoading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadKhata() {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (search.trim()) queryParams.set("search", search.trim());
      if (agingFilter !== "all") queryParams.set("aging", agingFilter);

      const res = await fetch(`/api/khata?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to load Khata register");
      const data = await res.json();
      setDebtors(data.debtors ?? []);
      if (data.metrics) setMetrics(data.metrics);
    } catch (err) {
      console.error(err);
      setError("Unable to load customer credit register.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKhata();
  }, [search, agingFilter]);

  async function openStatement(customer: { id: string; name: string; phone: string }) {
    setStatementCustomer(customer);
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        setStatementEntries(data.customer?.statement ?? []);
      }
    } catch (err) {
      console.error("Failed to load statement:", err);
    } finally {
      setStatementLoading(false);
    }
  }

  async function handleCollectPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!collectTarget || !amount) return;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid positive payment amount.");
      return;
    }

    setPaying(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/khata/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: collectTarget.id,
          amount: numAmount,
          method,
          reference: reference.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record payment.");
        setPaying(false);
        return;
      }

      setNotice(`Payment of ₹${data.receipt.amount} collected for ${data.receipt.customerName}.`);
      setVoucher(data.receipt);
      setCollectTarget(null);
      setAmount("");
      setReference("");
      void loadKhata();
    } catch (err) {
      console.error(err);
      setError("Network error while recording payment.");
    } finally {
      setPaying(false);
    }
  }

  function getAgingBadge(bucket: Debtor["agingBucket"]) {
    switch (bucket) {
      case "HIGH_RISK_60_PLUS":
        return <span className="aging-badge high-risk">60+ Days High Risk</span>;
      case "OVERDUE_31_60":
        return <span className="aging-badge overdue">31–60 Days Overdue</span>;
      case "CURRENT_0_30":
      default:
        return <span className="aging-badge current">0–30 Days Current</span>;
    }
  }

  function getDaysOld(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  return (
    <div className="workspace-container">
      {/* Top Banner & Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Customers & Credit Ledger</p>
          <h1>Customer Udhaar / Khata</h1>
          <p>
            Track outstanding balances, aging exposure (0–30, 31–60, 60+ days), and collect payments with automated FIFO bill settlement.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/customers" className="action-btn">
            Customers Registry →
          </Link>
          <Link href="/billing" className="button-primary">
            + New Bill / POS
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

      {/* KPI Metric Cards */}
      <div className="sales-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "22px" }}>
        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Total Outstanding Udhaar
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: metrics.totalOutstanding > 0 ? "#b45309" : "var(--ink)" }}>
            ₹{metrics.totalOutstanding.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Across {metrics.creditCustomersCount} customer accounts
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            High-Risk Udhaar (60+ Days)
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: metrics.highRiskCount > 0 ? "#dc2626" : "var(--ink)" }}>
            {metrics.highRiskCount} <span style={{ fontSize: "0.9rem", fontWeight: "normal" }}>accounts</span>
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Overdue (31–60d): {metrics.overdueCount} accounts
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Today&apos;s Collections
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "#16a34a" }}>
            ₹{metrics.todayReceiptsCollected.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Total Collections: ₹{metrics.totalReceiptsCollected.toFixed(2)}
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Aging Profile
          </span>
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
            <span className="aging-badge current" style={{ fontSize: "0.68rem" }}>0-30d: {debtors.filter(d => d.agingBucket === "CURRENT_0_30").length}</span>
            <span className="aging-badge overdue" style={{ fontSize: "0.68rem" }}>31-60d: {metrics.overdueCount}</span>
            <span className="aging-badge high-risk" style={{ fontSize: "0.68rem" }}>60d+: {metrics.highRiskCount}</span>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="panel sales-toolbar" style={{ marginBottom: "18px", padding: "16px 20px" }}>
        <div className="sales-search-wrap" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            className="sales-search-input"
            placeholder="Search debtor by name or phone..."
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
            Aging Bucket:
            <select
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            >
              <option value="all">All Aging Stages</option>
              <option value="CURRENT_0_30">0–30 Days (Current)</option>
              <option value="OVERDUE_31_60">31–60 Days (Overdue)</option>
              <option value="HIGH_RISK_60_PLUS">60+ Days (High Risk)</option>
            </select>
          </label>

          <button
            type="button"
            className="action-btn"
            onClick={() => void loadKhata()}
            style={{ marginLeft: "auto" }}
          >
            ↻ Refresh Register
          </button>
        </div>
      </div>

      {/* Debtor Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Debtor Accounts ({debtors.length})</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Showing customers with pending credit dues
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Customer</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Outstanding Due</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Aging Risk</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Oldest Bill Age</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Unpaid Bills</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Last Payment</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading Khata register...
                  </td>
                </tr>
              ) : debtors.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    {search || agingFilter !== "all"
                      ? "No debtor accounts matching current filters."
                      : "🎉 No pending customer dues! All credit balances are settled."}
                  </td>
                </tr>
              ) : (
                debtors.map((d) => {
                  const daysOld = getDaysOld(d.oldestDate);
                  return (
                    <tr key={d.id}>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: "bold" }}>{d.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{d.phone}</div>
                      </td>
                      <td style={{ textAlign: "right", padding: "10px" }}>
                        <strong style={{ fontSize: "0.95rem", color: "#b45309" }}>
                          ₹{d.balance.toFixed(2)}
                        </strong>
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        {getAgingBadge(d.agingBucket)}
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        <span style={{ fontWeight: "bold" }}>{daysOld}</span> days ago
                        <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                          {new Date(d.oldestDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td style={{ textAlign: "center", padding: "10px" }}>
                        <span className="status-badge" style={{ padding: "3px 8px", background: "var(--paper)", border: "1px solid var(--line)" }}>
                          {d.unpaidInvoicesCount} bill{d.unpaidInvoicesCount === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", fontSize: "0.75rem", color: "var(--muted)" }}>
                        {d.lastPaymentDate ? new Date(d.lastPaymentDate).toLocaleDateString() : "No prior receipt"}
                      </td>
                      <td style={{ textAlign: "right", padding: "10px" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => openStatement(d)}
                          >
                            Statement
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
                            onClick={() => {
                              setCollectTarget(d);
                              setAmount(String(d.balance));
                            }}
                          >
                            + Collect ₹
                          </button>
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

      {/* Collect Payment Modal */}
      {collectTarget && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Collect Khata Payment</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => {
                  setCollectTarget(null);
                  setAmount("");
                  setReference("");
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCollectPayment} className="modal-form">
              <div style={{ padding: "12px", background: "var(--paper)", borderRadius: "6px", marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Customer:</span>
                  <strong>{collectTarget.name} ({collectTarget.phone})</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Outstanding Due:</span>
                  <strong style={{ color: "#b45309", fontSize: "1.05rem" }}>₹{collectTarget.balance.toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)" }}>
                    Amount to Collect (₹) *
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: "0.7rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => setAmount(String(collectTarget.balance))}
                  >
                    Pay Full Due (₹{collectTarget.balance.toFixed(2)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={collectTarget.balance}
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "1.1rem", fontWeight: "bold", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Payment Method *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`payment-method-btn ${method === m ? "active" : ""}`}
                      onClick={() => setMethod(m)}
                      style={{ padding: "8px 4px", fontSize: "0.72rem" }}
                    >
                      {m === "BANK_TRANSFER" ? "Bank" : m}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Reference / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Cheque No / GPay"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "0.84rem", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                />
              </div>

              <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", marginBottom: "16px", fontSize: "0.75rem", color: "#166534" }}>
                ℹ <strong>FIFO Allocation:</strong> This receipt will automatically knock off the oldest outstanding credit invoices in chronological sequence.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    setCollectTarget(null);
                    setAmount("");
                    setReference("");
                  }}
                  disabled={paying}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={paying || !amount}
                >
                  {paying ? "Recording..." : `Confirm Collection of ₹${Number(amount || 0).toFixed(2)}`}
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
              <h2>Receipt Voucher Generated</h2>
              <button type="button" className="close-btn" onClick={() => setVoucher(null)}>
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>UDHAAR PAYMENT VOUCHER</h3>
                <p>CUSTOMER CREDIT COLLECTION</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher ID:</span>
                <strong>{voucher.id.slice(0, 8).toUpperCase()}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Date & Time:</span>
                <span>{new Date(voucher.createdAt).toLocaleString()}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Customer:</span>
                <strong>{voucher.customerName}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Phone:</span>
                <span>{voucher.customerPhone}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Payment Mode:</span>
                <strong>{voucher.method} {voucher.reference ? `(${voucher.reference})` : ""}</strong>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Previous Udhaar Due:</span>
                  <span>₹{voucher.previousBalance.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row" style={{ fontWeight: "bold", color: "#16a34a" }}>
                  <span>Amount Paid / Received:</span>
                  <span>- ₹{voucher.amount.toFixed(2)}</span>
                </div>
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Remaining Balance:</span>
                    <span>₹{voucher.newBalance.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {voucher.allocations.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "bold", marginBottom: "4px" }}>
                    FIFO BILL ALLOCATIONS:
                  </div>
                  <table className="receipt-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
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
                <p>Thank you for keeping your account updated.</p>
                <small>Generated by PillBills Pharmacy System</small>
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
                🖨 Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Statement Drawer */}
      {statementCustomer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "700px" }}>
            <div className="modal-head">
              <div>
                <h2>{statementCustomer.name}</h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Phone: {statementCustomer.phone} | Complete Khata Statement
                </p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setStatementCustomer(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: "420px", overflowY: "auto", padding: "10px 0" }}>
              {statementLoading ? (
                <p style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                  Loading statement entries...
                </p>
              ) : statementEntries.length === 0 ? (
                <p style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                  No ledger entries recorded for this customer yet.
                </p>
              ) : (
                <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Date</th>
                      <th style={{ textAlign: "left" }}>Particulars / Description</th>
                      <th style={{ textAlign: "right" }}>Debit (₹)</th>
                      <th style={{ textAlign: "right" }}>Credit (₹)</th>
                      <th style={{ textAlign: "right" }}>Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementEntries.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                        <td>{e.description}</td>
                        <td style={{ textAlign: "right", color: e.side === "DEBIT" ? "#b45309" : undefined }}>
                          {e.side === "DEBIT" ? `₹${e.amount.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: e.side === "CREDIT" ? "#16a34a" : undefined }}>
                          {e.side === "CREDIT" ? `₹${e.amount.toFixed(2)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>
                          ₹{e.runningBalance.toFixed(2)}
                        </td>
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
                onClick={() => setStatementCustomer(null)}
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

