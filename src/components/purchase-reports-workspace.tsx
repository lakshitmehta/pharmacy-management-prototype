"use client";

import { useEffect, useState } from "react";

type PurchaseReportData = {
  purchases: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    supplierName: string;
    subtotal: number;
    tax: number;
    total: number;
    linesCount: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    invoiceCount: number;
    totalSpend: number;
    totalTax: number;
  }>;
  vendorDistribution: Array<{
    supplierId: string;
    supplierName: string;
    count: number;
    spend: number;
    outstanding: number;
  }>;
  suppliers: Array<{
    id: string;
    name: string;
  }>;
  metrics: {
    totalProcurement: number;
    totalTax: number;
    totalOutstanding: number;
    invoiceCount: number;
    activeSuppliersCount: number;
  };
};

export function PurchaseReportsWorkspace() {
  const [activeTab, setActiveTab] = useState<"overview" | "vendors" | "trends" | "register">("overview");
  const [supplierId, setSupplierId] = useState<string>("all");
  const [period, setPeriod] = useState<"this-month" | "last-month" | "this-year" | "custom">("this-month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [data, setData] = useState<PurchaseReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize date range based on period
  useEffect(() => {
    const now = new Date();
    if (period === "this-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (period === "last-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (period === "this-year") {
      const firstDay = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    }
  }, [period]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (supplierId && supplierId !== "all") params.set("supplierId", supplierId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/purchase-reports?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load purchase reports: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching purchase reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startDate && endDate) {
      void loadData();
    }
  }, [supplierId, startDate, endDate]);

  function exportCsv() {
    if (!data) return;
    let csvContent = "data:text/csv;charset=utf-8,";

    if (activeTab === "register" || activeTab === "overview") {
      csvContent += "Date,Invoice Number,Supplier,Lines,Subtotal,Tax,Total\n";
      data.purchases.forEach((p) => {
        csvContent += `"${p.invoiceDate}","${p.invoiceNumber}","${p.supplierName}",${p.linesCount},${p.subtotal},${p.tax},${p.total}\n`;
      });
    } else if (activeTab === "vendors") {
      csvContent += "Supplier Name,Invoices Count,Total Spend,Outstanding Balance\n";
      data.vendorDistribution.forEach((v) => {
        csvContent += `"${v.supplierName}",${v.count},${v.spend},${v.outstanding}\n`;
      });
    } else if (activeTab === "trends") {
      csvContent += "Month,Invoices Count,Total Spend,Total Tax\n";
      data.monthlyTrends.forEach((t) => {
        csvContent += `"${t.month}",${t.invoiceCount},${t.totalSpend},${t.totalTax}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `purchase_report_${activeTab}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Stock & purchase</p>
          <h1>Purchase Reports</h1>
          <p>Review payables analytics, vendor spend distribution, and monthly procurement summaries.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => window.print()}
            className="secondary"
            style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer" }}
          >
            🖨️ Print
          </button>
          <button
            onClick={exportCsv}
            disabled={!data || loading}
            style={{
              padding: "8px 14px",
              fontSize: "0.85rem",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* FILTERS BAR */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          background: "var(--panel)",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid var(--line)",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Period:</span>
          {(["this-month", "last-month", "this-year", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                padding: "4px 10px",
                fontSize: "0.8rem",
                borderRadius: "4px",
                border: "1px solid var(--line)",
                background: period === p ? "var(--accent)" : "transparent",
                color: period === p ? "#fff" : "inherit",
                cursor: "pointer",
              }}
            >
              {p === "this-month" ? "This Month" : p === "last-month" ? "Last Month" : p === "this-year" ? "This Year" : "Custom"}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: "4px 8px", fontSize: "0.85rem", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "4px 8px", fontSize: "0.85rem", borderRadius: "4px", border: "1px solid var(--line)" }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "auto" }}>
          <label htmlFor="supplier-select" style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Supplier:</label>
          <select
            id="supplier-select"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              borderRadius: "4px",
              border: "1px solid var(--line)",
              background: "var(--panel)",
            }}
          >
            <option value="all">All Suppliers</option>
            {data?.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRICS CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 6px 0" }}>TOTAL PROCUREMENT</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>
            ₹{data ? data.metrics.totalProcurement.toFixed(2) : "0.00"}
          </p>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 6px 0" }}>TOTAL INWARD TAX (ITC)</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0, color: "#16a34a" }}>
            ₹{data ? data.metrics.totalTax.toFixed(2) : "0.00"}
          </p>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 6px 0" }}>OUTSTANDING PAYABLES</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0, color: "#ea580c" }}>
            ₹{data ? data.metrics.totalOutstanding.toFixed(2) : "0.00"}
          </p>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 6px 0" }}>INVOICES COUNT</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>
            {data ? data.metrics.invoiceCount : 0}
          </p>
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 6px 0" }}>ACTIVE SUPPLIERS</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>
            {data ? data.metrics.activeSuppliersCount : 0}
          </p>
        </div>
      </div>

      {/* VIEW SUB-TABS */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--line)",
          marginBottom: "20px",
        }}
      >
        {(
          [
            { id: "overview", label: "Procurement Overview" },
            { id: "vendors", label: "Vendor Spend Distribution" },
            { id: "trends", label: "Monthly Procurement Trends" },
            { id: "register", label: "Purchase Invoices Register" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--accent)" : "inherit",
              fontWeight: activeTab === tab.id ? "600" : "400",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
          Loading procurement data...
        </div>
      )}

      {error && (
        <div style={{ padding: "16px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", borderRadius: "6px" }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "14px" }}>Top Vendors by Spend</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "8px" }}>Supplier</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Bills</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Spend</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vendorDistribution.slice(0, 5).map((v) => (
                      <tr key={v.supplierId} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px", fontWeight: "500" }}>{v.supplierName}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{v.count}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>₹{v.spend.toFixed(2)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: v.outstanding > 0 ? "#ea580c" : "inherit" }}>
                          ₹{v.outstanding.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {data.vendorDistribution.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "var(--muted)" }}>
                          No vendor data found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
                <h3 style={{ fontSize: "1rem", marginBottom: "14px" }}>Recent Purchase Invoices</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "8px" }}>Date</th>
                      <th style={{ padding: "8px" }}>Invoice #</th>
                      <th style={{ padding: "8px" }}>Supplier</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.slice(0, 5).map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px" }}>{p.invoiceDate}</td>
                        <td style={{ padding: "8px", fontWeight: "500" }}>{p.invoiceNumber}</td>
                        <td style={{ padding: "8px" }}>{p.supplierName}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>₹{p.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    {data.purchases.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "var(--muted)" }}>
                          No purchases recorded in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: VENDORS */}
          {activeTab === "vendors" && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "14px" }}>Supplier Spend & Outstanding Balance</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "10px" }}>Supplier Name</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Bills Received</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Total Spend</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>% of Total Spend</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Current Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendorDistribution.map((v) => {
                    const share = data.metrics.totalProcurement > 0 ? (v.spend / data.metrics.totalProcurement) * 100 : 0;
                    return (
                      <tr key={v.supplierId} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px", fontWeight: "500" }}>{v.supplierName}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{v.count}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: "bold" }}>₹{v.spend.toFixed(2)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{share.toFixed(1)}%</td>
                        <td style={{ padding: "10px", textAlign: "right", color: v.outstanding > 0 ? "#ea580c" : "inherit", fontWeight: v.outstanding > 0 ? "600" : "normal" }}>
                          ₹{v.outstanding.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  {data.vendorDistribution.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                        No supplier spend data found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: MONTHLY TRENDS */}
          {activeTab === "trends" && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "14px" }}>Month-over-Month Procurement</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "10px" }}>Month</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Invoices Count</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Total Tax (ITC)</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Total Spend</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Average / Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthlyTrends.map((t) => {
                    const avg = t.invoiceCount > 0 ? t.totalSpend / t.invoiceCount : 0;
                    return (
                      <tr key={t.month} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px", fontWeight: "500" }}>{t.month}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{t.invoiceCount}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: "#16a34a" }}>₹{t.totalTax.toFixed(2)}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: "bold" }}>₹{t.totalSpend.toFixed(2)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>₹{avg.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {data.monthlyTrends.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                        No monthly procurement trend data found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: REGISTER */}
          {activeTab === "register" && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "16px" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: "14px" }}>Itemized Purchase Invoices Register</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "10px" }}>Date</th>
                    <th style={{ padding: "10px" }}>Invoice #</th>
                    <th style={{ padding: "10px" }}>Supplier</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Items</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Taxable Subtotal</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Tax Amount</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchases.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "10px" }}>{p.invoiceDate}</td>
                      <td style={{ padding: "10px", fontWeight: "500" }}>{p.invoiceNumber}</td>
                      <td style={{ padding: "10px" }}>{p.supplierName}</td>
                      <td style={{ padding: "10px", textAlign: "right" }}>{p.linesCount}</td>
                      <td style={{ padding: "10px", textAlign: "right" }}>₹{p.subtotal.toFixed(2)}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#16a34a" }}>₹{p.tax.toFixed(2)}</td>
                      <td style={{ padding: "10px", textAlign: "right", fontWeight: "bold" }}>₹{p.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {data.purchases.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
                        No purchase invoices found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

