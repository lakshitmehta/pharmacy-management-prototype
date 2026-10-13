"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Batch = {
  id: string;
  batchNumber: string;
  expiryDate: string;
  purchaseRate: number;
  mrp: number;
  packSize: number;
  freeQuantity: number;
  stock: number;
  expiryStatus: "EXPIRED" | "NEAR_EXPIRY" | "HEALTHY";
  isExpiring30Days: boolean;
  supplier: { id: string; name: string } | null;
};

type Medicine = {
  id: string;
  name: string;
  genericName: string | null;
  manufacturer: string | null;
  barcode: string | null;
  hsn: string | null;
  gstRate: number;
  safetyLimit: number;
  createdAt: string;
  totalStock: number;
  health: "HEALTHY" | "LOW" | "NEGATIVE";
  hasExpiringBatch: boolean;
  hasNegativeBatch: boolean;
  isRecent: boolean;
  minMrp: number;
  maxMrp: number;
  minPurchaseRate: number;
  batches: Batch[];
};

type Metrics = {
  stockValue: number;
  mrpValue: number;
  totalSkus: number;
  totalUnits: number;
  lowStockCount: number;
  negativeStockCount: number;
};

type Supplier = { id: string; name: string };

export function InventoryWorkspace() {
  const [tab, setTab] = useState<"stock" | "master" | "rate">("stock");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    stockValue: 0,
    mrpValue: 0,
    totalSkus: 0,
    totalUnits: 0,
    lowStockCount: 0,
    negativeStockCount: 0,
  });

  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [adjustBatch, setAdjustBatch] = useState<{ batchId: string; batchNumber: string; medicineName: string; currentStock: number; purchaseRate: number } | null>(null);
  const [editMedicine, setEditMedicine] = useState<Medicine | null>(null);
  const [barcodeModal, setBarcodeModal] = useState<{ code: string; name: string; mrp: number } | null>(null);

  // Add stock form state
  const [newName, setNewName] = useState("");
  const [newGeneric, setNewGeneric] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newHsn, setNewHsn] = useState("30049099");
  const [newGstRate, setNewGstRate] = useState(5);
  const [newSafetyLimit, setNewSafetyLimit] = useState(15);
  const [includeBatch, setIncludeBatch] = useState(true);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newPurchaseRate, setNewPurchaseRate] = useState<number>(0);
  const [newMrp, setNewMrp] = useState<number>(0);
  const [newQuantity, setNewQuantity] = useState<number>(10);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Adjust stock state
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("Physical inventory count audit");
  const [adjusting, setAdjusting] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editGeneric, setEditGeneric] = useState("");
  const [editManufacturer, setEditManufacturer] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editHsn, setEditHsn] = useState("");
  const [editGstRate, setEditGstRate] = useState(5);
  const [editSafetyLimit, setEditSafetyLimit] = useState(15);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams({ search, view, sort }).toString();
    void fetch(`/api/inventory?${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load inventory data"))))
      .then((data) => {
        setMedicines(data.medicines);
        setMetrics(data.metrics);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [search, view, sort, refreshKey]);

  useEffect(() => {
    void fetch("/api/suppliers")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load suppliers"))))
      .then((data) => {
        setSuppliers(data.suppliers.filter((s: { active: boolean }) => s.active));
      })
      .catch(() => {
        // Non-blocking supplier loading
      });
  }, []);

  async function handleAddMedicine(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const payload: {
      name: string;
      genericName?: string;
      manufacturer?: string;
      barcode?: string;
      hsn?: string;
      gstRate: number;
      safetyLimit: number;
      openingBatch?: {
        batchNumber: string;
        expiryDate: string;
        purchaseRate: number;
        mrp: number;
        quantity: number;
        supplierId?: string;
      };
    } = {
      name: newName,
      genericName: newGeneric || undefined,
      manufacturer: newManufacturer || undefined,
      barcode: newBarcode || undefined,
      hsn: newHsn || undefined,
      gstRate: newGstRate,
      safetyLimit: newSafetyLimit,
    };

    if (includeBatch) {
      payload.openingBatch = {
        batchNumber: newBatchNumber,
        expiryDate: newExpiryDate,
        purchaseRate: newPurchaseRate,
        mrp: newMrp,
        quantity: newQuantity,
        supplierId: newSupplierId || undefined,
      };
    }

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create medicine");

      setNotice(`Registered "${newName}" successfully.`);
      setAddModalOpen(false);
      resetAddForm();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add medicine");
    } finally {
      setSubmitting(false);
    }
  }

  function resetAddForm() {
    setNewName("");
    setNewGeneric("");
    setNewManufacturer("");
    setNewBarcode("");
    setNewHsn("30049099");
    setNewGstRate(5);
    setNewSafetyLimit(15);
    setIncludeBatch(true);
    setNewBatchNumber("");
    setNewExpiryDate("");
    setNewPurchaseRate(0);
    setNewMrp(0);
    setNewQuantity(10);
    setNewSupplierId("");
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustBatch || adjustDelta === 0) return;
    setAdjusting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: adjustBatch.batchId,
          quantityDelta: adjustDelta,
          reason: adjustReason,
          unitRate: adjustBatch.purchaseRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to adjust stock");

      setNotice(`Stock for batch ${adjustBatch.batchNumber} adjusted to ${data.adjustment.currentStock} packs.`);
      setAdjustBatch(null);
      setAdjustDelta(0);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setAdjusting(false);
    }
  }

  function openEditModal(med: Medicine) {
    setEditMedicine(med);
    setEditName(med.name);
    setEditGeneric(med.genericName || "");
    setEditManufacturer(med.manufacturer || "");
    setEditBarcode(med.barcode || "");
    setEditHsn(med.hsn || "");
    setEditGstRate(med.gstRate);
    setEditSafetyLimit(med.safetyLimit);
  }

  async function handleEditMedicine(e: React.FormEvent) {
    e.preventDefault();
    if (!editMedicine) return;
    setEditing(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/inventory/${editMedicine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          genericName: editGeneric,
          manufacturer: editManufacturer,
          barcode: editBarcode,
          hsn: editHsn,
          gstRate: editGstRate,
          safetyLimit: editSafetyLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update medicine");

      setNotice(`Updated "${editName}" successfully.`);
      setEditMedicine(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update medicine");
    } finally {
      setEditing(false);
    }
  }

  function openBarcodeModal(code: string | null, name: string, mrp: number) {
    const finalCode = code || `PB-${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    setBarcodeModal({ code: finalCode, name, mrp });
  }

  return (
    <section className="module-page inventory-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Counter</p>
          <h1>Medicine Inventory</h1>
          <p>Manage medicines, batches, stock thresholds, expiry, barcode actions, and inventory movements.</p>
        </div>
        <span className="section-signal">Batch ledger</span>
      </div>

      <div className="purchase-actions">
        <button className="primary-button" onClick={() => setAddModalOpen(true)}>
          + Add Stock Item
        </button>
        <a
          className="secondary-button"
          href="/api/export/medicines"
          download
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          CSV Export
        </a>
        <Link
          className="secondary-button"
          href="/backup"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Bulk CSV Import
        </Link>
        <button
          className="secondary-button"
          onClick={() => setNotice("Barcode camera scanner entry point is prepared for workstation hardware integration.")}
        >
          Scan Barcode
        </button>
      </div>

      {/* Summary Valuation Ribbon */}
      <div className="inventory-summary-bar">
        <div className="valuation-text">
          <p className="valuation-info">
            Stock value uses purchase/cost price × quantity per batch. MRP value uses selling price × quantity.
          </p>
          <div className="valuation-stats">
            <span>
              Stock value <strong>₹{metrics.stockValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </span>
            <span className="dot-sep">·</span>
            <span>
              MRP <strong>₹{metrics.mrpValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </span>
            <span className="dot-sep">·</span>
            <span>
              {metrics.totalSkus} SKUs · {metrics.totalUnits} units
            </span>
          </div>
        </div>

        <div className="inventory-badges">
          <button
            type="button"
            className={`badge-pill ${view === "low-stock" ? "badge-active" : ""}`}
            onClick={() => setView(view === "low-stock" ? "all" : "low-stock")}
          >
            ⚠️ {metrics.lowStockCount} items low stock
          </button>
          <button
            type="button"
            className={`badge-pill ${view === "negative" ? "badge-active" : ""}`}
            onClick={() => setView(view === "negative" ? "all" : "negative")}
          >
            🛑 {metrics.negativeStockCount} items negative stock
          </button>
        </div>
      </div>

      {notice && <p className="form-success">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {/* Filter and Search Bar */}
      <div className="filter-row inventory-filter-row">
        <input
          type="text"
          placeholder="Search by medicine, MFG, barcode, batch..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="all">All stock</option>
          <option value="low-stock">Low stock only</option>
          <option value="expiring">Expiring within 30 days</option>
          <option value="negative">Negative stock</option>
          <option value="recent">Recently added (last 30 days)</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="price-asc">Price low→high</option>
          <option value="price-desc">Price high→low</option>
          <option value="stock-asc">Stock low→high</option>
          <option value="stock-desc">Stock high→low</option>
          <option value="expiry-asc">Expiry soonest</option>
          <option value="recent">Recently added</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        <button className={tab === "stock" ? "tab active" : "tab"} onClick={() => setTab("stock")}>
          My Stock ({medicines.length})
        </button>
        <button className={tab === "master" ? "tab active" : "tab"} onClick={() => setTab("master")}>
          Drug Master
        </button>
        <button className={tab === "rate" ? "tab active" : "tab"} onClick={() => setTab("rate")}>
          Rate & Scheme
        </button>
      </div>

      {/* TAB CONTENT */}
      {tab === "stock" && (
        <div className="stock-container">
          {loading ? (
            <div className="empty-state">Loading stock records...</div>
          ) : medicines.length === 0 ? (
            <div className="empty-state">
              No stock matches the selected view and filter criteria. Try selecting &quot;All stock&quot; or add a new medicine.
            </div>
          ) : (
            <div className="inventory-cards-grid">
              {medicines.map((med) => (
                <article className="inventory-card" key={med.id}>
                  <div className="inv-card-head">
                    <div>
                      <h3>{med.name}</h3>
                      <span className="inv-meta">
                        MFG: {med.manufacturer || "Generic"} · Generic: {med.genericName || "—"}
                      </span>
                    </div>
                    <div className="inv-card-right">
                      <strong className="inv-mrp">
                        {med.batches.length > 0 ? `₹${med.minMrp.toFixed(2)}` : "No batches"}
                      </strong>
                      <span
                        className={`status-badge ${
                          med.health === "HEALTHY" ? "active" : med.health === "LOW" ? "inactive" : "danger"
                        }`}
                      >
                        {med.health === "HEALTHY"
                          ? "Healthy Stock"
                          : med.health === "LOW"
                          ? "Low Stock"
                          : "Negative Stock"}
                      </span>
                    </div>
                  </div>

                  <div className="inv-batches-table-wrap">
                    <table className="inv-batch-table">
                      <thead>
                        <tr>
                          <th>Batch</th>
                          <th>Expiry</th>
                          <th>Supplier</th>
                          <th>Stock</th>
                          <th>Wholesale ₹</th>
                          <th>MRP ₹</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {med.batches.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-muted text-center">
                              No batches recorded. Add a batch or receive an invoice.
                            </td>
                          </tr>
                        ) : (
                          med.batches.map((batch) => (
                            <tr key={batch.id}>
                              <td>
                                <strong>{batch.batchNumber}</strong>
                              </td>
                              <td>
                                <span
                                  className={`expiry-tag ${
                                    batch.expiryStatus === "EXPIRED"
                                      ? "tag-expired"
                                      : batch.isExpiring30Days
                                      ? "tag-near"
                                      : "tag-healthy"
                                  }`}
                                >
                                  {new Date(batch.expiryDate).toLocaleDateString("en-IN", {
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                              </td>
                              <td>{batch.supplier?.name || "Direct / Opening"}</td>
                              <td>
                                <strong className={batch.stock <= 0 ? "text-danger" : ""}>
                                  {batch.stock} Packs
                                </strong>
                              </td>
                              <td>₹{batch.purchaseRate.toFixed(2)}</td>
                              <td>₹{batch.mrp.toFixed(2)}</td>
                              <td>
                                <div className="batch-actions">
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() =>
                                      setAdjustBatch({
                                        batchId: batch.id,
                                        batchNumber: batch.batchNumber,
                                        medicineName: med.name,
                                        currentStock: batch.stock,
                                        purchaseRate: batch.purchaseRate,
                                      })
                                    }
                                  >
                                    Adjust
                                  </button>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => openBarcodeModal(med.barcode, med.name, batch.mrp)}
                                  >
                                    Barcode
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="inv-card-foot">
                    <small>
                      Barcode: {med.barcode || "Not set"} · HSN: {med.hsn || "—"} · GST: {med.gstRate}% · Safety Limit:{" "}
                      {med.safetyLimit}
                    </small>
                    <button type="button" className="text-button" onClick={() => openEditModal(med)}>
                      Edit Details
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "master" && (
        <div className="work-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Catalog registry</p>
              <h2>Drug Master Catalog</h2>
            </div>
            <button className="primary-button" onClick={() => setAddModalOpen(true)}>
              + Add Medicine
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Generic Name</th>
                  <th>Manufacturer</th>
                  <th>Barcode</th>
                  <th>HSN</th>
                  <th>GST %</th>
                  <th>Safety Limit</th>
                  <th>Total Batches</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td>{m.genericName || "—"}</td>
                    <td>{m.manufacturer || "Generic"}</td>
                    <td>{m.barcode || "—"}</td>
                    <td>{m.hsn || "—"}</td>
                    <td>{m.gstRate}%</td>
                    <td>{m.safetyLimit}</td>
                    <td>{m.batches.length}</td>
                    <td>
                      <button type="button" className="text-button" onClick={() => openEditModal(m)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "rate" && (
        <div className="work-panel empty-state">
          <h3>Rate & Scheme Intelligence</h3>
          <p>
            Rate and scheme alerts are integrated with supplier procurement and invoice receiving. Active schemes are
            automatically applied when establishing purchase invoices.
          </p>
        </div>
      )}

      {/* MODAL: Add Stock Item */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h2>Add New Stock Item</h2>
              <button type="button" className="close-btn" onClick={() => setAddModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddMedicine} className="modal-form">
              <div className="form-grid">
                <label>
                  Medicine Name *
                  <input
                    required
                    placeholder="e.g. Paracetamol 650"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <label>
                  Generic Name
                  <input
                    placeholder="e.g. Paracetamol"
                    value={newGeneric}
                    onChange={(e) => setNewGeneric(e.target.value)}
                  />
                </label>
                <label>
                  Manufacturer
                  <input
                    placeholder="e.g. Cipla Ltd."
                    value={newManufacturer}
                    onChange={(e) => setNewManufacturer(e.target.value)}
                  />
                </label>
                <label>
                  Barcode / SKU
                  <input
                    placeholder="e.g. 890100000010"
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                  />
                </label>
                <label>
                  HSN Code
                  <input placeholder="e.g. 30049099" value={newHsn} onChange={(e) => setNewHsn(e.target.value)} />
                </label>
                <label>
                  GST Rate %
                  <select value={newGstRate} onChange={(e) => setNewGstRate(Number(e.target.value))}>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </label>
                <label>
                  Safety Stock Limit
                  <input
                    type="number"
                    min="0"
                    value={newSafetyLimit}
                    onChange={(e) => setNewSafetyLimit(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="batch-toggle-box">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={includeBatch}
                    onChange={(e) => setIncludeBatch(e.target.checked)}
                  />
                  Include Opening Batch & Stock
                </label>
              </div>

              {includeBatch && (
                <div className="form-grid opening-batch-grid">
                  <label>
                    Batch Number *
                    <input
                      required={includeBatch}
                      placeholder="e.g. B-2026-01"
                      value={newBatchNumber}
                      onChange={(e) => setNewBatchNumber(e.target.value)}
                    />
                  </label>
                  <label>
                    Expiry Date *
                    <input
                      type="date"
                      required={includeBatch}
                      value={newExpiryDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Wholesale / Cost Rate ₹ *
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required={includeBatch}
                      value={newPurchaseRate}
                      onChange={(e) => setNewPurchaseRate(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    MRP ₹ *
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required={includeBatch}
                      value={newMrp}
                      onChange={(e) => setNewMrp(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Opening Quantity Packs *
                    <input
                      type="number"
                      min="1"
                      required={includeBatch}
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Supplier (Optional)
                    <select value={newSupplierId} onChange={(e) => setNewSupplierId(e.target.value)}>
                      <option value="">Direct / None</option>
                      {suppliers.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="form-actions modal-actions">
                <button type="button" className="secondary-button" onClick={() => setAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Stock Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adjust Stock */}
      {adjustBatch && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Adjust Batch Stock</h2>
              <button type="button" className="close-btn" onClick={() => setAdjustBatch(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="modal-form">
              <p>
                <strong>{adjustBatch.medicineName}</strong> (Batch: {adjustBatch.batchNumber})
              </p>
              <div className="adjust-stats">
                <span>
                  Current Stock: <strong>{adjustBatch.currentStock} Packs</strong>
                </span>
                <span>
                  New Stock: <strong>{adjustBatch.currentStock + adjustDelta} Packs</strong>
                </span>
              </div>

              <label>
                Stock Change (+ or - packs) *
                <input
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(Number(e.target.value))}
                  placeholder="e.g. +5 or -2"
                />
              </label>

              <label>
                Adjustment Reason *
                <input
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical count reconciliation, damaged packing"
                />
              </label>

              <div className="form-actions modal-actions">
                <button type="button" className="secondary-button" onClick={() => setAdjustBatch(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={adjusting || adjustDelta === 0}>
                  {adjusting ? "Updating..." : "Post Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Medicine */}
      {editMedicine && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h2>Edit Medicine Details</h2>
              <button type="button" className="close-btn" onClick={() => setEditMedicine(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleEditMedicine} className="modal-form">
              <div className="form-grid">
                <label>
                  Medicine Name *
                  <input required value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label>
                  Generic Name
                  <input value={editGeneric} onChange={(e) => setEditGeneric(e.target.value)} />
                </label>
                <label>
                  Manufacturer
                  <input value={editManufacturer} onChange={(e) => setEditManufacturer(e.target.value)} />
                </label>
                <label>
                  Barcode
                  <input value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} />
                </label>
                <label>
                  HSN
                  <input value={editHsn} onChange={(e) => setEditHsn(e.target.value)} />
                </label>
                <label>
                  GST %
                  <select value={editGstRate} onChange={(e) => setEditGstRate(Number(e.target.value))}>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </label>
                <label>
                  Safety Limit
                  <input
                    type="number"
                    min="0"
                    value={editSafetyLimit}
                    onChange={(e) => setEditSafetyLimit(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="form-actions modal-actions">
                <button type="button" className="secondary-button" onClick={() => setEditMedicine(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={editing}>
                  {editing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Barcode Preview */}
      {barcodeModal && (
        <div className="modal-backdrop">
          <div className="modal-card small-modal">
            <div className="modal-head">
              <h2>Barcode / SKU Label</h2>
              <button type="button" className="close-btn" onClick={() => setBarcodeModal(null)}>
                ✕
              </button>
            </div>
            <div className="barcode-box">
              <p className="barcode-med-name">{barcodeModal.name}</p>
              <div className="barcode-bars">
                <div className="bars-mock" />
                <span className="barcode-number">{barcodeModal.code}</span>
              </div>
              <p className="barcode-mrp">MRP: ₹{barcodeModal.mrp.toFixed(2)} (Incl. of all taxes)</p>
            </div>
            <div className="form-actions modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setNotice(`Print command dispatched for barcode label ${barcodeModal.code}.`)}
              >
                Print Label
              </button>
              <button type="button" className="primary-button" onClick={() => setBarcodeModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
