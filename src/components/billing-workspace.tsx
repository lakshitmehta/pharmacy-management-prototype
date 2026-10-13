"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PaymentMethodType } from "@/domain/sales";

type BatchOption = {
  id: string;
  batchNumber: string;
  expiryDate: string;
  purchaseRate: number;
  mrp: number;
  stock: number;
  expiryStatus: "EXPIRED" | "NEAR_EXPIRY" | "HEALTHY";
  isExpired: boolean;
};

type MedicineOption = {
  id: string;
  name: string;
  genericName: string | null;
  barcode: string | null;
  hsn: string | null;
  gstRate: number;
  safetyLimit: number;
  totalStock: number;
  batches: BatchOption[];
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  balance: number;
};

type CartLine = {
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  barcode: string | null;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  expiryStatus: "EXPIRED" | "NEAR_EXPIRY" | "HEALTHY";
  stockAvailable: number;
  quantity: number;
  unitRate: number;
  mrp: number;
  discountPercent: number;
  taxPercent: number;
};

type CompletedInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: string;
  customer: { name: string; phone: string } | null;
  lines: Array<{
    medicineName: string;
    genericName: string | null;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    unitRate: number;
    mrp: number;
    discount: number;
    tax: number;
    total: number;
  }>;
  payments: Array<{
    method: string;
    amount: number;
    reference: string | null;
  }>;
};

