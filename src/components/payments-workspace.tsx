"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SupplierPaymentItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  amount: number;
  method: string;
  reference: string | null;
  createdAt: string;
  allocationsCount: number;
  allocations: Array<{
    invoiceNumber: string;
    amount: number;
  }>;
};

type SupplierOption = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
};

type PaymentMetrics = {
  totalPaymentsCount: number;
  totalDisbursed: number;
};

type BankOption = {
  id: string;
  name: string;
  balance: number;
};

type CashOption = {
  id: string;
  name: string;
  balance: number;
};

export function PaymentsWorkspace() {
  const [payments, setPayments] = useState<SupplierPaymentItem[]>([]);
  const [metrics, setMetrics] = useState<PaymentMetrics>({
    totalPaymentsCount: 0,
    totalDisbursed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  // Create payment modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payRef, setPayRef] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankOption[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashOption[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedCashId, setSelectedCashId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Selected voucher for print/inspection
  const [activeVoucher, setActiveVoucher] = useState<SupplierPaymentItem | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPayments() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (methodFilter !== "all") q.set("method", methodFilter);

      const res = await fetch(`/api/payments?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments ?? []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCreateDependencies() {
    try {
      const [payablesRes, bankRes] = await Promise.all([
        fetch("/api/payables"),
        fetch("/api/bank-book"),
      ]);
      if (payablesRes.ok) {
        const d = await payablesRes.json();
        setSuppliers(d.payables ?? []);
      }
      if (bankRes.ok) {
        const b = await bankRes.json();
        setBankAccounts(b.bankAccounts ?? []);
        setCashRegisters(b.cashRegisters ?? []);
        if (b.bankAccounts?.[0]) setSelectedBankId(b.bankAccounts[0].id);
        if (b.cashRegisters?.[0]) setSelectedCashId(b.cashRegisters[0].id);
      }
    } catch (err) {
      console.error("Failed to load payment dependencies:", err);
    }
  }

  useEffect(() => {
    void loadPayments();
  }, [search, methodFilter]);

  function openCreateModal() {
    void loadCreateDependencies();
    setCreateModalOpen(true);
  }

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplierId || !payAmount) return;

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setError("Please enter a valid payment amount.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplierId,
          amount: amt,
          method: payMethod,
          reference: payRef.trim() || undefined,
          bankAccountId: payMethod !== "CASH" ? selectedBankId : undefined,
          cashRegisterId: payMethod === "CASH" ? selectedCashId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disburse payment.");
        setSubmitting(false);
        return;
      }

      setNotice(`Payment of ₹${data.payment.amount} recorded for ${data.payment.supplierName}.`);
      setCreateModalOpen(false);
      setSelectedSupplierId("");
      setPayAmount("");
      setPayRef("");
      void loadPayments();
    } catch (err) {
      console.error(err);
      setError("Network error while recording payment.");
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
          <h1>Supplier Payments</h1>
          <p>
            Record disbursements to medicine distributors with automated FIFO bill allocation, bank/cash account integration, and auditable payment vouchers.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/payables" className="action-btn">
            Accounts Payable →
          </Link>
          <button type="button" className="button-primary" onClick={openCreateModal}>
            + Disburse Payment
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

      {/* KPI Cards */}
      <div className="sales-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "22px" }}>
        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Total Disbursements
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "#16a34a" }}>
            ₹{metrics.totalDisbursed.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Lifetime paid to suppliers
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Payment Transactions
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--ink)" }}>
            {metrics.totalPaymentsCount}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Disbursement vouchers generated
          </span>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="panel sales-toolbar" style={{ marginBottom: "18px", padding: "16px 20px" }}>
        <div className="sales-search-wrap" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            className="sales-search-input"
            placeholder="Search payment by supplier name or reference / UTR..."
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
            Payment Method:
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            >
              <option value="all">All Methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CREDIT">Credit</option>
            </select>
          </label>

          <button
            type="button"
            className="action-btn"
            onClick={() => void loadPayments()}
            style={{ marginLeft: "auto" }}
          >
            ↻ Refresh Register
          </button>
        </div>
      </div>

      {/* Payments Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Disbursement Register ({payments.length})</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Audited supplier payment transactions
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Date & Time</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Supplier</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Method</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Reference</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Amount Disbursed</th>
                <th style={{ textAlign: "center", padding: "10px" }}>Bills Settled</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading payment register...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    No payment disbursements found. Click &quot;+ Disburse Payment&quot; to pay a supplier.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: "10px" }}>
                      {new Date(p.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{p.supplierName}</strong>
                      {p.supplierPhone && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{p.supplierPhone}</div>}
                    </td>
                    <td style={{ textAlign: "center", padding: "10px" }}>
                      <span className="payment-pill">{p.method}</span>
                    </td>
                    <td style={{ padding: "10px", fontSize: "0.76rem", color: "var(--muted)" }}>
                      {p.reference || "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#16a34a" }}>
                        ₹{p.amount.toFixed(2)}
                      </strong>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px" }}>
                      <span className="status-badge" style={{ padding: "3px 8px", background: "var(--paper)", border: "1px solid var(--line)" }}>
                        {p.allocationsCount} invoice{p.allocationsCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px" }}>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => setActiveVoucher(p)}
                      >
                        Advice Voucher
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disburse Payment Modal */}
      {createModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "500px" }}>
            <div className="modal-head">
              <h2>Disburse Supplier Payment</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setCreateModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="modal-form">
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Select Supplier / Distributor *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => {
                    setSelectedSupplierId(e.target.value);
                    const supp = suppliers.find((s) => s.id === e.target.value);
                    if (supp && supp.balance > 0) {
                      setPayAmount(String(supp.balance));
                    }
                  }}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: "0.85rem" }}
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Due: ₹{s.balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedSupplier && (
                <div style={{ padding: "10px 12px", background: "var(--paper)", borderRadius: "6px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Current Outstanding Payable:</span>
                  <strong style={{ color: "#b45309", fontSize: "1.05rem" }}>₹{selectedSupplier.balance.toFixed(2)}</strong>
                </div>
              )}

              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)" }}>
                    Amount to Disburse (₹) *
                  </label>
                  {selectedSupplier && selectedSupplier.balance > 0 && (
                    <button
                      type="button"
                      style={{ fontSize: "0.7rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setPayAmount(String(selectedSupplier.balance))}
                    >
                      Pay Full Due
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
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

              {/* Source Account Picker */}
              {payMethod === "CASH" ? (
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                    Drawn From Cash Register:
                  </label>
                  <select
                    value={selectedCashId}
                    onChange={(e) => setSelectedCashId(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                  >
                    {cashRegisters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Balance: ₹{c.balance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                    Drawn From Bank Account:
                  </label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (Balance: ₹{b.balance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

              <div className="modal-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={submitting || !payAmount || !selectedSupplierId}
                >
                  {submitting ? "Processing..." : `Confirm Payment of ₹${Number(payAmount || 0).toFixed(2)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Advice Modal */}
      {activeVoucher && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Payment Advice</h2>
              <button type="button" className="close-btn" onClick={() => setActiveVoucher(null)}>
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>SUPPLIER PAYMENT ADVICE</h3>
                <p>DISBURSEMENT VOUCHER</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher ID:</span>
                <strong>{activeVoucher.id.slice(0, 8).toUpperCase()}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Date:</span>
                <span>{new Date(activeVoucher.createdAt).toLocaleString()}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Supplier:</span>
                <strong>{activeVoucher.supplierName}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Payment Mode:</span>
                <strong>{activeVoucher.method} {activeVoucher.reference ? `(${activeVoucher.reference})` : ""}</strong>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Amount Disbursed:</span>
                    <span>₹{activeVoucher.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {activeVoucher.allocations.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: "bold", marginBottom: "4px" }}>
                    SETTLED PURCHASE INVOICES:
                  </div>
                  <table className="receipt-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th style={{ textAlign: "right" }}>Settled Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeVoucher.allocations.map((a, idx) => (
                        <tr key={idx}>
                          <td>{a.invoiceNumber}</td>
                          <td style={{ textAlign: "right" }}>₹{a.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="receipt-divider" />

              <div className="receipt-footer">
                <p>Audited transaction recorded in PillBills ledger.</p>
                <small>Generated by PillBills Pharmacy System</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ marginTop: "14px" }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => setActiveVoucher(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => window.print()}
              >
                🖨 Print Advice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

