"use client";

import { useEffect, useState } from "react";

type AccountItem = {
  id: string;
  name: string;
  opening: number;
  balance: number;
  entriesCount: number;
};

type CashEntryItem = {
  id: string;
  accountName: string;
  accountType: "BANK" | "CASH";
  side: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
  referenceId: string | null;
  createdAt: string;
};

type BankBookMetrics = {
  totalBankBalance: number;
  totalCashBalance: number;
  netTotalFunds: number;
  todayInflow: number;
  todayOutflow: number;
};

export function BankBookWorkspace() {
  const [bankAccounts, setBankAccounts] = useState<AccountItem[]>([]);
  const [cashRegisters, setCashRegisters] = useState<AccountItem[]>([]);
  const [entries, setEntries] = useState<CashEntryItem[]>([]);
  const [metrics, setMetrics] = useState<BankBookMetrics>({
    totalBankBalance: 0,
    totalCashBalance: 0,
    netTotalFunds: 0,
    todayInflow: 0,
    todayOutflow: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");

  // Modals
  const [addAccountModal, setAddAccountModal] = useState(false);
  const [accountType, setAccountType] = useState<"BANK" | "CASH">("BANK");
  const [accountName, setAccountName] = useState("");
  const [accountOpening, setAccountOpening] = useState("0");

  const [contraModal, setContraModal] = useState(false);
  const [contraType, setContraType] = useState<"CASH_TO_BANK" | "BANK_TO_CASH">("CASH_TO_BANK");
  const [contraBankId, setContraBankId] = useState("");
  const [contraCashId, setContraCashId] = useState("");
  const [contraAmount, setContraAmount] = useState("");
  const [contraDesc, setContraDesc] = useState("");

  const [manualEntryModal, setManualEntryModal] = useState(false);
  const [manualTargetType, setManualTargetType] = useState<"BANK" | "CASH">("CASH");
  const [manualAccountId, setManualAccountId] = useState("");
  const [manualType, setManualType] = useState<"INFLOW" | "OUTFLOW">("OUTFLOW");
  const [manualAmount, setManualAmount] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadBankBook() {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (accountFilter !== "all") q.set("account", accountFilter);

      const res = await fetch(`/api/bank-book?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBankAccounts(data.bankAccounts ?? []);
        setCashRegisters(data.cashRegisters ?? []);
        setEntries(data.entries ?? []);
        if (data.metrics) setMetrics(data.metrics);
        if (data.bankAccounts?.[0] && !contraBankId) setContraBankId(data.bankAccounts[0].id);
        if (data.cashRegisters?.[0] && !contraCashId) setContraCashId(data.cashRegisters[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load bank & cash ledger.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBankBook();
  }, [search, accountFilter]);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!accountName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bank-book/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: accountType,
          name: accountName.trim(),
          opening: Number(accountOpening || 0),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create account.");
        setSubmitting(false);
        return;
      }

      setNotice(`${accountType === "BANK" ? "Bank account" : "Cash register"} "${accountName}" added.`);
      setAddAccountModal(false);
      setAccountName("");
      setAccountOpening("0");
      void loadBankBook();
    } catch (err) {
      console.error(err);
      setError("Network error while creating account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContraTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!contraBankId || !contraCashId || !contraAmount) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bank-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferType: contraType,
          bankAccountId: contraBankId,
          cashRegisterId: contraCashId,
          amount: Number(contraAmount),
          description: contraDesc.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Contra transfer failed.");
        setSubmitting(false);
        return;
      }

      setNotice(`Contra transfer of ₹${data.amount} posted successfully.`);
      setContraModal(false);
      setContraAmount("");
      setContraDesc("");
      void loadBankBook();
    } catch (err) {
      console.error(err);
      setError("Network error while processing contra transfer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!manualAccountId || !manualAmount || !manualDesc.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bank-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: manualTargetType,
          accountId: manualAccountId,
          type: manualType,
          amount: Number(manualAmount),
          description: manualDesc.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record entry.");
        setSubmitting(false);
        return;
      }

      setNotice(`Recorded ${manualType.toLowerCase()} of ₹${manualAmount}.`);
      setManualEntryModal(false);
      setManualAmount("");
      setManualDesc("");
      void loadBankBook();
    } catch (err) {
      console.error(err);
      setError("Network error while recording entry.");
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
          <h1>Bank & Cash Book</h1>
          <p>
            Monitor live bank account and cash drawer liquidity, record contra transfers (cash deposits / ATM withdrawals), and inspect chronological cash flows.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <button type="button" className="action-btn" onClick={() => setAddAccountModal(true)}>
            + Add Account
          </button>
          <button type="button" className="action-btn" onClick={() => setManualEntryModal(true)}>
            + Cash Entry
          </button>
          <button type="button" className="button-primary" onClick={() => setContraModal(true)}>
            ⇄ Contra Transfer
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
            Total Store Liquidity
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--accent)" }}>
            ₹{metrics.netTotalFunds.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Combined bank + cash
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Bank Liquidity
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--ink)" }}>
            ₹{metrics.totalBankBalance.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Across {bankAccounts.length} bank account{bankAccounts.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Cash Drawer Position
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--ink)" }}>
            ₹{metrics.totalCashBalance.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Across {cashRegisters.length} counter drawer{cashRegisters.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Today&apos;s Movement
          </span>
          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
            <div>
              <span style={{ fontSize: "0.68rem", color: "#16a34a", display: "block" }}>INFLOW (+)</span>
              <strong style={{ fontSize: "1.1rem", color: "#16a34a" }}>₹{metrics.todayInflow.toFixed(2)}</strong>
            </div>
            <div>
              <span style={{ fontSize: "0.68rem", color: "#dc2626", display: "block" }}>OUTFLOW (-)</span>
              <strong style={{ fontSize: "1.1rem", color: "#dc2626" }}>₹{metrics.todayOutflow.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Account Cards Section */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "22px" }}>
        {/* Bank Accounts */}
        <div className="panel" style={{ padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem" }}>🏦 Bank Accounts ({bankAccounts.length})</h3>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Current & Savings</span>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            {bankAccounts.map((b) => (
              <div key={b.id} style={{ padding: "10px 12px", background: "var(--paper)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{b.name}</strong>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Opening: ₹{b.opening.toFixed(2)} | {b.entriesCount} entries</div>
                </div>
                <strong style={{ fontSize: "1.05rem", color: b.balance >= 0 ? "#16a34a" : "#dc2626" }}>
                  ₹{b.balance.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        </div>

        {/* Cash Registers */}
        <div className="panel" style={{ padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem" }}>💵 Cash Registers ({cashRegisters.length})</h3>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Drawers & Tills</span>
          </div>
          <div style={{ display: "grid", gap: "8px" }}>
            {cashRegisters.map((c) => (
              <div key={c.id} style={{ padding: "10px 12px", background: "var(--paper)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{c.name}</strong>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Opening: ₹{c.opening.toFixed(2)} | {c.entriesCount} entries</div>
                </div>
                <strong style={{ fontSize: "1.05rem", color: c.balance >= 0 ? "#16a34a" : "#dc2626" }}>
                  ₹{c.balance.toFixed(2)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="panel sales-toolbar" style={{ marginBottom: "18px", padding: "16px 20px" }}>
        <div className="sales-search-wrap" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <input
            type="text"
            className="sales-search-input"
            placeholder="Search cash book by description, reference, or counter..."
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
            Filter Account:
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "5px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            >
              <option value="all">All Accounts & Drawers</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>Bank: {b.name}</option>
              ))}
              {cashRegisters.map((c) => (
                <option key={c.id} value={c.id}>Cash: {c.name}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="action-btn"
            onClick={() => void loadBankBook()}
            style={{ marginLeft: "auto" }}
          >
            ↻ Refresh Book
          </button>
        </div>
      </div>

      {/* Cash Book Table Panel */}
      <div className="panel sales-table-panel" style={{ padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Cash & Bank Day Book ({entries.length})</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Chronological ledger of cash and bank movements
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px" }}>Date & Time</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Account</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Description</th>
                <th style={{ textAlign: "left", padding: "10px" }}>Reference</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Inflow (Debit)</th>
                <th style={{ textAlign: "right", padding: "10px" }}>Outflow (Credit)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                    Loading transactions...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                    No transactions recorded for this account.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ padding: "10px" }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{e.accountName}</strong>
                      <span className="payment-pill" style={{ marginLeft: "6px" }}>{e.accountType}</span>
                    </td>
                    <td style={{ padding: "10px" }}>{e.description}</td>
                    <td style={{ padding: "10px", fontSize: "0.75rem", color: "var(--muted)" }}>{e.referenceId || "—"}</td>
                    <td style={{ textAlign: "right", padding: "10px", color: "#16a34a", fontWeight: e.side === "DEBIT" ? "bold" : "normal" }}>
                      {e.side === "DEBIT" ? `+ ₹${e.amount.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", padding: "10px", color: "#dc2626", fontWeight: e.side === "CREDIT" ? "bold" : "normal" }}>
                      {e.side === "CREDIT" ? `- ₹${e.amount.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contra Transfer Modal */}
      {contraModal && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "480px" }}>
            <div className="modal-head">
              <h2>Contra Fund Transfer</h2>
              <button type="button" className="close-btn" onClick={() => setContraModal(false)}>✕</button>
            </div>

            <form onSubmit={handleContraTransfer} className="modal-form">
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Transfer Direction *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    className={`payment-method-btn ${contraType === "CASH_TO_BANK" ? "active" : ""}`}
                    onClick={() => setContraType("CASH_TO_BANK")}
                  >
                    Cash Deposit → Bank
                  </button>
                  <button
                    type="button"
                    className={`payment-method-btn ${contraType === "BANK_TO_CASH" ? "active" : ""}`}
                    onClick={() => setContraType("BANK_TO_CASH")}
                  >
                    Bank Withdrawal → Cash
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Bank Account *
                </label>
                <select
                  value={contraBankId}
                  onChange={(e) => setContraBankId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} (₹{b.balance.toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Cash Register Drawer *
                </label>
                <select
                  value={contraCashId}
                  onChange={(e) => setContraCashId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                >
                  {cashRegisters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} (₹{c.balance.toFixed(2)})</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Transfer Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={contraAmount}
                  onChange={(e) => setContraAmount(e.target.value)}
                  style={{ width: "100%", padding: "10px", fontSize: "1.1rem", fontWeight: "bold", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Description / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. End of day cash bank deposit"
                  value={contraDesc}
                  onChange={(e) => setContraDesc(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={() => setContraModal(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting || !contraAmount}>
                  {submitting ? "Posting..." : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {addAccountModal && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "450px" }}>
            <div className="modal-head">
              <h2>Register New Account / Till</h2>
              <button type="button" className="close-btn" onClick={() => setAddAccountModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateAccount} className="modal-form">
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Account Type *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    className={`payment-method-btn ${accountType === "BANK" ? "active" : ""}`}
                    onClick={() => setAccountType("BANK")}
                  >
                    Bank Account
                  </button>
                  <button
                    type="button"
                    className={`payment-method-btn ${accountType === "CASH" ? "active" : ""}`}
                    onClick={() => setAccountType("CASH")}
                  >
                    Cash Drawer
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Account Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder={accountType === "BANK" ? "e.g. ICICI Current A/C" : "e.g. Counter 2 Cash Drawer"}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Opening Balance (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={accountOpening}
                  onChange={(e) => setAccountOpening(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={() => setAddAccountModal(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting || !accountName.trim()}>
                  {submitting ? "Saving..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Cash Entry Modal */}
      {manualEntryModal && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal" style={{ maxWidth: "450px" }}>
            <div className="modal-head">
              <h2>Record Manual Cash / Bank Entry</h2>
              <button type="button" className="close-btn" onClick={() => setManualEntryModal(false)}>✕</button>
            </div>

            <form onSubmit={handleManualEntry} className="modal-form">
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                  Movement Type *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    className={`payment-method-btn ${manualType === "OUTFLOW" ? "active" : ""}`}
                    onClick={() => setManualType("OUTFLOW")}
                  >
                    Expense / Outflow (-)
                  </button>
                  <button
                    type="button"
                    className={`payment-method-btn ${manualType === "INFLOW" ? "active" : ""}`}
                    onClick={() => setManualType("INFLOW")}
                  >
                    Income / Inflow (+)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Select Account *
                </label>
                <select
                  required
                  value={manualAccountId}
                  onChange={(e) => {
                    setManualAccountId(e.target.value);
                    const isBank = bankAccounts.some(b => b.id === e.target.value);
                    setManualTargetType(isBank ? "BANK" : "CASH");
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "5px", border: "1px solid var(--line)" }}
                >
                  <option value="">-- Choose Account --</option>
                  <optgroup label="Bank Accounts">
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} (₹{b.balance.toFixed(2)})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Cash Drawers">
                    {cashRegisters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} (₹{c.balance.toFixed(2)})</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", fontSize: "1.05rem", fontWeight: "bold", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "4px" }}>
                  Description / Particulars *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Counter cleaning supplies / Electricity"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "5px", border: "1px solid var(--line)" }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="action-btn" onClick={() => setManualEntryModal(false)}>Cancel</button>
                <button type="submit" className="button-primary" disabled={submitting || !manualAmount || !manualAccountId}>
                  {submitting ? "Saving..." : "Record Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

