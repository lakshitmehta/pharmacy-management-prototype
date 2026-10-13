"use client";

import { useEffect, useState } from "react";

type Batch = {
  id: string;
  batchNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  expiryStatus: "EXPIRED" | "NEAR_EXPIRY" | "HEALTHY";
  stock: number;
  purchaseRate: number;
  mrp: number;
  totalCostValue: number;
  totalMrpValue: number;
  medicine: {
    id: string;
    name: string;
    genericName: string | null;
    manufacturer: string | null;
    barcode: string | null;
  };
  supplier: { id: string; name: string; phone: string | null } | null;
};

type ExpiryMetrics = {
  expiredValue: number;
  expiredCount: number;
  nearExpiryValue: number;
  nearExpiryCount: number;
  healthyValue: number;
  healthyCount: number;
  totalBatches: number;
  totalStockUnits: number;
  totalLedgerCost: number;
};

type Supplier = { id: string; name: string };

export function ExpiryWorkspace() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metrics, setMetrics] = useState<ExpiryMetrics>({
    expiredValue: 0,
    expiredCount: 0,
    nearExpiryValue: 0,
    nearExpiryCount: 0,
    healthyValue: 0,
    healthyCount: 0,
    totalBatches: 0,
    totalStockUnits: 0,
    totalLedgerCost: 0,
  });

  const [filter, setFilter] = useState<"all" | "expired" | "near-expiry" | "healthy">("all");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({
      filter,
      supplierId: selectedSupplier,
      search,
    }).toString();

    void fetch(`/api/expiry?${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load expiry data"))))
      .then((data) => {
        setBatches(data.batches);
        setMetrics(data.metrics);
        setSuppliers(data.suppliers);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error loading expiry ledger");
        setLoading(false);
      });
  }, [filter, selectedSupplier, search]);

  const displayedUnits = batches.reduce((sum, b) => sum + Math.max(0, b.stock), 0);
  const displayedCost = batches.reduce((sum, b) => sum + b.totalCostValue, 0);

  return (
    <section className="module-page expiry-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Clearance review · Stock & purchase</p>
          <h1>Pharmacy Expiry Ledger</h1>
          <p>
            Review expiring batches, estimate refund exposure, and prepare supplier return documents before claim
            windows close.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() =>
            setNotice("PDF report generator is reserved for the export and reporting milestone. Use your browser print dialog if required.")
          }
        >
          Print Expiry Ledger PDF
        </button>
      </div>

      {notice && <p className="form-success">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      {/* 3 Exposure Cards */}
      <div className="expiry-cards-grid">
        <article
          className={`expiry-metric-card expired ${filter === "expired" ? "active-card" : ""}`}
          onClick={() => setFilter(filter === "expired" ? "all" : "expired")}
        >
          <span className="card-kicker">Expired Stock</span>
          <strong>₹{metrics.expiredValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
          <small>{metrics.expiredCount} batches past shelf limit.</small>
        </article>

        <article
          className={`expiry-metric-card near ${filter === "near-expiry" ? "active-card" : ""}`}
          onClick={() => setFilter(filter === "near-expiry" ? "all" : "near-expiry")}
        >
          <span className="card-kicker">Near Expiry (0–90 Days)</span>
          <strong>₹{metrics.nearExpiryValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
          <small>{metrics.nearExpiryCount} batches need review.</small>
        </article>

        <article
          className={`expiry-metric-card healthy ${filter === "healthy" ? "active-card" : ""}`}
          onClick={() => setFilter(filter === "healthy" ? "all" : "healthy")}
        >
          <span className="card-kicker">Healthy Batches</span>
          <strong>₹{metrics.healthyValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
          <small>{metrics.healthyCount} batches beyond 90 days.</small>
        </article>
      </div>

      {/* Filters Toolbar */}
      <div className="expiry-toolbar">
        <div className="expiry-pill-filters">
          <button
            type="button"
            className={`pill-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All Batches ({metrics.totalBatches})
          </button>
          <button
            type="button"
            className={`pill-btn expired ${filter === "expired" ? "active" : ""}`}
            onClick={() => setFilter("expired")}
          >
            Expired Only ({metrics.expiredCount})
          </button>
          <button
            type="button"
            className={`pill-btn near ${filter === "near-expiry" ? "active" : ""}`}
            onClick={() => setFilter("near-expiry")}
          >
            Near Expiry ({metrics.nearExpiryCount})
          </button>
          <button
            type="button"
            className={`pill-btn healthy ${filter === "healthy" ? "active" : ""}`}
            onClick={() => setFilter("healthy")}
          >
            Healthy Stock ({metrics.healthyCount})
          </button>
        </div>

        <div className="expiry-inputs">
          <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
            <option value="">All Distributors / Suppliers</option>
            {suppliers.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by name, MFG, batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="work-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Batch clearance table</p>
            <p className="sub-count">
              Showing <strong>{batches.length}</strong> product batches representing{" "}
              <strong>{displayedUnits}</strong> units (₹{displayedCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading expiry ledger...</div>
        ) : batches.length === 0 ? (
          <div className="empty-state">No batches match the selected expiry filter and search criteria.</div>
        ) : (
          <div className="table-wrap">
            <table className="expiry-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Medicine</th>
                  <th>Manufacturer</th>
                  <th>Batch #</th>
                  <th>Distributor / Supplier</th>
                  <th>Expiry Date</th>
                  <th>Days Remaining</th>
                  <th>Stock</th>
                  <th>Cost ₹</th>
                  <th>MRP ₹</th>
                  <th>Total Cost Value ₹</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span
                        className={`status-badge ${
                          b.expiryStatus === "HEALTHY"
                            ? "active"
                            : b.expiryStatus === "NEAR_EXPIRY"
                            ? "warning-badge"
                            : "danger"
                        }`}
                      >
                        {b.expiryStatus === "HEALTHY"
                          ? "Healthy"
                          : b.expiryStatus === "NEAR_EXPIRY"
                          ? "Near Expiry"
                          : "Expired"}
                      </span>
                    </td>
                    <td>
                      <strong>{b.medicine.name}</strong>
                      {b.medicine.genericName && <small className="block-meta">{b.medicine.genericName}</small>}
                    </td>
                    <td>{b.medicine.manufacturer || "Generic"}</td>
                    <td>
                      <code>{b.batchNumber}</code>
                    </td>
                    <td>{b.supplier?.name || "Direct / Opening"}</td>
                    <td>
                      <strong>
                        {new Date(b.expiryDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </strong>
                    </td>
                    <td>
                      <span className={b.daysUntilExpiry < 0 ? "text-danger font-bold" : ""}>
                        {b.daysUntilExpiry < 0 ? `${Math.abs(b.daysUntilExpiry)} days ago` : `${b.daysUntilExpiry} days`}
                      </span>
                    </td>
                    <td>
                      <strong className={b.stock <= 0 ? "text-danger" : ""}>{b.stock} Packs</strong>
                    </td>
                    <td>₹{b.purchaseRate.toFixed(2)}</td>
                    <td>₹{b.mrp.toFixed(2)}</td>
                    <td>
                      <strong>₹{b.totalCostValue.toFixed(2)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
