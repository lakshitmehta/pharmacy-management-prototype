"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  calculateReturnLineRefund,
  calculateReturnTotals,
  calculateExchangeDifferential,
  type CalculatedReturnLine,
} from "@/domain/returns";

type InvoiceLine = {
  id: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  barcode: string | null;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  soldQuantity: number;
  alreadyReturned: number;
  returnableQuantity: number;
  unitRate: number;
  discount: number;
  tax: number;
  total: number;
};

type LookedUpInvoice = {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  lines: InvoiceLine[];
};

type SelectedReturnLine = {
  salesLineId: string;
  batchId: string;
  quantity: number;
  reason: string;
};

type ReturnRegisterItem = {
  id: string;
  batchId: string;
  batchNumber: string;
  medicineName: string;
  genericName: string | null;
  quantity: number;
  unitRate: number;
  totalValue: number;
  referenceId: string | null;
  reason: string | null;
  createdAt: string;
};

type ReturnMetrics = {
  totalReturnsCount: number;
  totalUnitsReturned: number;
  totalReturnValue: number;
};

type MedicineSearchItem = {
  id: string;
  name: string;
  genericName: string | null;
  gstRate: number;
  batches: Array<{
    id: string;
    batchNumber: string;
    expiryDate: string;
    mrp: number;
    stock: number;
    isExpired: boolean;
  }>;
};

type SelectedReplacementLine = {
  medicineId: string;
  batchId: string;
  medicineName: string;
  batchNumber: string;
  quantity: number;
  unitRate: number;
  mrp: number;
  taxPercent: number;
  total: number;
};

type ProcessedReturnResult = {
  returnVoucherNumber: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  settlementType: string;
  totalRefund: number;
  taxableRefund: number;
  taxRefund: number;
  lines: Array<{
    medicineName: string;
    batchNumber: string;
    quantity: number;
    unitRate: number;
    refundTotal: number;
    reason: string;
  }>;
  createdAt: string;
};

type ProcessedExchangeResult = {
  exchangeVoucherNumber: string;
  invoiceNumber: string;
  customerName: string;
  returnTotal: number;
  replacementTotal: number;
  differential: number;
  settlementType: "CUSTOMER_PAYS" | "STORE_REFUNDS" | "EVEN_EXCHANGE";
  returnedLines: Array<{
    medicineName: string;
    batchNumber: string;
    quantity: number;
    refundTotal: number;
  }>;
  replacementLines: Array<{
    medicineName: string;
    batchNumber: string;
    quantity: number;
    unitRate: number;
    total: number;
  }>;
};