export function BillingWorkspace() {
  // Customer state
  const [customerMode, setCustomerMode] = useState<"walkin" | "select" | "new">("walkin");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [doctorName, setDoctorName] = useState("");

  // Medicine search & cart state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MedicineOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Settlement state
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("CASH");
  const [tenderedAmount, setTenderedAmount] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Completed invoice / Receipt modal
  const [completedInvoice, setCompletedInvoice] = useState<CompletedInvoice | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<"58mm" | "80mm" | "standard">("80mm");
  const [isOnline, setIsOnline] = useState(true);

  // Connectivity monitoring
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  // Restore draft from sessionStorage on initial mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("pillbills_pos_draft");
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft.cart && draft.cart.length > 0) {
            setCart(draft.cart);
            if (draft.customerMode) setCustomerMode(draft.customerMode);
            if (draft.selectedCustomer) setSelectedCustomer(draft.selectedCustomer);
            if (draft.newCustomerName) setNewCustomerName(draft.newCustomerName);
            if (draft.newCustomerPhone) setNewCustomerPhone(draft.newCustomerPhone);
            if (draft.doctorName) setDoctorName(draft.doctorName);
            if (draft.billDiscountPercent) setBillDiscountPercent(draft.billDiscountPercent);
            if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
            setSuccessNotice("Restored active bill draft from local session storage.");
          }
        } catch {
          // ignore corrupted draft
        }
      }
    }
  }, []);

  // Persist draft to sessionStorage when cart or details change
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cart.length > 0) {
      window.sessionStorage.setItem(
        "pillbills_pos_draft",
        JSON.stringify({
          cart,
          customerMode,
          selectedCustomer,
          newCustomerName,
          newCustomerPhone,
          doctorName,
          billDiscountPercent,
          paymentMethod,
        })
      );
    } else {
      window.sessionStorage.removeItem("pillbills_pos_draft");
    }
  }, [cart, customerMode, selectedCustomer, newCustomerName, newCustomerPhone, doctorName, billDiscountPercent, paymentMethod]);

  function clearCartDraft() {
    setCart([]);
    setSelectedCustomer(null);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setDoctorName("");
    setBillDiscountPercent(0);
    setTenderedAmount("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("pillbills_pos_draft");
    }
    setSuccessNotice("Billing cart cleared.");
  }

  // Search medicines with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/medicines/search-for-sale?search=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.medicines ?? []);
        }
      } catch (err) {
        console.error("Medicine search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Search customers with debounce
  useEffect(() => {
    if (customerMode !== "select" || !customerSearch.trim()) {
      setCustomerResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(customerSearch)}`);
        if (res.ok) {
          const data = await res.json();
          setCustomerResults(data.customers ?? []);
        }
      } catch (err) {
        console.error("Customer search failed:", err);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [customerSearch, customerMode]);

  // Add medicine batch to cart
  function addBatchToCart(medicine: MedicineOption, batch: BatchOption) {
    if (batch.isExpired) {
      setError(`Cannot add expired batch ${batch.batchNumber} to bill.`);
      return;
    }

    if (batch.stock <= 0) {
      setError(`Batch ${batch.batchNumber} has no stock remaining.`);
      return;
    }

    setError(null);

    // Check if already in cart
    const existingIndex = cart.findIndex((l) => l.batchId === batch.id);
    if (existingIndex >= 0) {
      const current = cart[existingIndex];
      if (current.quantity >= batch.stock) {
        setError(`Cannot exceed available stock of ${batch.stock} packs for batch ${batch.batchNumber}.`);
        return;
      }
      setCart((prev) =>
        prev.map((line, idx) =>
          idx === existingIndex ? { ...line, quantity: line.quantity + 1 } : line
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          medicineId: medicine.id,
          medicineName: medicine.name,
          genericName: medicine.genericName,
          barcode: medicine.barcode,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          expiryStatus: batch.expiryStatus,
          stockAvailable: batch.stock,
          quantity: 1,
          unitRate: batch.mrp,
          mrp: batch.mrp,
          discountPercent: 0,
          taxPercent: medicine.gstRate,
        },
      ]);
    }

    setSearchQuery("");
    setSearchResults([]);
  }

  // Update line details
  function updateLine(index: number, patch: Partial<CartLine>) {
    setCart((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        if (updated.quantity > line.stockAvailable) {
          setError(`Warning: Quantity exceeds batch stock (${line.stockAvailable}).`);
        } else {
          setError(null);
        }
        return updated;
      })
    );
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function clearCart() {
    setCart([]);
    setBillDiscountPercent(0);
    setTenderedAmount("");
    setPaymentReference("");
    setError(null);
    setSuccessNotice(null);
  }

  // Compute live calculations
  const lineCalculations = cart.map((line) => {
    const gross = Math.round((line.quantity * line.unitRate + Number.EPSILON) * 100) / 100;
    const discount = Math.round((gross * (line.discountPercent / 100) + Number.EPSILON) * 100) / 100;
    const taxable = Math.round((gross - discount + Number.EPSILON) * 100) / 100;
    const tax = Math.round((taxable * (line.taxPercent / 100) + Number.EPSILON) * 100) / 100;
    const total = Math.round((taxable + tax + Number.EPSILON) * 100) / 100;
    return { gross, discount, taxable, tax, total };
  });

  const rawSubtotal = Math.round(lineCalculations.reduce((sum, l) => sum + l.taxable, 0) * 100) / 100;
  const totalLineDiscounts = Math.round(lineCalculations.reduce((sum, l) => sum + l.discount, 0) * 100) / 100;

  const validBillDiscount = Math.min(100, Math.max(0, billDiscountPercent));
  const discountFactor = 1 - validBillDiscount / 100;

  const netTaxable = Math.round((rawSubtotal * discountFactor + Number.EPSILON) * 100) / 100;
  const billDiscountAmount = Math.round((rawSubtotal - netTaxable + Number.EPSILON) * 100) / 100;
  const netTax = Math.round(
    lineCalculations.reduce((sum, l) => sum + l.tax * discountFactor, 0) * 100
  ) / 100;

  const grandTotal = Math.round((netTaxable + netTax + Number.EPSILON) * 100) / 100;

  const tenderedNum = Number(tenderedAmount) || 0;
  const changeDue = paymentMethod === "CASH" && tenderedNum > grandTotal ? Math.round((tenderedNum - grandTotal + Number.EPSILON) * 100) / 100 : 0;

  // Submit sale invoice
  async function completeSale() {
    if (cart.length === 0) {
      setError("Please add at least one medicine item to the bill.");
      return;
    }

    if (paymentMethod === "CREDIT" && customerMode === "walkin" && !selectedCustomer && !newCustomerPhone) {
      setError("A registered customer or customer phone number is required for Khata / Credit sales.");
      return;
    }

    if (customerMode === "new" && (!newCustomerName.trim() || !newCustomerPhone.trim())) {
      setError("Please enter customer name and phone number.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessNotice(null);

    const payload = {
      customerId: selectedCustomer?.id || undefined,
      newCustomer:
        customerMode === "new"
          ? {
              name: newCustomerName.trim(),
              phone: newCustomerPhone.trim(),
              notes: newCustomerNotes.trim() || undefined,
            }
          : undefined,
      doctorName: doctorName.trim() || undefined,
      paymentMethod,
      tenderedAmount: paymentMethod === "CASH" ? tenderedNum : undefined,
      paymentReference: paymentReference.trim() || undefined,
      billDiscountPercent: validBillDiscount,
      lines: cart.map((l) => ({
        medicineId: l.medicineId,
        batchId: l.batchId,
        quantity: l.quantity,
        unitRate: l.unitRate,
        discountPercent: l.discountPercent,
        taxPercent: l.taxPercent,
      })),
    };

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to complete sale.");
        setBusy(false);
        return;
      }

      setCompletedInvoice(data.invoice);
      setSuccessNotice(`Invoice ${data.invoice.invoiceNumber} completed successfully.`);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("pillbills_pos_draft");
      }
      // Clear cart
      setCart([]);
      setBillDiscountPercent(0);
      setTenderedAmount("");
      setPaymentReference("");
      setDoctorName("");
      if (customerMode === "new") {
        setCustomerMode("walkin");
        setNewCustomerName("");
        setNewCustomerPhone("");
        setNewCustomerNotes("");
      }
    } catch (err: unknown) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline) {
        setError("Network error: You are currently offline. Your cart and customer details are preserved locally in this browser. Please reconnect to the network and retry.");
      } else {
        const msg = err instanceof Error ? err.message : "Connection failed";
        setError(`Network failure: ${msg}. Your billing draft is safely preserved in this browser. Please check connection and retry.`);
      }
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-page pos-workspace">
      {/* Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Counter</p>
          <h1>Billing & Point of Sale</h1>
          <p>Real-time batch-aware counter dispensing, GST computation, and instant invoice printing.</p>
        </div>
        <div className="pos-top-actions" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "14px",
              fontSize: "0.78rem",
              fontWeight: "bold",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: isOnline ? "#ecfdf5" : "#fffbeb",
              color: isOnline ? "#065f46" : "#92400e",
              border: `1px solid ${isOnline ? "#a7f3d0" : "#fde68a"}`,
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isOnline ? "#10b981" : "#f59e0b" }} />
            {isOnline ? "Online" : "Offline · Draft Preserved Locally"}
          </span>
          {cart.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={clearCartDraft}
              style={{ fontSize: "0.78rem", color: "var(--muted)" }}
            >
              Clear Cart ({cart.length})
            </button>
          )}
          <Link href="/sales" className="secondary-button">
            View Sales History
          </Link>
          <span className="section-signal">Fast POS Ready</span>
        </div>
      </div>

      {!isOnline && (
        <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: "6px", marginBottom: "16px", fontSize: "0.85rem" }}>
          ⚠️ <strong>Offline Mode:</strong> Internet/server connectivity is currently unavailable. Your active cart and entered customer details are preserved in browser session storage. Live stock queries and bill finalization require network connectivity.
        </div>
      )}

      {error && <p className="form-error pos-alert">{error}</p>}
      {successNotice && <p className="form-success pos-alert">{successNotice}</p>}

      <div className="pos-layout">
        {/* Left Column: Medicine Search & Cart Lines */}
        <div className="pos-main">
          {/* Medicine Search Bar */}
          <div className="pos-search-box work-panel">
            <div className="search-input-wrapper">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Type medicine name, generic name, batch, or scan barcode..."
                className="pos-search-input"
                autoFocus
              />
              {searching && <span className="search-spinner">Searching...</span>}
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Live Search Dropdown */}
            {searchResults.length > 0 && (
              <div className="pos-search-dropdown">
                {searchResults.map((med) => (
                  <div key={med.id} className="pos-search-item">
                    <div className="med-info">
                      <strong>{med.name}</strong>
                      {med.genericName && <span className="med-generic">({med.genericName})</span>}
                      <span className="med-meta">
                        GST: {med.gstRate}% | Total Stock: {med.totalStock} packs
                      </span>
                    </div>
                    <div className="batch-options-list">
                      {med.batches.map((batch) => (
                        <button
                          key={batch.id}
                          type="button"
                          className={`batch-select-btn ${batch.isExpired ? "batch-expired" : ""}`}
                          onClick={() => addBatchToCart(med, batch)}
                          disabled={batch.isExpired || batch.stock <= 0}
                        >
                          <span className="batch-code">{batch.batchNumber}</span>
                          <span className="batch-exp">Exp: {batch.expiryDate.slice(0, 7)}</span>
                          <span className="batch-stock">Stock: {batch.stock}</span>
                          <span className="batch-mrp">₹{batch.mrp.toFixed(2)}</span>
                          {batch.expiryStatus === "NEAR_EXPIRY" && (
                            <span className="tag-near">Near Expiry</span>
                          )}
                          {batch.isExpired && <span className="tag-expired">Expired</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Table */}
          <div className="work-panel pos-cart-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Active Prescription / Bill</p>
                <h2>Items on Counter ({cart.length})</h2>
              </div>
              {cart.length > 0 && (
                <button type="button" className="text-button danger" onClick={clearCart}>
                  Discard All
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="empty-state pos-empty">
                <p>🛒 Counter bill is empty.</p>
                <small>Search for a medicine or scan barcode above to add items to this sale.</small>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="pos-cart-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Medicine / Batch</th>
                      <th>Qty</th>
                      <th>MRP (₹)</th>
                      <th>Rate (₹)</th>
                      <th>Disc %</th>
                      <th>GST %</th>
                      <th>Total (₹)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((line, idx) => {
                      const calc = lineCalculations[idx];
                      const isLowStock = line.quantity >= line.stockAvailable;
                      return (
                        <tr key={line.batchId}>
                          <td>{idx + 1}</td>
                          <td>
                            <strong>{line.medicineName}</strong>
                            <div className="cart-batch-meta">
                              <span>Batch: {line.batchNumber}</span>
                              <span className="dot-sep">·</span>
                              <span>Exp: {line.expiryDate.slice(0, 7)}</span>
                              <span className="dot-sep">·</span>
                              <span className={isLowStock ? "text-danger" : ""}>
                                Avail: {line.stockAvailable}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="qty-control">
                              <button
                                type="button"
                                className="qty-btn"
                                onClick={() =>
                                  updateLine(idx, { quantity: Math.max(1, line.quantity - 1) })
                                }
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={line.stockAvailable}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="qty-input"
                              />
                              <button
                                type="button"
                                className="qty-btn"
                                onClick={() =>
                                  updateLine(idx, {
                                    quantity: Math.min(line.stockAvailable, line.quantity + 1),
                                  })
                                }
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>₹{line.mrp.toFixed(2)}</td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unitRate}
                              onChange={(e) =>
                                updateLine(idx, { unitRate: Math.max(0, Number(e.target.value) || 0) })
                              }
                              className="pos-cell-input"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={line.discountPercent}
                              onChange={(e) =>
                                updateLine(idx, {
                                  discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                })
                              }
                              className="pos-cell-input small"
                            />
                          </td>
                          <td>{line.taxPercent}%</td>
                          <td>
                            <strong>₹{calc.total.toFixed(2)}</strong>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="remove-line-btn"
                              onClick={() => removeLine(idx)}
                              title="Remove line"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer & Settlement Sidebar */}
        <div className="pos-sidebar">
          {/* Customer Selection Card */}
          <div className="work-panel customer-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Patient / Customer</p>
                <h2>Customer Details</h2>
              </div>
            </div>

            <div className="customer-mode-toggles">
              <button
                type="button"
                className={`mode-btn ${customerMode === "walkin" ? "active" : ""}`}
                onClick={() => {
                  setCustomerMode("walkin");
                  setSelectedCustomer(null);
                }}
              >
                Walk-in
              </button>
              <button
                type="button"
                className={`mode-btn ${customerMode === "select" ? "active" : ""}`}
                onClick={() => setCustomerMode("select")}
              >
                Search Existing
              </button>
              <button
                type="button"
                className={`mode-btn ${customerMode === "new" ? "active" : ""}`}
                onClick={() => {
                  setCustomerMode("new");
                  setSelectedCustomer(null);
                }}
              >
                + New
              </button>
            </div>

            {customerMode === "select" && (
              <div className="customer-search-area">
                <input
                  type="text"
                  placeholder="Search customer name or phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="customer-input"
                />
                {customerResults.length > 0 && (
                  <div className="customer-dropdown">
                    {customerResults.map((cust) => (
                      <div
                        key={cust.id}
                        className="customer-dropdown-item"
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearch(cust.name);
                          setCustomerResults([]);
                        }}
                      >
                        <strong>{cust.name}</strong>
                        <span>{cust.phone}</span>
                        {cust.balance > 0 && (
                          <span className="tag-near">Khata: ₹{cust.balance.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectedCustomer && (
                  <div className="selected-customer-pill">
                    <div>
                      <strong>{selectedCustomer.name}</strong> ({selectedCustomer.phone})
                    </div>
                    {selectedCustomer.balance > 0 ? (
                      <span className="khata-badge">Udhaar: ₹{selectedCustomer.balance.toFixed(2)}</span>
                    ) : (
                      <span className="status-badge active">No Dues</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {customerMode === "new" && (
              <div className="new-customer-form">
                <input
                  type="text"
                  placeholder="Full Name *"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="customer-input"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone Number *"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="customer-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Notes / Address (Optional)"
                  value={newCustomerNotes}
                  onChange={(e) => setNewCustomerNotes(e.target.value)}
                  className="customer-input"
                />
              </div>
            )}

            <div className="doctor-field">
              <label>Doctor / Prescriber (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Dr. A. K. Verma"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="customer-input"
              />
            </div>
          </div>

          {/* Settlement / Payment Card */}
          <div className="work-panel settlement-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Payment & Settlement</p>
                <h2>Total & Tender</h2>
              </div>
            </div>

            {/* Bill Discount Input */}
            <div className="discount-row">
              <label>Bill Discount %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={billDiscountPercent}
                onChange={(e) =>
                  setBillDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                }
                className="pos-cell-input discount-input"
              />
            </div>

            {/* Financial Summary */}
            <div className="pos-totals-box">
              <div className="total-line">
                <span>Taxable Subtotal:</span>
                <strong>₹{rawSubtotal.toFixed(2)}</strong>
              </div>
              {totalLineDiscounts > 0 && (
                <div className="total-line text-muted">
                  <span>Line Discounts:</span>
                  <span>-₹{totalLineDiscounts.toFixed(2)}</span>
                </div>
              )}
              {billDiscountAmount > 0 && (
                <div className="total-line text-muted">
                  <span>Bill Discount ({validBillDiscount}%):</span>
                  <span>-₹{billDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="total-line">
                <span>GST Total:</span>
                <strong>₹{netTax.toFixed(2)}</strong>
              </div>
              <div className="grand-total-row">
                <span>Grand Total:</span>
                <strong className="grand-total-amount">₹{grandTotal.toFixed(2)}</strong>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="payment-methods-grid">
              {(["CASH", "UPI", "CARD", "CREDIT", "CHEMIST", "OWN_USE"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`payment-method-btn ${paymentMethod === method ? "active" : ""}`}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method === "CREDIT" ? "Khata / Credit" : method}
                </button>
              ))}
            </div>

            {/* Method Specific Inputs */}
            {paymentMethod === "CASH" && (
              <div className="cash-tender-area">
                <label>Cash Tendered (₹)</label>
                <div className="tender-input-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={`e.g. ${Math.ceil(grandTotal)}`}
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    className="tender-input"
                  />
                  <div className="quick-denom-buttons">
                    <button
                      type="button"
                      onClick={() => setTenderedAmount(String(Math.ceil(grandTotal)))}
                    >
                      Exact
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTenderedAmount(String(Math.ceil(grandTotal / 100) * 100 || 100))
                      }
                    >
                      Round
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTenderedAmount(String(Math.ceil(grandTotal / 500) * 500 || 500))
                      }
                    >
                      ₹500
                    </button>
                  </div>
                </div>
                {changeDue > 0 && (
                  <div className="change-due-box">
                    <span>Change to Return:</span>
                    <strong>₹{changeDue.toFixed(2)}</strong>
                  </div>
                )}
              </div>
            )}

            {(paymentMethod === "UPI" || paymentMethod === "CARD") && (
              <div className="reference-input-area">
                <label>{paymentMethod} Reference / UTR / Approval Code</label>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Auth ID"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="customer-input"
                />
              </div>
            )}

            {paymentMethod === "CREDIT" && (
              <div className="credit-alert-box">
                <p>⚠️ Amount ₹{grandTotal.toFixed(2)} will be debited to customer Khata ledger.</p>
                {!selectedCustomer && !newCustomerPhone && (
                  <small className="text-danger">Please select or register a customer with phone number.</small>
                )}
              </div>
            )}

            {/* Complete Sale Action */}
            <button
              type="button"
              className="primary-button complete-sale-btn"
              disabled={busy || cart.length === 0}
              onClick={completeSale}
            >
              {busy ? "Processing Sale..." : `Complete Sale & Print (₹${grandTotal.toFixed(2)})`}
            </button>
          </div>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      {completedInvoice && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <div>
                <h2>Invoice {completedInvoice.invoiceNumber} Generated</h2>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                  Thermal Print Ready · 58mm / 80mm ESC/POS
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: "bold" }}>Format:</label>
                <select
                  value={receiptWidth}
                  onChange={(e) => setReceiptWidth(e.target.value as "58mm" | "80mm" | "standard")}
                  style={{ fontSize: "0.8rem", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--line)", background: "var(--paper)" }}
                >
                  <option value="58mm">58mm Thermal (Compact)</option>
                  <option value="80mm">80mm Thermal (Standard)</option>
                  <option value="standard">A4 / Full Sheet</option>
                </select>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setCompletedInvoice(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Clean Receipt Layout */}
            <div
              className={`receipt-paper ${receiptWidth === "58mm" ? "thermal-58mm" : receiptWidth === "80mm" ? "thermal-80mm" : "standard-a4"}`}
              id="printable-receipt"
            >
              <div className="receipt-header">
                <h3>PILLBILLS PHARMACY</h3>
                <p>12 Market Road, Chandigarh · Ph: 9876543210</p>
                <p>GSTIN: 03AABCA0000A1Z5 · DL: PB-CH-2024-001</p>
                <div className="receipt-divider" />
                <div className="receipt-meta-row">
                  <span><strong>Bill No:</strong> {completedInvoice.invoiceNumber}</span>
                  <span><strong>Date:</strong> {completedInvoice.createdAt.slice(0, 10)}</span>
                </div>
                {completedInvoice.customer && (
                  <div className="receipt-meta-row">
                    <span><strong>Customer:</strong> {completedInvoice.customer.name}</span>
                    <span><strong>Phone:</strong> {completedInvoice.customer.phone}</span>
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
                  {completedInvoice.lines.map((l, i) => (
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
                  <span>₹{completedInvoice.subtotal.toFixed(2)}</span>
                </div>
                {completedInvoice.discount > 0 && (
                  <div className="receipt-total-row">
                    <span>Discount:</span>
                    <span>-₹{completedInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="receipt-total-row">
                  <span>GST:</span>
                  <span>₹{completedInvoice.tax.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row receipt-grand">
                  <strong>NET AMOUNT:</strong>
                  <strong>₹{completedInvoice.total.toFixed(2)}</strong>
                </div>
                <div className="receipt-total-row">
                  <span>Paid Via:</span>
                  <span>{completedInvoice.paymentMethod}</span>
                </div>
              </div>

              <div className="receipt-divider" />
              <div className="receipt-footer">
                <p>Thank you for your visit! Get well soon.</p>
                <small>Returns accepted within 7 days with original invoice.</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <a
                  className="secondary-button"
                  href={`/api/sales/${completedInvoice.id}?format=escpos&width=${receiptWidth === "58mm" ? "58mm" : "80mm"}`}
                  download={`receipt-${completedInvoice.invoiceNumber}.bin`}
                  style={{ textDecoration: "none", fontSize: "0.82rem", display: "inline-flex", alignItems: "center" }}
                  title="Download raw ESC/POS binary file for direct USB/network printer spooling"
                >
                  💾 ESC/POS (.bin)
                </a>
                <a
                  className="secondary-button"
                  href={`/api/sales/${completedInvoice.id}?format=text&width=${receiptWidth === "58mm" ? "58mm" : "80mm"}`}
                  download={`receipt-${completedInvoice.invoiceNumber}.txt`}
                  style={{ textDecoration: "none", fontSize: "0.82rem", display: "inline-flex", alignItems: "center" }}
                  title="Download plain text receipt"
                >
                  📄 Text (.txt)
                </a>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCompletedInvoice(null)}
                >
                  Close &amp; Next Bill
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => window.print()}
                >
                  🖨️ Print ({receiptWidth.toUpperCase()})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

