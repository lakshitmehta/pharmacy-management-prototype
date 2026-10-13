"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LineItem = {
  id: string;
  medicineName: string;
  genericName: string | null;
  barcode: string | null;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitRate: number;
  mrp: number;
  discount: number;
  tax: number;
  total: number;
};

type PaymentItem = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
};

type AuditLogItem = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: "POSTED" | "VOIDED";
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: string;
  customer: { id: string; name: string; phone: string } | null;
  itemCount: number;
  lines: LineItem[];
  payments: PaymentItem[];
  auditLogs?: AuditLogItem[];
};

type Metrics = {
  totalRevenue: number;
  todayRevenue: number;
  todayInvoiceCount: number;
  totalInvoiceCount: number;
  voidedCount: number;
  cashRevenue: number;
  upiRevenue: number;
  cardRevenue: number;
  creditRevenue: number;
};

export function SalesWorkspace() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    totalRevenue: 0,
    todayRevenue: 0,
    todayInvoiceCount: 0,
    totalInvoiceCount: 0,
    voidedCount: 0,
    cashRevenue: 0,
    upiRevenue: 0,
    cardRevenue: 0,
    creditRevenue: 0,
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // Void modal state
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (paymentMethod !== "all") params.set("paymentMethod", paymentMethod);
      if (dateRange !== "all") params.set("dateRange", dateRange);

      const res = await fetch(`/api/sales?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load invoices");
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      setMetrics(data.metrics ?? metrics);
    } catch (err) {
      console.error(err);
      setError("Unable to retrieve sales register.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices();
  }, [status, paymentMethod, dateRange]);

  // View full details
  async function openDetails(invoiceId: string) {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/sales/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data.invoice);
      }
    } catch (err) {
      console.error("Failed to load invoice details:", err);
    } finally {
      setDetailsLoading(false);
    }
  }

  // Handle invoice voiding
  async function executeVoid() {
    if (!voidTarget || !voidReason.trim()) return;

    setVoiding(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/sales/${voidTarget.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to void invoice.");
        setVoiding(false);
        return;
      }

      setNotice(data.message || `Invoice ${voidTarget.invoiceNumber} has been voided.`);
      setVoidTarget(null);
      setVoidReason("");
      if (selectedInvoice && selectedInvoice.id === voidTarget.id) {
        setSelectedInvoice((prev) => (prev ? { ...prev, status: "VOIDED" } : null));
      }
      void loadInvoices();
    } catch (err) {
      console.error(err);
      setError("Network error while voiding invoice.");
    } finally {
      setVoiding(false);
    }
  }

  // Export filtered invoices to CSV
  function exportCSV() {
    if (invoices.length === 0) return;

    const headers = [
      "Invoice Number",
      "Date",
      "Status",
      "Payment Method",
      "Customer Name",
      "Customer Phone",
      "Items Count",
      "Subtotal (Taxable)",
      "Discount",
      "GST Tax",
      "Total Amount",
    ];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.createdAt.slice(0, 10),
      inv.status,
      inv.paymentMethod,
      inv.customer ? `"${inv.customer.name}"` : "Walk-in",
      inv.customer?.phone || "",
      inv.itemCount,
      inv.subtotal.toFixed(2),
      inv.discount.toFixed(2),
      inv.tax.toFixed(2),
      inv.total.toFixed(2),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sales-register-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <section className="module-page sales-page">
      {/* Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Counter</p>
          <h1>Sales Ledger & Register</h1>
          <p>Inspect counter transactions, customer bills, payment splits, and historical sales audit trails.</p>
        </div>
        <div className="pos-top-actions">
          <Link href="/billing" className="primary-button">
            + New Bill (POS)
          </Link>
          <span className="section-signal">Sales Audit</span>
        </div>
      </div>

      {notice && <p className="form-success pos-alert">{notice}</p>}
      {error && <p className="form-error pos-alert">{error}</p>}

      {/* Metrics Ribbon */}
      <div className="metric-grid sales-metric-grid">
        <article>
          <span>Today&apos;s Revenue</span>
          <strong>₹{metrics.todayRevenue.toFixed(2)}</strong>
          <small>{metrics.todayInvoiceCount} bills generated today</small>
        </article>
        <article>
          <span>Total Sales Revenue</span>
          <strong>₹{metrics.totalRevenue.toFixed(2)}</strong>
          <small>{metrics.totalInvoiceCount} active posted bills</small>
        </article>
        <article>
          <span>Cash Collections</span>
          <strong>₹{metrics.cashRevenue.toFixed(2)}</strong>
          <small>Tendered counter cash</small>
        </article>
        <article>
          <span>UPI / Digital</span>
          <strong>₹{(metrics.upiRevenue + metrics.cardRevenue).toFixed(2)}</strong>
          <small>Instant bank & card settle</small>
        </article>
      </div>

      {/* Filter Toolbar */}
      <div className="sales-toolbar work-panel">
        <div className="sales-search-wrap">
          <input
            type="text"
            placeholder="Search by invoice #, customer name, phone, or medicine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadInvoices()}
            className="sales-search-input"
          />
          <button type="button" className="secondary-button" onClick={loadInvoices}>
            Search
          </button>
        </div>

        <div className="sales-filters-row">
          <label>
            Date:
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="thisMonth">This Month</option>
            </select>
          </label>

          <label>
            Payment:
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="all">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CREDIT">Khata / Credit</option>
              <option value="CHEMIST">Chemist</option>
              <option value="OWN_USE">Own Use</option>
            </select>
          </label>

          <label>
            Status:
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="POSTED">Posted (Active)</option>
              <option value="VOIDED">Voided (Cancelled)</option>
            </select>
          </label>

          <div className="sales-toolbar-actions">
            <button type="button" className="secondary-button" onClick={exportCSV}>
              📥 Export CSV
            </button>
            <button type="button" className="secondary-button" onClick={loadInvoices}>
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Invoices Data Table */}
      <div className="work-panel sales-table-panel">
        <div className="table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Total (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      {loading ? "Loading sales invoices..." : "No sales invoices match your filters."}
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className={inv.status === "VOIDED" ? "row-voided" : ""}>
                    <td>
                      <strong>{inv.invoiceNumber}</strong>
                    </td>
                    <td>{new Date(inv.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>
                      {inv.customer ? (
                        <div>
                          <strong>{inv.customer.name}</strong>
                          <small className="block-meta">{inv.customer.phone}</small>
                        </div>
                      ) : (
                        <span className="text-muted">Walk-in Customer</span>
                      )}
                    </td>
                    <td>{inv.itemCount} units</td>
                    <td>
                      <span className="payment-pill">{inv.paymentMethod}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${inv.status === "POSTED" ? "active" : "danger"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      <strong>₹{inv.total.toFixed(2)}</strong>
                    </td>
                    <td>
                      <div className="sales-row-actions">
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => openDetails(inv.id)}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => setPrintInvoice(inv)}
                        >
                          Print
                        </button>
                        {inv.status === "POSTED" && (
                          <button
                            type="button"
                            className="action-btn danger-text"
                            onClick={() => {
                              setVoidTarget(inv);
                              setVoidReason("");
                            }}
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details Drawer / Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop">
          <div className="modal-card sales-details-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Invoice Inspection</span>
                <h2>{selectedInvoice.invoiceNumber}</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedInvoice(null)}
              >
                ✕
              </button>
            </div>

            <div className="details-summary-grid">
              <div>
                <span>Status:</span>
                <span className={`status-badge ${selectedInvoice.status === "POSTED" ? "active" : "danger"}`}>
                  {selectedInvoice.status}
                </span>
              </div>
              <div>
                <span>Date:</span>
                <strong>{new Date(selectedInvoice.createdAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>Customer:</span>
                <strong>{selectedInvoice.customer ? `${selectedInvoice.customer.name} (${selectedInvoice.customer.phone})` : "Walk-in"}</strong>
              </div>
              <div>
                <span>Payment Mode:</span>
                <strong>{selectedInvoice.paymentMethod}</strong>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="details-lines-wrap">
              <h3>Itemized Lines ({selectedInvoice.lines.length})</h3>
              <table className="inv-batch-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Batch #</th>
                    <th>Expiry</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Disc</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.medicineName}</strong>
                        {line.genericName && <small className="block-meta">{line.genericName}</small>}
                      </td>
                      <td>{line.batchNumber}</td>
                      <td>{line.expiryDate.slice(0, 7)}</td>
                      <td>{line.quantity}</td>
                      <td>₹{line.unitRate.toFixed(2)}</td>
                      <td>₹{line.discount.toFixed(2)}</td>
                      <td>₹{line.tax.toFixed(2)}</td>
                      <td>
                        <strong>₹{line.total.toFixed(2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="details-financials">
              <div>Taxable Subtotal: <strong>₹{selectedInvoice.subtotal.toFixed(2)}</strong></div>
              <div>Discounts: <strong>-₹{selectedInvoice.discount.toFixed(2)}</strong></div>
              <div>GST Tax: <strong>₹{selectedInvoice.tax.toFixed(2)}</strong></div>
              <div className="grand-val">Total Amount: <strong>₹{selectedInvoice.total.toFixed(2)}</strong></div>
            </div>

            {/* Audit Logs */}
            {selectedInvoice.auditLogs && selectedInvoice.auditLogs.length > 0 && (
              <div className="details-audit-section">
                <h4>Audit History</h4>
                <div className="audit-timeline">
                  {selectedInvoice.auditLogs.map((log) => (
                    <div key={log.id} className="audit-entry">
                      <span className="audit-time">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      <strong className="audit-action">{log.action}</strong>
                      {log.metadata && (
                        <span className="audit-meta">{JSON.stringify(log.metadata)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPrintInvoice(selectedInvoice);
                }}
              >
                🖨️ Print Receipt
              </button>
              {selectedInvoice.status === "POSTED" && (
                <button
                  type="button"
                  className="primary-button danger"
                  onClick={() => {
                    setVoidTarget(selectedInvoice);
                    setVoidReason("");
                  }}
                >
                  Void Invoice
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Void Invoice {voidTarget.invoiceNumber}?</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setVoidTarget(null)}
              >
                ✕
              </button>
            </div>

            <p className="void-warning-text">
              ⚠️ Voiding this invoice will mark it as <strong>VOIDED</strong>, restore all {voidTarget.lines.length} medicine items back into batch stock via compensating <code>CUSTOMER_RETURN</code> movements, and reverse customer Khata ledger if credit was issued.
            </p>

            <label className="void-reason-label">
              Cancellation / Void Reason *
              <textarea
                rows={3}
                placeholder="e.g. Prescribing error, customer returned immediately, duplicate entry..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                required
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={voiding}
                onClick={() => setVoidTarget(null)}
              >
                Keep Active
              </button>
              <button
                type="button"
                className="primary-button danger"
                disabled={voiding || voidReason.trim().length < 3}
                onClick={executeVoid}
              >
                {voiding ? "Voiding..." : "Confirm Void & Restore Stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprint Receipt Modal */}
      {printInvoice && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Reprint Receipt ({printInvoice.invoiceNumber})</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setPrintInvoice(null)}
              >
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>PILLBILLS PHARMACY</h3>
                <p>12 Market Road, Chandigarh · Ph: 9876543210</p>
                <p>GSTIN: 03AABCA0000A1Z5 · DL: PB-CH-2024-001</p>
                <div className="receipt-divider" />
                <div className="receipt-meta-row">
                  <span><strong>Bill No:</strong> {printInvoice.invoiceNumber}</span>
                  <span><strong>Date:</strong> {printInvoice.createdAt.slice(0, 10)}</span>
                </div>
                {printInvoice.customer && (
                  <div className="receipt-meta-row">
                    <span><strong>Customer:</strong> {printInvoice.customer.name}</span>
                    <span><strong>Phone:</strong> {printInvoice.customer.phone}</span>
                  </div>
                )}
                <div className="receipt-divider" />
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printInvoice.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.medicineName}</td>
                      <td>{l.batchNumber}</td>
                      <td>{l.quantity}</td>
                      <td>₹{l.unitRate.toFixed(2)}</td>
                      <td>₹{l.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Subtotal:</span>
                  <span>₹{printInvoice.subtotal.toFixed(2)}</span>
                </div>
                {printInvoice.discount > 0 && (
                  <div className="receipt-total-row">
                    <span>Discount:</span>
                    <span>-₹{printInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="receipt-total-row">
                  <span>GST:</span>
                  <span>₹{printInvoice.tax.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row receipt-grand">
                  <strong>NET AMOUNT:</strong>
                  <strong>₹{printInvoice.total.toFixed(2)}</strong>
                </div>
                <div className="receipt-total-row">
                  <span>Paid Via:</span>
                  <span>{printInvoice.paymentMethod}</span>
                </div>
              </div>

              <div className="receipt-divider" />
              <div className="receipt-footer">
                <p>Thank you for your visit! Get well soon.</p>
                <small>Duplicate / Re-printed copy</small>
              </div>
            </div>

            <div className="modal-actions print-hide">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPrintInvoice(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => window.print()}
              >
                🖨️ Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