export function ReturnsWorkspace() {
  const [activeTab, setActiveTab] = useState<"process" | "register">("process");

  // Lookup state
  const [query, setQuery] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [invoice, setInvoice] = useState<LookedUpInvoice | null>(null);

  // Return lines selection
  const [selectedReturns, setSelectedReturns] = useState<Record<string, SelectedReturnLine>>({});

  // Mode: Direct Return vs Exchange
  const [mode, setMode] = useState<"DIRECT_RETURN" | "EXCHANGE">("DIRECT_RETURN");

  // Direct Return Settlement
  const [settlementType, setSettlementType] = useState<"REFUND_CASH" | "REFUND_UPI" | "KHATA_CREDIT">("REFUND_CASH");

  // Exchange replacements state
  const [replacementSearch, setReplacementSearch] = useState("");
  const [replacementResults, setReplacementResults] = useState<MedicineSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [replacementLines, setReplacementLines] = useState<SelectedReplacementLine[]>([]);
  const [exchangeSettlementMethod, setExchangeSettlementMethod] = useState<"CASH" | "UPI" | "CREDIT">("CASH");

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Success Vouchers
  const [returnVoucher, setReturnVoucher] = useState<ProcessedReturnResult | null>(null);
  const [exchangeVoucher, setExchangeVoucher] = useState<ProcessedExchangeResult | null>(null);

  // Returns Register
  const [registerItems, setRegisterItems] = useState<ReturnRegisterItem[]>([]);
  const [metrics, setMetrics] = useState<ReturnMetrics>({
    totalReturnsCount: 0,
    totalUnitsReturned: 0,
    totalReturnValue: 0,
  });
  const [registerLoading, setRegisterLoading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load returns register
  async function loadRegister() {
    setRegisterLoading(true);
    try {
      const res = await fetch("/api/returns");
      if (res.ok) {
        const data = await res.json();
        setRegisterItems(data.returns ?? []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegisterLoading(false);
    }
  }

  useEffect(() => {
    void loadRegister();
  }, []);

  // Invoice Lookup
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLookingUp(true);
    setError(null);
    setNotice(null);
    setInvoice(null);
    setSelectedReturns({});
    setReplacementLines([]);

    try {
      const res = await fetch(`/api/returns/lookup?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No matching invoice found.");
        return;
      }

      setInvoice(data.invoice);
    } catch (err) {
      console.error(err);
      setError("Network error while searching for invoice.");
    } finally {
      setLookingUp(false);
    }
  }

  // Toggle line selection
  function toggleLine(line: InvoiceLine) {
    if (line.returnableQuantity <= 0) return;

    setSelectedReturns((prev) => {
      const next = { ...prev };
      if (next[line.id]) {
        delete next[line.id];
      } else {
        next[line.id] = {
          salesLineId: line.id,
          batchId: line.batchId,
          quantity: line.returnableQuantity,
          reason: "PATIENT_RECOVERED",
        };
      }
      return next;
    });
  }

  // Update return quantity
  function updateReturnQty(lineId: string, qty: number, maxQty: number) {
    const validQty = Math.max(1, Math.min(maxQty, Math.floor(qty) || 1));
    setSelectedReturns((prev) => {
      if (!prev[lineId]) return prev;
      return {
        ...prev,
        [lineId]: { ...prev[lineId], quantity: validQty },
      };
    });
  }

  // Update return reason
  function updateReturnReason(lineId: string, reason: string) {
    setSelectedReturns((prev) => {
      if (!prev[lineId]) return prev;
      return {
        ...prev,
        [lineId]: { ...prev[lineId], reason },
      };
    });
  }

  // Search replacement medicines for exchange
  useEffect(() => {
    if (!replacementSearch.trim()) {
      setReplacementResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/medicines/search-for-sale?search=${encodeURIComponent(replacementSearch.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setReplacementResults(data.medicines ?? []);
        }
      } catch (err) {
        console.error("Replacement search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [replacementSearch]);

  // Add replacement item
  function addReplacementBatch(med: MedicineSearchItem, batch: MedicineSearchItem["batches"][0]) {
    if (batch.stock <= 0) return;

    const existingIndex = replacementLines.findIndex((l) => l.batchId === batch.id);
    if (existingIndex >= 0) {
      const existing = replacementLines[existingIndex];
      if (existing.quantity >= batch.stock) return;
      const updatedLines = [...replacementLines];
      const newQty = existing.quantity + 1;
      const taxable = newQty * existing.unitRate;
      const total = Math.round((taxable + taxable * (existing.taxPercent / 100)) * 100) / 100;
      updatedLines[existingIndex] = { ...existing, quantity: newQty, total };
      setReplacementLines(updatedLines);
    } else {
      const taxable = 1 * batch.mrp;
      const total = Math.round((taxable + taxable * (med.gstRate / 100)) * 100) / 100;
      setReplacementLines((prev) => [
        ...prev,
        {
          medicineId: med.id,
          batchId: batch.id,
          medicineName: med.name,
          batchNumber: batch.batchNumber,
          quantity: 1,
          unitRate: batch.mrp,
          mrp: batch.mrp,
          taxPercent: med.gstRate,
          total,
        },
      ]);
    }
  }

  function updateReplacementQty(index: number, newQty: number) {
    const updated = [...replacementLines];
    const line = updated[index];
    const validQty = Math.max(1, Math.floor(newQty) || 1);
    const taxable = validQty * line.unitRate;
    const total = Math.round((taxable + taxable * (line.taxPercent / 100)) * 100) / 100;
    updated[index] = { ...line, quantity: validQty, total };
    setReplacementLines(updated);
  }

  function removeReplacementLine(index: number) {
    setReplacementLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Calculate return refund totals live
  const returnLinesCalculated: CalculatedReturnLine[] = invoice
    ? Object.values(selectedReturns).map((sel) => {
        const origLine = invoice.lines.find((l) => l.id === sel.salesLineId)!;
        return calculateReturnLineRefund(
          {
            id: origLine.id,
            quantity: origLine.soldQuantity,
            unitRate: origLine.unitRate,
            discount: origLine.discount,
            tax: origLine.tax,
            total: origLine.total,
          },
          sel.quantity
        );
      })
    : [];

  const returnTotals = calculateReturnTotals(returnLinesCalculated);

  // Calculate exchange replacement totals and differential
  const replacementTotal = Math.round(replacementLines.reduce((sum, l) => sum + l.total, 0) * 100) / 100;
  const exchangeDifferential = calculateExchangeDifferential(returnTotals.totalRefund, replacementTotal);

  // Submit Direct Return
  async function submitDirectReturn() {
    if (!invoice) return;
    const lines = Object.values(selectedReturns);
    if (lines.length === 0) {
      setError("Please select at least one line item to return.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          lines: lines.map((l) => ({
            salesLineId: l.salesLineId,
            batchId: l.batchId,
            quantity: l.quantity,
            reason: l.reason,
          })),
          settlementType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to process return.");
        setSubmitting(false);
        return;
      }

      setNotice(`Return voucher ${data.returnResult.returnVoucherNumber} generated. Stock restored.`);
      setReturnVoucher(data.returnResult);
      setInvoice(null);
      setSelectedReturns({});
      setQuery("");
      void loadRegister();
    } catch (err) {
      console.error(err);
      setError("Network error while submitting return.");
    } finally {
      setSubmitting(false);
    }
  }

  // Submit Exchange
  async function submitExchange() {
    if (!invoice) return;
    const returnLines = Object.values(selectedReturns);
    if (returnLines.length === 0) {
      setError("Please select at least one item being returned.");
      return;
    }
    if (replacementLines.length === 0) {
      setError("Please add at least one replacement medicine.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/returns/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          returnLines: returnLines.map((l) => ({
            salesLineId: l.salesLineId,
            batchId: l.batchId,
            quantity: l.quantity,
            reason: l.reason,
          })),
          replacementLines: replacementLines.map((l) => ({
            medicineId: l.medicineId,
            batchId: l.batchId,
            quantity: l.quantity,
            unitRate: l.unitRate,
            mrp: l.mrp,
            taxPercent: l.taxPercent,
          })),
          settlementMethod: exchangeSettlementMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to process exchange.");
        setSubmitting(false);
        return;
      }

      setNotice(`Exchange voucher ${data.exchangeResult.exchangeVoucherNumber} processed successfully.`);
      setExchangeVoucher(data.exchangeResult);
      setInvoice(null);
      setSelectedReturns({});
      setReplacementLines([]);
      setQuery("");
      void loadRegister();
    } catch (err) {
      console.error(err);
      setError("Network error while processing exchange.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workspace-container">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">Counter & Adjustments</p>
          <h1>Returns & Exchange</h1>
          <p>
            Validate original invoices, enforce returnable batch quantities, restore inventory, and settle via cash, UPI, or customer Khata credit.
          </p>
        </div>
        <div className="sales-toolbar-actions">
          <Link href="/sales" className="action-btn">
            Sales View →
          </Link>
          <Link href="/billing" className="button-primary">
            + Counter POS
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
            Total Value Returned
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--ink)" }}>
            ₹{metrics.totalReturnValue.toFixed(2)}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Refunded / Credited
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Restored Inventory Units
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "#16a34a" }}>
            {metrics.totalUnitsReturned} <span style={{ fontSize: "0.9rem", fontWeight: "normal" }}>units</span>
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Restocked back into batches
          </span>
        </div>

        <div className="metric-card" style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <span className="metric-title" style={{ display: "block", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: "bold", marginBottom: "6px" }}>
            Return Events Logged
          </span>
          <span className="metric-value" style={{ fontSize: "1.65rem", fontWeight: "bold", color: "var(--ink)" }}>
            {metrics.totalReturnsCount}
          </span>
          <span className="metric-sub" style={{ display: "block", fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            MovementType: CUSTOMER_RETURN
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--line)", marginBottom: "18px" }}>
        <button
          type="button"
          className={`tab-btn ${activeTab === "process" ? "active" : ""}`}
          onClick={() => setActiveTab("process")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "process" ? "3px solid var(--accent)" : "3px solid transparent",
            background: "none",
            fontWeight: activeTab === "process" ? "bold" : "normal",
            color: activeTab === "process" ? "var(--accent)" : "var(--ink)",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          + Process Return or Exchange
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "register" ? "active" : ""}`}
          onClick={() => setActiveTab("register")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "register" ? "3px solid var(--accent)" : "3px solid transparent",
            background: "none",
            fontWeight: activeTab === "register" ? "bold" : "normal",
            color: activeTab === "register" ? "var(--accent)" : "var(--ink)",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Returns History Register
        </button>
      </div>

      {activeTab === "process" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Step 1: Invoice Lookup Card */}
          <div className="panel" style={{ padding: "20px" }}>
            <h2 style={{ fontSize: "1rem", margin: "0 0 12px" }}>1. Lookup Original Invoice</h2>
            <form onSubmit={handleLookup} style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                className="sales-search-input"
                placeholder="Enter Invoice # (e.g. INV-20260909-0001) or Customer Phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1, padding: "10px 14px", fontSize: "0.9rem" }}
              />
              <button
                type="submit"
                className="button-primary"
                disabled={lookingUp || !query.trim()}
                style={{ minWidth: "140px" }}
              >
                {lookingUp ? "Searching..." : "🔍 Find Invoice"}
              </button>
            </form>

            {invoice && (
              <div style={{ marginTop: "16px", padding: "14px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", fontSize: "0.82rem" }}>
                  <div>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", textTransform: "uppercase" }}>Invoice Number</span>
                    <strong>{invoice.invoiceNumber}</strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", textTransform: "uppercase" }}>Date Billed</span>
                    <span>{new Date(invoice.createdAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", textTransform: "uppercase" }}>Customer</span>
                    <strong>{invoice.customer ? `${invoice.customer.name} (${invoice.customer.phone})` : "Walk-in Customer"}</strong>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", textTransform: "uppercase" }}>Original Payment</span>
                    <span className="payment-pill">{invoice.paymentMethod}</span>
                  </div>
                  <div>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", textTransform: "uppercase" }}>Original Total</span>
                    <strong style={{ fontSize: "1rem" }}>₹{invoice.total.toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Line Items & Return Quantities */}
          {invoice && (
            <div className="panel" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h2 style={{ fontSize: "1rem", margin: 0 }}>2. Select Items to Return</h2>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  Only unsold quantities that were not previously returned can be processed
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>Select</th>
                      <th style={{ textAlign: "left" }}>Medicine & Batch</th>
                      <th style={{ textAlign: "center" }}>Sold Qty</th>
                      <th style={{ textAlign: "center" }}>Already Ret.</th>
                      <th style={{ textAlign: "center" }}>Returnable</th>
                      <th style={{ textAlign: "center", width: "90px" }}>Return Qty</th>
                      <th style={{ textAlign: "left" }}>Reason</th>
                      <th style={{ textAlign: "right" }}>Est. Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line) => {
                      const isSelected = Boolean(selectedReturns[line.id]);
                      const sel = selectedReturns[line.id];
                      const refundCalc = isSelected
                        ? calculateReturnLineRefund(
                            {
                              id: line.id,
                              quantity: line.soldQuantity,
                              unitRate: line.unitRate,
                              discount: line.discount,
                              tax: line.tax,
                              total: line.total,
                            },
                            sel.quantity
                          )
                        : null;

                      return (
                        <tr key={line.id} style={{ opacity: line.returnableQuantity === 0 ? 0.5 : 1, background: isSelected ? "var(--accent-soft)" : undefined }}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              disabled={line.returnableQuantity === 0}
                              checked={isSelected}
                              onChange={() => toggleLine(line)}
                              style={{ cursor: line.returnableQuantity === 0 ? "not-allowed" : "pointer" }}
                            />
                          </td>
                          <td>
                            <strong>{line.medicineName}</strong>
                            <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                              Batch: {line.batchNumber} | Exp: {new Date(line.expiryDate).toLocaleDateString()}
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>{line.soldQuantity}</td>
                          <td style={{ textAlign: "center", color: line.alreadyReturned > 0 ? "#b45309" : undefined }}>
                            {line.alreadyReturned}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {line.returnableQuantity === 0 ? (
                              <span className="status-badge" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                                Fully Returned
                              </span>
                            ) : (
                              <strong>{line.returnableQuantity}</strong>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {isSelected ? (
                              <input
                                type="number"
                                min={1}
                                max={line.returnableQuantity}
                                value={sel.quantity}
                                onChange={(e) => updateReturnQty(line.id, Number(e.target.value), line.returnableQuantity)}
                                style={{ width: "60px", padding: "4px 6px", textAlign: "center", borderRadius: "4px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontWeight: "bold" }}
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {isSelected ? (
                              <select
                                value={sel.reason}
                                onChange={(e) => updateReturnReason(line.id, e.target.value)}
                                style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "4px", border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)" }}
                              >
                                <option value="PATIENT_RECOVERED">Patient recovered / Unused</option>
                                <option value="DOCTOR_CHANGED_PRESCRIPTION">Doctor changed prescription</option>
                                <option value="WRONG_MEDICINE_DISPENSED">Wrong medicine dispensed</option>
                                <option value="ADVERSE_REACTION">Adverse reaction reported</option>
                                <option value="NEAR_EXPIRY_REJECTED">Near expiry rejected</option>
                                <option value="EXCESS_QUANTITY">Excess quantity</option>
                                <option value="OTHER">Other reason</option>
                              </select>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: isSelected ? "bold" : "normal" }}>
                            {refundCalc ? `₹${refundCalc.refundTotal.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Selected Summary */}
              {Object.keys(selectedReturns).length > 0 && (
                <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--paper)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    Selected <strong>{Object.keys(selectedReturns).length}</strong> items for return
                  </span>
                  <div style={{ fontSize: "1.05rem" }}>
                    Total Return Refund: <strong style={{ color: "#16a34a" }}>₹{returnTotals.totalRefund.toFixed(2)}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "8px" }}>
                      (Tax: ₹{returnTotals.tax.toFixed(2)})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Transaction Type (Direct Return vs Exchange) */}
          {invoice && Object.keys(selectedReturns).length > 0 && (
            <div className="panel" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ fontSize: "1rem", margin: 0 }}>3. Choose Transaction Type</h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`action-btn ${mode === "DIRECT_RETURN" ? "active" : ""}`}
                    onClick={() => setMode("DIRECT_RETURN")}
                    style={{
                      background: mode === "DIRECT_RETURN" ? "var(--accent)" : "var(--panel)",
                      color: mode === "DIRECT_RETURN" ? "#fff" : "var(--ink)",
                      borderColor: mode === "DIRECT_RETURN" ? "var(--accent)" : "var(--line)",
                    }}
                  >
                    Direct Return & Refund
                  </button>
                  <button
                    type="button"
                    className={`action-btn ${mode === "EXCHANGE" ? "active" : ""}`}
                    onClick={() => setMode("EXCHANGE")}
                    style={{
                      background: mode === "EXCHANGE" ? "var(--accent)" : "var(--panel)",
                      color: mode === "EXCHANGE" ? "#fff" : "var(--ink)",
                      borderColor: mode === "EXCHANGE" ? "var(--accent)" : "var(--line)",
                    }}
                  >
                    Exchange for Other Medicines
                  </button>
                </div>
              </div>

              {/* Option A: Direct Return */}
              {mode === "DIRECT_RETURN" && (
                <div>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>
                      Refund / Settlement Channel:
                    </label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className={`payment-method-btn ${settlementType === "REFUND_CASH" ? "active" : ""}`}
                        onClick={() => setSettlementType("REFUND_CASH")}
                        style={{ padding: "10px 16px" }}
                      >
                        Cash Refund
                      </button>
                      <button
                        type="button"
                        className={`payment-method-btn ${settlementType === "REFUND_UPI" ? "active" : ""}`}
                        onClick={() => setSettlementType("REFUND_UPI")}
                        style={{ padding: "10px 16px" }}
                      >
                        UPI Refund
                      </button>
                      {invoice.customer && (
                        <button
                          type="button"
                          className={`payment-method-btn ${settlementType === "KHATA_CREDIT" ? "active" : ""}`}
                          onClick={() => setSettlementType("KHATA_CREDIT")}
                          style={{ padding: "10px 16px" }}
                        >
                          Credit to Khata Ledger ({invoice.customer.name})
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
                    <div>
                      <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Total Net Refund Due:</span>
                      <div style={{ fontSize: "1.6rem", fontWeight: "bold", color: "#16a34a" }}>
                        ₹{returnTotals.totalRefund.toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={submitting}
                      onClick={submitDirectReturn}
                      style={{ padding: "12px 24px", fontSize: "0.95rem" }}
                    >
                      {submitting ? "Processing..." : `Process Return & Restore Stock (₹${returnTotals.totalRefund.toFixed(2)})`}
                    </button>
                  </div>
                </div>
              )}

              {/* Option B: Exchange */}
              {mode === "EXCHANGE" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", background: "var(--paper)", borderRadius: "6px" }}>
                    <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                      Search Replacement Medicines to Issue:
                    </label>
                    <input
                      type="text"
                      className="sales-search-input"
                      placeholder="Type replacement medicine name, generic name, or barcode..."
                      value={replacementSearch}
                      onChange={(e) => setReplacementSearch(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px" }}
                    />

                    {/* Replacement search dropdown */}
                    {searchLoading && <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "6px 0 0" }}>Searching available batches...</p>}
                    {replacementResults.length > 0 && (
                      <div style={{ marginTop: "8px", maxHeight: "180px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "6px", background: "var(--panel)" }}>
                        {replacementResults.map((med) => (
                          <div key={med.id} style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ fontWeight: "bold", fontSize: "0.82rem" }}>{med.name}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{med.genericName} | GST: {med.gstRate}%</div>
                            <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                              {med.batches.map((b) => (
                                <button
                                  key={b.id}
                                  type="button"
                                  className="action-btn"
                                  disabled={b.stock <= 0}
                                  onClick={() => addReplacementBatch(med, b)}
                                  style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                                >
                                  Batch {b.batchNumber} (MRP ₹{b.mrp.toFixed(2)} | Stock: {b.stock}) +
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Replacement lines table */}
                  {replacementLines.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <h3 style={{ fontSize: "0.88rem", margin: "0 0 8px" }}>Selected Replacement Items ({replacementLines.length})</h3>
                      <table className="sales-table" style={{ width: "100%", fontSize: "0.8rem" }}>
                        <thead>
                          <tr>
                            <th>Medicine & Batch</th>
                            <th style={{ textAlign: "center", width: "90px" }}>Qty</th>
                            <th style={{ textAlign: "right" }}>Unit Rate</th>
                            <th style={{ textAlign: "right" }}>Total</th>
                            <th style={{ textAlign: "center", width: "60px" }}>Remove</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replacementLines.map((line, idx) => (
                            <tr key={line.batchId}>
                              <td>
                                <strong>{line.medicineName}</strong>
                                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Batch: {line.batchNumber}</div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="number"
                                  min={1}
                                  value={line.quantity}
                                  onChange={(e) => updateReplacementQty(idx, Number(e.target.value))}
                                  style={{ width: "60px", padding: "3px 6px", textAlign: "center", borderRadius: "4px", border: "1px solid var(--line)" }}
                                />
                              </td>
                              <td style={{ textAlign: "right" }}>₹{line.unitRate.toFixed(2)}</td>
                              <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{line.total.toFixed(2)}</td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="action-btn danger-text"
                                  onClick={() => removeReplacementLine(idx)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Differential & Settlement */}
                  <div style={{ padding: "14px", background: "var(--paper)", borderRadius: "6px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.84rem" }}>
                      <span>Returned Medicine Value:</span>
                      <strong>₹{returnTotals.totalRefund.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.84rem" }}>
                      <span>Replacement Medicine Value:</span>
                      <strong>₹{replacementTotal.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid var(--line)", fontSize: "1.05rem" }}>
                      <span>
                        {exchangeDifferential.settlementType === "CUSTOMER_PAYS" && "Customer Pays Difference:"}
                        {exchangeDifferential.settlementType === "STORE_REFUNDS" && "Store Refunds Difference:"}
                        {exchangeDifferential.settlementType === "EVEN_EXCHANGE" && "Differential (Even Exchange):"}
                      </span>
                      <strong style={{
                        color:
                          exchangeDifferential.settlementType === "CUSTOMER_PAYS"
                            ? "#b45309"
                            : exchangeDifferential.settlementType === "STORE_REFUNDS"
                            ? "#16a34a"
                            : "var(--ink)",
                        fontSize: "1.3rem",
                      }}>
                        ₹{exchangeDifferential.difference.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {exchangeDifferential.difference > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "bold", textTransform: "uppercase", color: "var(--muted)", marginBottom: "6px" }}>
                        Differential Settlement Method:
                      </label>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          type="button"
                          className={`payment-method-btn ${exchangeSettlementMethod === "CASH" ? "active" : ""}`}
                          onClick={() => setExchangeSettlementMethod("CASH")}
                          style={{ padding: "8px 14px" }}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          className={`payment-method-btn ${exchangeSettlementMethod === "UPI" ? "active" : ""}`}
                          onClick={() => setExchangeSettlementMethod("UPI")}
                          style={{ padding: "8px 14px" }}
                        >
                          UPI
                        </button>
                        {invoice.customer && (
                          <button
                            type="button"
                            className={`payment-method-btn ${exchangeSettlementMethod === "CREDIT" ? "active" : ""}`}
                            onClick={() => setExchangeSettlementMethod("CREDIT")}
                            style={{ padding: "8px 14px" }}
                          >
                            Khata Credit / Debit ({invoice.customer.name})
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={submitting || replacementLines.length === 0}
                      onClick={submitExchange}
                      style={{ padding: "12px 24px", fontSize: "0.95rem" }}
                    >
                      {submitting ? "Processing Exchange..." : "Confirm & Complete Exchange"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Returns Register History */}
      {activeTab === "register" && (
        <div className="panel sales-table-panel" style={{ padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Restored Inventory Movements ({registerItems.length})</h2>
            <button type="button" className="action-btn" onClick={() => void loadRegister()}>
              ↻ Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="sales-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date & Time</th>
                  <th style={{ textAlign: "left" }}>Medicine</th>
                  <th style={{ textAlign: "left" }}>Batch #</th>
                  <th style={{ textAlign: "center" }}>Restored Qty</th>
                  <th style={{ textAlign: "right" }}>Unit Rate</th>
                  <th style={{ textAlign: "right" }}>Total Value</th>
                  <th style={{ textAlign: "left" }}>Return Reason</th>
                </tr>
              </thead>
              <tbody>
                {registerLoading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--muted)" }}>
                      Loading returns register...
                    </td>
                  </tr>
                ) : registerItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                      No returns or exchanges recorded yet.
                    </td>
                  </tr>
                ) : (
                  registerItems.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <strong>{item.medicineName}</strong>
                        {item.genericName && <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{item.genericName}</div>}
                      </td>
                      <td>{item.batchNumber}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="status-badge" style={{ background: "#ecfdf5", color: "#065f46" }}>
                          +{item.quantity} restored
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>₹{item.unitRate.toFixed(2)}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{item.totalValue.toFixed(2)}</td>
                      <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{item.reason || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable Direct Return Voucher Modal */}
      {returnVoucher && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Credit Memo / Return Note</h2>
              <button type="button" className="close-btn" onClick={() => setReturnVoucher(null)}>
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>SALES RETURN CREDIT MEMO</h3>
                <p>INVENTORY RESTORATION VOUCHER</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher #:</span>
                <strong>{returnVoucher.returnVoucherNumber}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Original Invoice:</span>
                <span>{returnVoucher.invoiceNumber}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Date:</span>
                <span>{new Date(returnVoucher.createdAt).toLocaleString()}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Customer:</span>
                <strong>{returnVoucher.customerName} {returnVoucher.customerPhone ? `(${returnVoucher.customerPhone})` : ""}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Settlement:</span>
                <strong>{returnVoucher.settlementType}</strong>
              </div>

              <div className="receipt-divider" />

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Item & Batch</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {returnVoucher.lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        {line.medicineName}
                        <br />
                        <small>Batch {line.batchNumber} - {line.reason}</small>
                      </td>
                      <td style={{ textAlign: "center" }}>{line.quantity}</td>
                      <td style={{ textAlign: "right" }}>₹{line.refundTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Taxable Refund:</span>
                  <span>₹{returnVoucher.taxableRefund.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row">
                  <span>Tax Refund:</span>
                  <span>₹{returnVoucher.taxRefund.toFixed(2)}</span>
                </div>
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total Net Refund:</span>
                    <span>₹{returnVoucher.totalRefund.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="receipt-footer">
                <p>Stock restored to active batch inventory.</p>
                <small>Generated by PillBills Counter System</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ marginTop: "14px" }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => setReturnVoucher(null)}
              >
                Done
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => window.print()}
              >
                🖨 Print Credit Memo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Exchange Voucher Modal */}
      {exchangeVoucher && (
        <div className="modal-backdrop">
          <div className="modal-card receipt-modal">
            <div className="modal-head print-hide">
              <h2>Exchange Note Generated</h2>
              <button type="button" className="close-btn" onClick={() => setExchangeVoucher(null)}>
                ✕
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-header">
                <h3>COUNTER EXCHANGE MEMO</h3>
                <p>MEDICINE EXCHANGE RECORD</p>
              </div>

              <div className="receipt-divider" />

              <div className="receipt-meta-row">
                <span>Voucher #:</span>
                <strong>{exchangeVoucher.exchangeVoucherNumber}</strong>
              </div>
              <div className="receipt-meta-row">
                <span>Original Invoice:</span>
                <span>{exchangeVoucher.invoiceNumber}</span>
              </div>
              <div className="receipt-meta-row">
                <span>Customer:</span>
                <strong>{exchangeVoucher.customerName}</strong>
              </div>

              <div className="receipt-divider" />

              <div style={{ fontSize: "0.74rem", fontWeight: "bold", marginBottom: "4px" }}>
                RETURNED MEDICINES (Restocked):
              </div>
              <table className="receipt-table">
                <tbody>
                  {exchangeVoucher.returnedLines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.medicineName} ({l.batchNumber})</td>
                      <td style={{ textAlign: "center" }}>{l.quantity}x</td>
                      <td style={{ textAlign: "right" }}>₹{l.refundTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div style={{ fontSize: "0.74rem", fontWeight: "bold", marginBottom: "4px" }}>
                REPLACEMENT MEDICINES ISSUED:
              </div>
              <table className="receipt-table">
                <tbody>
                  {exchangeVoucher.replacementLines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.medicineName} ({l.batchNumber})</td>
                      <td style={{ textAlign: "center" }}>{l.quantity}x</td>
                      <td style={{ textAlign: "right" }}>₹{l.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-divider" />

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Return Credit:</span>
                  <span>₹{exchangeVoucher.returnTotal.toFixed(2)}</span>
                </div>
                <div className="receipt-total-row">
                  <span>New Replacement Total:</span>
                  <span>₹{exchangeVoucher.replacementTotal.toFixed(2)}</span>
                </div>
                <div className="receipt-grand">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      {exchangeVoucher.settlementType === "CUSTOMER_PAYS" && "Net Difference Paid:"}
                      {exchangeVoucher.settlementType === "STORE_REFUNDS" && "Net Difference Refunded:"}
                      {exchangeVoucher.settlementType === "EVEN_EXCHANGE" && "Net Difference:"}
                    </span>
                    <span>₹{exchangeVoucher.differential.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="receipt-footer">
                <p>Inventory adjustments posted to batch ledger.</p>
                <small>Generated by PillBills Counter System</small>
              </div>
            </div>

            <div className="modal-actions print-hide" style={{ marginTop: "14px" }}>
              <button
                type="button"
                className="action-btn"
                onClick={() => setExchangeVoucher(null)}
              >
                Done
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => window.print()}
              >
                🖨 Print Exchange Memo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

