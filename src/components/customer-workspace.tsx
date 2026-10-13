"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  notes: string | null;
  balance: number;
  salesCount: number;
  createdAt: string;
};

type CustomerDetail = Customer & {
  totalSpent: number;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
  }>;
  receipts: Array<{
    id: string;
    amount: number;
    method: string;
    reference: string | null;
    createdAt: string;
    allocations: Array<{
      amount: number;
      invoiceNumber: string;
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

export function CustomerWorkspace() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "dues" | "zero">("all");
  const [sortBy, setSortBy] = useState<"name" | "balance" | "visits">("name");

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"overview" | "invoices" | "ledger">("overview");

  // Pay modal state from 360 view
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [payReference, setPayReference] = useState<string>("");
  const [paying, setPaying] = useState(false);

  // Form states
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newGstin, setNewGstin] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCustomers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search.trim())}`);
      if (!res.ok) throw new Error("Failed to load customers");
      const data = await res.json();
      setCustomers(data.customers ?? []);
    } catch (err) {
      console.error(err);
      setError("Unable to load customer directory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers();
  }, [search]);

  async function openCustomerDetail(customerId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailCustomer(data.customer);
      }
    } catch (err) {
      console.error("Failed to load customer details:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          gstin: newGstin.trim() || undefined,
          notes: newNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to register customer.");
        setSubmitting(false);
        return;
      }

      setNotice(`Customer ${data.customer.name} registered successfully.`);
      setAddModalOpen(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewGstin("");
      setNewNotes("");
      void loadCustomers();
    } catch (err) {
      console.error(err);
      setError("Network error while creating customer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateCustomerProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomer) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/customers/${editCustomer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCustomer.name.trim(),
          phone: editCustomer.phone.trim(),
          email: editCustomer.email?.trim() || undefined,
          gstin: editCustomer.gstin?.trim() || undefined,
          notes: editCustomer.notes?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update profile.");
        setSubmitting(false);
        return;
      }

      setNotice(`Profile updated for ${data.customer.name}.`);
      setEditCustomer(null);
      void loadCustomers();
      if (detailCustomer && detailCustomer.id === editCustomer.id) {
        void openCustomerDetail(editCustomer.id);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while updating customer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payTarget || !payAmount) return;

    setPaying(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/khata/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: payTarget.id,
          amount: Number(payAmount),
          method: payMethod,
          reference: payReference.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record payment.");
        setPaying(false);
        return;
      }

      setNotice(`Payment of ₹${data.receipt.amount} recorded for ${data.receipt.customerName}.`);
      setPayTarget(null);
      setPayAmount("");
      setPayReference("");
      void loadCustomers();
      if (detailCustomer && detailCustomer.id === payTarget.id) {
        void openCustomerDetail(payTarget.id);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while recording payment.");
    } finally {
      setPaying(false);
    }
  }

  // Filter & Sort
  const filtered = customers.filter((c) => {
    if (viewFilter === "dues") return c.balance > 0;
    if (viewFilter === "zero") return c.balance === 0;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === "balance") return b.balance - a.balance;
    if (sortBy === "visits") return b.salesCount - a.salesCount;
    return a.name.localeCompare(b.name);
  });

  const totalDues = Math.round(customers.reduce((sum, c) => sum + c.balance, 0) * 100) / 100;
  const customersWithDues = customers.filter((c) => c.balance > 0).length;

  return (
    <section className="module-page customer-page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Customers</p>
          <h1>Customer Registry & Directory</h1>
          <p>Maintain patient profiles, track visit histories, manage contact details, and inspect account statements.</p>
        </div>
        <div className="pos-top-actions">
          <Link href="/khata" className="secondary-button">
            View Khata Credit Book
          </Link>
          <button type="button" className="primary-button" onClick={() => setAddModalOpen(true)}>
            + Add Customer
          </button>
        </div>
      </div>

      {notice && <p className="form-success pos-alert">{notice}</p>}
      {error && <p className="form-error pos-alert">{error}</p>}

      {/* Metrics Ribbon */}
      <div className="metric-grid">
        <article>
          <span>Total Registered</span>
          <strong>{customers.length}</strong>
          <small>Patients & clients in store</small>
        </article>
        <article>
          <span>Active with Dues</span>
          <strong>{customersWithDues}</strong>
          <small>Accounts with Khata balance</small>
        </article>
        <article>
          <span>Total Outstanding</span>
          <strong>₹{totalDues.toFixed(2)}</strong>
          <small>Receivables owed by customers</small>
        </article>
        <article>
          <span>Quick Actions</span>
          <strong style={{ fontSize: "1.2rem", marginTop: "18px" }}>
            <Link href="/billing" className="text-button" style={{ fontSize: "1rem" }}>
              Start POS Bill →
            </Link>
          </strong>
          <small>Direct counter dispensing</small>
        </article>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="sales-toolbar work-panel" style={{ marginTop: "20px" }}>
        <div className="sales-search-wrap">
          <input
            type="text"
            placeholder="Search by customer name or phone number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sales-search-input"
          />
        </div>

        <div className="sales-filters-row">
          <label>
            View:
            <select value={viewFilter} onChange={(e) => setViewFilter(e.target.value as "all" | "dues" | "zero")}>
              <option value="all">All Customers ({customers.length})</option>
              <option value="dues">With Outstanding Dues ({customersWithDues})</option>
              <option value="zero">Settled / Zero Balance</option>
            </select>
          </label>

          <label>
            Sort by:
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "balance" | "visits")}>
              <option value="name">Name (A-Z)</option>
              <option value="balance">Khata Balance (Highest first)</option>
              <option value="visits">Total Visits / Orders</option>
            </select>
          </label>

          <div className="sales-toolbar-actions">
            <button type="button" className="secondary-button" onClick={loadCustomers}>
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="work-panel sales-table-panel">
        <div className="table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Email / GSTIN</th>
                <th>Visits</th>
                <th>Khata Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      {loading ? "Loading customer profiles..." : "No customers found."}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.notes && <small className="block-meta">{c.notes}</small>}
                    </td>
                    <td>{c.phone}</td>
                    <td>
                      <div>{c.email || <span className="text-muted">No email</span>}</div>
                      {c.gstin && <small className="block-meta">GST: {c.gstin}</small>}
                    </td>
                    <td>
                      <strong>{c.salesCount}</strong> orders
                    </td>
                    <td>
                      {c.balance > 0 ? (
                        <span className="tag-near">Due: ₹{c.balance.toFixed(2)}</span>
                      ) : (
                        <span className="status-badge active">Settled</span>
                      )}
                    </td>
                    <td>
                      <div className="sales-row-actions">
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => openCustomerDetail(c.id)}
                        >
                          View 360°
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => setEditCustomer(c)}
                        >
                          Edit
                        </button>
                        {c.balance > 0 && (
                          <button
                            type="button"
                            className="action-btn"
                            style={{ color: "var(--accent)" }}
                            onClick={() => {
                              setPayTarget(c);
                              setPayAmount(String(c.balance));
                            }}
                          >
                            Receive ₹
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

      {/* Add Customer Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Register New Customer</h2>
              <button type="button" className="close-btn" onClick={() => setAddModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={createCustomer} className="modal-form">
              <label>
                Full Name *
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikas Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="customer-input"
                />
              </label>

              <label>
                Phone Number * (Min 7 digits)
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9812345678"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="customer-input"
                />
              </label>

              <label>
                Email Address (Optional)
                <input
                  type="email"
                  placeholder="e.g. vikas@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="customer-input"
                />
              </label>

              <label>
                GSTIN (Optional)
                <input
                  type="text"
                  placeholder="e.g. 03AAAAA0000A1Z5"
                  value={newGstin}
                  onChange={(e) => setNewGstin(e.target.value)}
                  className="customer-input"
                />
              </label>

              <label>
                Address / Patient Notes (Optional)
                <textarea
                  rows={2}
                  placeholder="e.g. Chronic blood pressure patient, referred by Dr. Verma"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="customer-input"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={submitting}
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Edit Customer Profile</h2>
              <button type="button" className="close-btn" onClick={() => setEditCustomer(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={updateCustomerProfile} className="modal-form">
              <label>
                Full Name *
                <input
                  type="text"
                  required
                  value={editCustomer.name}
                  onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })}
                  className="customer-input"
                />
              </label>

              <label>
                Phone Number *
                <input
                  type="tel"
                  required
                  value={editCustomer.phone}
                  onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })}
                  className="customer-input"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={editCustomer.email || ""}
                  onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })}
                  className="customer-input"
                />
              </label>

              <label>
                GSTIN
                <input
                  type="text"
                  value={editCustomer.gstin || ""}
                  onChange={(e) => setEditCustomer({ ...editCustomer, gstin: e.target.value })}
                  className="customer-input"
                />
              </label>

              <label>
                Address / Notes
                <textarea
                  rows={2}
                  value={editCustomer.notes || ""}
                  onChange={(e) => setEditCustomer({ ...editCustomer, notes: e.target.value })}
                  className="customer-input"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={submitting}
                  onClick={() => setEditCustomer(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "Updating..." : "Update Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer 360 Details Drawer */}
      {detailCustomer && (
        <div className="modal-backdrop">
          <div className="modal-card sales-details-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">Customer 360° Profile</span>
                <h2>{detailCustomer.name}</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setDetailCustomer(null)}>
                ✕
              </button>
            </div>

            {/* Quick Profile Band */}
            <div className="details-summary-grid">
              <div>
                <span>Phone:</span>
                <strong>{detailCustomer.phone}</strong>
              </div>
              <div>
                <span>Total Orders:</span>
                <strong>{detailCustomer.salesCount} visits</strong>
              </div>
              <div>
                <span>Lifetime Purchases:</span>
                <strong>₹{detailCustomer.totalSpent.toFixed(2)}</strong>
              </div>
              <div>
                <span>Khata Balance:</span>
                <strong style={{ color: detailCustomer.balance > 0 ? "#b45309" : "var(--accent)" }}>
                  {detailCustomer.balance > 0 ? `₹${detailCustomer.balance.toFixed(2)}` : "No Dues"}
                </strong>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="tab-row" style={{ margin: "14px 0" }}>
              <button
                type="button"
                className={`tab ${detailTab === "overview" ? "active" : ""}`}
                onClick={() => setDetailTab("overview")}
              >
                Overview & Contact
              </button>
              <button
                type="button"
                className={`tab ${detailTab === "invoices" ? "active" : ""}`}
                onClick={() => setDetailTab("invoices")}
              >
                Invoices History ({detailCustomer.sales.length})
              </button>
              <button
                type="button"
                className={`tab ${detailTab === "ledger" ? "active" : ""}`}
                onClick={() => setDetailTab("ledger")}
              >
                Ledger Statement ({detailCustomer.statement.length})
              </button>
            </div>

            {detailTab === "overview" && (
              <div className="customer-overview-box">
                <div className="form-grid">
                  <div><strong>Email:</strong> {detailCustomer.email || "None listed"}</div>
                  <div><strong>GSTIN:</strong> {detailCustomer.gstin || "Unregistered consumer"}</div>
                  <div><strong>Joined Store:</strong> {new Date(detailCustomer.createdAt).toLocaleDateString()}</div>
                  <div><strong>Notes:</strong> {detailCustomer.notes || "None"}</div>
                </div>
              </div>
            )}

            {detailTab === "invoices" && (
              <div className="details-lines-wrap">
                <table className="inv-batch-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Payment Mode</th>
                      <th>Status</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailCustomer.sales.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No past invoices found.</td></tr>
                    ) : (
                      detailCustomer.sales.map((sale) => (
                        <tr key={sale.id}>
                          <td><strong>{sale.invoiceNumber}</strong></td>
                          <td>{new Date(sale.createdAt).toLocaleDateString()}</td>
                          <td><span className="payment-pill">{sale.paymentMethod}</span></td>
                          <td><span className={`status-badge ${sale.status === "POSTED" ? "active" : "danger"}`}>{sale.status}</span></td>
                          <td><strong>₹{sale.total.toFixed(2)}</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === "ledger" && (
              <div className="details-lines-wrap">
                <table className="inv-batch-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit (+)</th>
                      <th>Credit (-)</th>
                      <th>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailCustomer.statement.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No ledger entries recorded.</td></tr>
                    ) : (
                      detailCustomer.statement.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.createdAt).toLocaleDateString()}</td>
                          <td>{entry.description}</td>
                          <td>{entry.side === "DEBIT" ? `₹${entry.amount.toFixed(2)}` : "-"}</td>
                          <td>{entry.side === "CREDIT" ? `₹${entry.amount.toFixed(2)}` : "-"}</td>
                          <td><strong>₹{entry.runningBalance.toFixed(2)}</strong></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDetailCustomer(null)}
              >
                Close
              </button>
              {detailCustomer.balance > 0 && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setPayTarget(detailCustomer);
                    setPayAmount(String(detailCustomer.balance));
                  }}
                >
                  Collect Payment (₹{detailCustomer.balance.toFixed(2)})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Collect Payment Modal */}
      {payTarget && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Receive Payment from {payTarget.name}</h2>
              <button type="button" className="close-btn" onClick={() => setPayTarget(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickPay} className="modal-form">
              <div className="credit-alert-box">
                Current Khata Balance: <strong>₹{payTarget.balance.toFixed(2)}</strong>
              </div>

              <label>
                Payment Amount (₹) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="customer-input"
                />
              </label>

              <label>
                Payment Method
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="customer-input"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / Digital</option>
                  <option value="CARD">Card</option>
                  <option value="CHEMIST">Bank Transfer</option>
                </select>
              </label>

              <label>
                Transaction / UTR Reference (Optional)
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Cheque No"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="customer-input"
                />
              </label>

              <p className="block-meta">
                Payment will be automatically allocated FIFO against the oldest outstanding invoices for this patient.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={paying}
                  onClick={() => setPayTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={paying}>
                  {paying ? "Recording..." : `Record Receipt (₹${Number(payAmount || 0).toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

