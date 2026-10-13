/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";

type MainCategory = "sales" | "purchase" | "inventory" | "gst" | "pl" | "dayclose";

export function ReportsWorkspace() {
  const [category, setCategory] = useState<MainCategory>("sales");
  const [subReport, setSubReport] = useState("day-book");
  const [period, setPeriod] = useState<"this-month" | "last-month" | "today" | "custom">("this-month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize date range based on period
  useEffect(() => {
    const now = new Date();
    if (period === "today") {
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (period === "this-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (period === "last-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      setStartDate(firstDay);
      setEndDate(lastDay);
    }
  }, [period]);

  // Adjust subReport when switching category
  function selectCategory(cat: MainCategory) {
    setCategory(cat);
    if (cat === "sales") setSubReport("day-book");
    else if (cat === "purchase") setSubReport("day-book");
    else if (cat === "inventory") setSubReport("valuation");
    else if (cat === "gst") setSubReport("gstr-1");
    else if (cat === "pl") setSubReport("pl");
    else if (cat === "dayclose") setSubReport("dayclose");
  }

  async function loadReportData() {
    setLoading(true);
    setError(null);
    try {
      let endpoint = "";
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      if (category === "sales") {
        params.set("subReport", subReport);
        endpoint = `/api/reports/sales?${params.toString()}`;
      } else if (category === "purchase") {
        params.set("subReport", subReport);
        endpoint = `/api/reports/purchases?${params.toString()}`;
      } else if (category === "inventory") {
        params.set("type", subReport);
        endpoint = `/api/reports/inventory?${params.toString()}`;
      } else if (category === "gst") {
        endpoint = `/api/reports/gst?${params.toString()}`;
      } else if (category === "pl" || category === "dayclose") {
        endpoint = `/api/reports/financial?${params.toString()}`;
      }

      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`Failed to load report data: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startDate && endDate) {
      void loadReportData();
    }
  }, [category, subReport, startDate, endDate]);

  function exportCsv() {
    if (!data) return;
    let csvContent = "data:text/csv;charset=utf-8,";

    if (category === "sales" && subReport === "day-book" && data.invoices) {
      csvContent += "Date,Invoice Number,Customer,Payment Mode,Subtotal,Discount,Tax,Total\n";
      data.invoices.forEach((inv: any) => {
        csvContent += `"${inv.date}","${inv.invoiceNumber}","${inv.partyName}","${inv.paymentMethod}",${inv.subtotal},${inv.discount},${inv.tax},${inv.total}\n`;
      });
    } else if (category === "sales" && subReport === "item-wise" && data.items) {
      csvContent += "Medicine,Batch,HSN,GST %,Quantity Sold,Total Tax,Total Revenue\n";
      data.items.forEach((item: any) => {
        csvContent += `"${item.medicineName}","${item.batchNumber}","${item.hsn || ""}","${item.gstRate}%",${item.quantitySold},${item.totalTax},${item.totalRevenue}\n`;
      });
    } else if (category === "purchase" && subReport === "day-book" && data.invoices) {
      csvContent += "Date,Invoice Number,Supplier,Subtotal,Tax,Total,Paid,Balance\n";
      data.invoices.forEach((inv: any) => {
        csvContent += `"${inv.date}","${inv.invoiceNumber}","${inv.supplierName}",${inv.subtotal},${inv.tax},${inv.total},${inv.paid},${inv.balance}\n`;
      });
    } else if (category === "inventory" && subReport === "valuation" && data.items) {
      csvContent += "Medicine,Batch,Expiry,Stock,Purchase Rate,MRP,Cost Value,MRP Value,Potential Margin %\n";
      data.items.forEach((item: any) => {
        csvContent += `"${item.medicineName}","${item.batchNumber}","${item.expiryDate}",${item.stock},${item.purchaseRate},${item.mrp},${item.costValue},${item.mrpValue},"${item.marginPercent}%"\n`;
      });
    } else {
      csvContent += "Export not available for this view\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pillbills-report-${category}-${subReport}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printReport() {
    window.print();
  }

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reporting & Analytics</p>
          <h1>Reports Hub</h1>
          <p>Sales, purchase, stock, GST tax registers, and financial P&L statements.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="secondary-button" onClick={exportCsv} disabled={loading || !data}>
            Export CSV
          </button>
          <button className="primary-button" onClick={printReport} disabled={loading || !data}>
            Print Report
          </button>
        </div>
      </div>

      {/* Date & Period Controls */}
      <div className="filter-card" style={{ marginBottom: "16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className={`pill-btn ${period === "today" ? "active" : ""}`}
            onClick={() => setPeriod("today")}
          >
            Today
          </button>
          <button
            className={`pill-btn ${period === "this-month" ? "active" : ""}`}
            onClick={() => setPeriod("this-month")}
          >
            This Month
          </button>
          <button
            className={`pill-btn ${period === "last-month" ? "active" : ""}`}
            onClick={() => setPeriod("last-month")}
          >
            Last Month
          </button>
          <button
            className={`pill-btn ${period === "custom" ? "active" : ""}`}
            onClick={() => setPeriod("custom")}
          >
            Custom
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPeriod("custom");
              setStartDate(e.target.value);
            }}
            style={{ padding: "6px 8px", borderRadius: "5px", border: "1px solid var(--line)", fontSize: "0.82rem" }}
          />
          <label style={{ fontSize: "0.78rem", color: "var(--muted)" }}>To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPeriod("custom");
              setEndDate(e.target.value);
            }}
            style={{ padding: "6px 8px", borderRadius: "5px", border: "1px solid var(--line)", fontSize: "0.82rem" }}
          />
          <button className="secondary-button" onClick={() => void loadReportData()} style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="tab-group" style={{ display: "flex", gap: "6px", borderBottom: "2px solid var(--line)", marginBottom: "16px", overflowX: "auto" }}>
        <button className={`tab-button ${category === "sales" ? "active" : ""}`} onClick={() => selectCategory("sales")}>
          Sales
        </button>
        <button className={`tab-button ${category === "purchase" ? "active" : ""}`} onClick={() => selectCategory("purchase")}>
          Purchase
        </button>
        <button className={`tab-button ${category === "inventory" ? "active" : ""}`} onClick={() => selectCategory("inventory")}>
          Inventory
        </button>
        <button className={`tab-button ${category === "gst" ? "active" : ""}`} onClick={() => selectCategory("gst")}>
          GST / GSTR
        </button>
        <button className={`tab-button ${category === "pl" ? "active" : ""}`} onClick={() => selectCategory("pl")}>
          Profit & Loss
        </button>
        <button className={`tab-button ${category === "dayclose" ? "active" : ""}`} onClick={() => selectCategory("dayclose")}>
          Day Close
        </button>
      </div>

      {/* Sub-Report Navigation */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {category === "sales" && (
          <>
            <button className={`sub-tab-btn ${subReport === "day-book" ? "active" : ""}`} onClick={() => setSubReport("day-book")}>
              Sales Day Book
            </button>
            <button className={`sub-tab-btn ${subReport === "item-wise" ? "active" : ""}`} onClick={() => setSubReport("item-wise")}>
              Item-wise Sales
            </button>
            <button className={`sub-tab-btn ${subReport === "party-wise" ? "active" : ""}`} onClick={() => setSubReport("party-wise")}>
              Party-wise Sales
            </button>
            <button className={`sub-tab-btn ${subReport === "discount-analysis" ? "active" : ""}`} onClick={() => setSubReport("discount-analysis")}>
              Discount Analysis
            </button>
          </>
        )}

        {category === "purchase" && (
          <>
            <button className={`sub-tab-btn ${subReport === "day-book" ? "active" : ""}`} onClick={() => setSubReport("day-book")}>
              Purchase Day Book
            </button>
            <button className={`sub-tab-btn ${subReport === "item-wise" ? "active" : ""}`} onClick={() => setSubReport("item-wise")}>
              Item-wise Purchases
            </button>
            <button className={`sub-tab-btn ${subReport === "party-wise" ? "active" : ""}`} onClick={() => setSubReport("party-wise")}>
              Party-wise Purchases
            </button>
            <button className={`sub-tab-btn ${subReport === "vendor-analytics" ? "active" : ""}`} onClick={() => setSubReport("vendor-analytics")}>
              Vendor Analytics
            </button>
          </>
        )}

        {category === "inventory" && (
          <>
            <button className={`sub-tab-btn ${subReport === "valuation" ? "active" : ""}`} onClick={() => setSubReport("valuation")}>
              Stock Valuation
            </button>
            <button className={`sub-tab-btn ${subReport === "velocity" ? "active" : ""}`} onClick={() => setSubReport("velocity")}>
              Fast & Slow Moving
            </button>
            <button className={`sub-tab-btn ${subReport === "reorder" ? "active" : ""}`} onClick={() => setSubReport("reorder")}>
              Reorder Alerts
            </button>
          </>
        )}

        {category === "gst" && (
          <>
            <button className={`sub-tab-btn ${subReport === "gstr-1" ? "active" : ""}`} onClick={() => setSubReport("gstr-1")}>
              GSTR-1 (Outward)
            </button>
            <button className={`sub-tab-btn ${subReport === "gstr-2" ? "active" : ""}`} onClick={() => setSubReport("gstr-2")}>
              GSTR-2 (Inward ITC)
            </button>
            <button className={`sub-tab-btn ${subReport === "gstr-3b" ? "active" : ""}`} onClick={() => setSubReport("gstr-3b")}>
              GSTR-3B Summary
            </button>
            <button className={`sub-tab-btn ${subReport === "hsn" ? "active" : ""}`} onClick={() => setSubReport("hsn")}>
              HSN Summary
            </button>
          </>
        )}
      </div>

      {error && <div className="error-card" style={{ marginBottom: "16px" }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading report records…</div>
      ) : !data ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Select parameters to generate report.</div>
      ) : (
        <div className="report-content">
          {/* SALES: Day Book */}
          {category === "sales" && subReport === "day-book" && (
            <div>
              <div className="metric-grid" style={{ marginBottom: "16px" }}>
                <article><span>Total Sales</span><strong>₹{data.metrics?.totalSales?.toFixed(2) || "0.00"}</strong><small>{data.metrics?.invoiceCount || 0} bills</small></article>
                <article><span>Taxable Value</span><strong>₹{data.metrics?.totalTaxable?.toFixed(2) || "0.00"}</strong><small>Net merchandise</small></article>
                <article><span>Total Tax</span><strong>₹{data.metrics?.totalTax?.toFixed(2) || "0.00"}</strong><small>GST collected</small></article>
                <article><span>Cash / Digital</span><strong>₹{data.metrics?.cashSales?.toFixed(2)} / ₹{data.metrics?.digitalSales?.toFixed(2)}</strong><small>Collections</small></article>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Payment</th>
                    <th style={{ textAlign: "right" }}>Subtotal</th>
                    <th style={{ textAlign: "right" }}>Discount</th>
                    <th style={{ textAlign: "right" }}>Tax</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices?.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No invoices found in this date range.</td></tr>
                  ) : (
                    data.invoices?.map((inv: any) => (
                      <tr key={inv.id}>
                        <td>{inv.date} <small style={{ color: "var(--muted)" }}>{inv.time}</small></td>
                        <td><strong>{inv.invoiceNumber}</strong></td>
                        <td>{inv.partyName}</td>
                        <td><span className="badge">{inv.paymentMethod}</span></td>
                        <td style={{ textAlign: "right" }}>₹{inv.subtotal.toFixed(2)}</td>
                        <td style={{ textAlign: "right", color: inv.discount > 0 ? "#16a34a" : "inherit" }}>₹{inv.discount.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>₹{inv.tax.toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{inv.total.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SALES: Item-wise */}
          {category === "sales" && subReport === "item-wise" && (
            <div>
              <div className="metric-grid" style={{ marginBottom: "16px" }}>
                <article><span>Unique Items Sold</span><strong>{data.metrics?.uniqueSkus || 0}</strong><small>Distinct medicines</small></article>
                <article><span>Units Sold</span><strong>{data.metrics?.totalItemsSold || 0}</strong><small>Packs dispensed</small></article>
                <article><span>Total Revenue</span><strong>₹{data.metrics?.totalSales?.toFixed(2) || "0.00"}</strong><small>Gross sales</small></article>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch</th>
                    <th>HSN</th>
                    <th>GST %</th>
                    <th style={{ textAlign: "right" }}>Qty Sold</th>
                    <th style={{ textAlign: "right" }}>Tax</th>
                    <th style={{ textAlign: "right" }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items?.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>No item sales found.</td></tr>
                  ) : (
                    data.items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td><strong>{item.medicineName}</strong></td>
                        <td>{item.batchNumber}</td>
                        <td>{item.hsn || "—"}</td>
                        <td>{item.gstRate}%</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>{item.quantitySold}</td>
                        <td style={{ textAlign: "right" }}>₹{item.totalTax.toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{item.totalRevenue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* PURCHASES: Day Book */}
          {category === "purchase" && subReport === "day-book" && (
            <div>
              <div className="metric-grid" style={{ marginBottom: "16px" }}>
                <article><span>Total Procurement</span><strong>₹{data.metrics?.totalPurchases?.toFixed(2) || "0.00"}</strong><small>{data.metrics?.invoiceCount || 0} bills</small></article>
                <article><span>Taxable Spend</span><strong>₹{data.metrics?.totalTaxable?.toFixed(2) || "0.00"}</strong><small>Net purchase</small></article>
                <article><span>Input Tax (ITC)</span><strong>₹{data.metrics?.totalTax?.toFixed(2) || "0.00"}</strong><small>GST paid</small></article>
                <article><span>Unpaid Bills</span><strong>{data.metrics?.unpaidBillsCount || 0}</strong><small>Pending payments</small></article>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice Date</th>
                    <th>Invoice #</th>
                    <th>Supplier Name</th>
                    <th style={{ textAlign: "right" }}>Taxable</th>
                    <th style={{ textAlign: "right" }}>GST</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Paid</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices?.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No purchase invoices found in this period.</td></tr>
                  ) : (
                    data.invoices?.map((inv: any) => (
                      <tr key={inv.id}>
                        <td>{inv.date}</td>
                        <td><strong>{inv.invoiceNumber}</strong></td>
                        <td>{inv.supplierName}</td>
                        <td style={{ textAlign: "right" }}>₹{inv.subtotal.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>₹{inv.tax.toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{inv.total.toFixed(2)}</td>
                        <td style={{ textAlign: "right", color: "#16a34a" }}>₹{inv.paid.toFixed(2)}</td>
                        <td style={{ textAlign: "right", color: inv.balance > 0 ? "#dc2626" : "inherit", fontWeight: "bold" }}>₹{inv.balance.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* INVENTORY: Valuation */}
          {category === "inventory" && subReport === "valuation" && (
            <div>
              <div className="metric-grid" style={{ marginBottom: "16px" }}>
                <article><span>Total Stock Cost</span><strong>₹{data.totals?.totalCost?.toFixed(2) || "0.00"}</strong><small>Purchase valuation</small></article>
                <article><span>Total MRP Value</span><strong>₹{data.totals?.totalMrp?.toFixed(2) || "0.00"}</strong><small>Retail valuation</small></article>
                <article><span>Potential Profit</span><strong>₹{data.totals?.potentialProfit?.toFixed(2) || "0.00"}</strong><small>Unrealized margin</small></article>
                <article><span>Overall Margin</span><strong>{data.totals?.overallMarginPercent?.toFixed(2) || 0}%</strong><small>Average markup</small></article>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th style={{ textAlign: "right" }}>Stock</th>
                    <th style={{ textAlign: "right" }}>Cost Rate</th>
                    <th style={{ textAlign: "right" }}>MRP</th>
                    <th style={{ textAlign: "right" }}>Cost Value</th>
                    <th style={{ textAlign: "right" }}>MRP Value</th>
                    <th style={{ textAlign: "right" }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items?.map((item: any) => (
                    <tr key={item.batchId}>
                      <td><strong>{item.medicineName}</strong></td>
                      <td>{item.batchNumber}</td>
                      <td>{item.expiryDate}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>{item.stock}</td>
                      <td style={{ textAlign: "right" }}>₹{item.purchaseRate.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>₹{item.mrp.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>₹{item.costValue.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>₹{item.mrpValue.toFixed(2)}</td>
                      <td style={{ textAlign: "right", color: item.marginPercent > 0 ? "#16a34a" : "inherit" }}>{item.marginPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* GST / GSTR REPORT */}
          {category === "gst" && (
            <div>
              <div className="metric-grid" style={{ marginBottom: "16px" }}>
                <article><span>Outward Tax (Liability)</span><strong>₹{data.gstr3b?.outwardTax?.toFixed(2) || "0.00"}</strong><small>CGST + SGST</small></article>
                <article><span>Eligible ITC</span><strong>₹{data.gstr3b?.eligibleItc?.toFixed(2) || "0.00"}</strong><small>Input credit from purchases</small></article>
                <article><span>Net GST Payable</span><strong style={{ color: data.gstr3b?.netPayable > 0 ? "#dc2626" : "#16a34a" }}>₹{data.gstr3b?.netPayable?.toFixed(2) || "0.00"}</strong><small>Tax dues</small></article>
                <article><span>Store GSTIN</span><strong>{data.storeGstin}</strong><small>{data.gstScheme}</small></article>
              </div>

              {subReport === "gstr-1" && (
                <div>
                  <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>B2B Registered Supplies (With Customer GSTIN)</h3>
                  <table className="data-table" style={{ marginBottom: "20px" }}>
                    <thead>
                      <tr><th>GSTIN</th><th>Party Name</th><th>Invoices</th><th style={{ textAlign: "right" }}>Taxable</th><th style={{ textAlign: "right" }}>CGST</th><th style={{ textAlign: "right" }}>SGST</th><th style={{ textAlign: "right" }}>Total Value</th></tr>
                    </thead>
                    <tbody>
                      {data.gstr1?.b2b?.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>No B2B sales recorded in this period.</td></tr>
                      ) : (
                        data.gstr1?.b2b?.map((b: any) => (
                          <tr key={b.gstin}>
                            <td><code>{b.gstin}</code></td><td>{b.partyName}</td><td>{b.invoiceCount}</td>
                            <td style={{ textAlign: "right" }}>₹{b.taxable.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{b.cgst.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{b.sgst.toFixed(2)}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{b.total.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>B2C Unregistered / Walk-in Supplies (By Rate Slab)</h3>
                  <table className="data-table">
                    <thead><tr><th>GST Rate Slab</th><th style={{ textAlign: "right" }}>Taxable Amount</th><th style={{ textAlign: "right" }}>CGST</th><th style={{ textAlign: "right" }}>SGST</th><th style={{ textAlign: "right" }}>Total Value</th></tr></thead>
                    <tbody>
                      {data.gstr1?.b2c?.map((s: any) => (
                        <tr key={s.gstRate}>
                          <td><strong>{s.gstRate}% GST</strong></td>
                          <td style={{ textAlign: "right" }}>₹{s.taxable.toFixed(2)}</td>
                          <td style={{ textAlign: "right" }}>₹{s.cgst.toFixed(2)}</td>
                          <td style={{ textAlign: "right" }}>₹{s.sgst.toFixed(2)}</td>
                          <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{s.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {subReport === "gstr-3b" && (
                <div style={{ background: "var(--panel)", padding: "20px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                  <h3 style={{ fontSize: "1.05rem", marginBottom: "12px" }}>GSTR-3B Monthly Return Computation</h3>
                  <table className="data-table">
                    <thead>
                      <tr><th>Tax Head</th><th style={{ textAlign: "right" }}>Outward Liability</th><th style={{ textAlign: "right" }}>Input Tax Credit (ITC)</th><th style={{ textAlign: "right" }}>Net Payable</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>Central Tax (CGST)</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.outwardCgst?.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.itcCgst?.toFixed(2)}</td><td style={{ textAlign: "right", fontWeight: "bold" }}>₹{(Math.max(0, (data.gstr3b?.outwardCgst || 0) - (data.gstr3b?.itcCgst || 0))).toFixed(2)}</td></tr>
                      <tr><td>State Tax (SGST)</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.outwardSgst?.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.itcSgst?.toFixed(2)}</td><td style={{ textAlign: "right", fontWeight: "bold" }}>₹{(Math.max(0, (data.gstr3b?.outwardSgst || 0) - (data.gstr3b?.itcSgst || 0))).toFixed(2)}</td></tr>
                      <tr style={{ fontWeight: "bold", background: "rgba(0,0,0,0.03)" }}><td>Total Tax Due</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.outwardTax?.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{data.gstr3b?.eligibleItc?.toFixed(2)}</td><td style={{ textAlign: "right", color: "#dc2626" }}>₹{data.gstr3b?.netPayable?.toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}

              {subReport === "hsn" && (
                <div>
                  <h3 style={{ fontSize: "1rem", marginBottom: "8px" }}>HSN-wise Summary of Outward Supplies</h3>
                  <table className="data-table">
                    <thead><tr><th>HSN Code</th><th>Description</th><th style={{ textAlign: "right" }}>Quantity</th><th style={{ textAlign: "right" }}>Taxable</th><th style={{ textAlign: "right" }}>GST Tax</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                    <tbody>
                      {data.hsnSummary?.map((h: any) => (
                        <tr key={h.hsn}>
                          <td><code>{h.hsn}</code></td><td>{h.description}</td><td style={{ textAlign: "right" }}>{h.totalQuantity}</td>
                          <td style={{ textAlign: "right" }}>₹{h.taxableValue.toFixed(2)}</td><td style={{ textAlign: "right" }}>₹{h.totalTax.toFixed(2)}</td>
                          <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{h.totalValue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PROFIT & LOSS */}
          {category === "pl" && (
            <div style={{ maxWidth: "800px", margin: "0 auto" }}>
              <div className="metric-grid" style={{ marginBottom: "20px" }}>
                <article><span>Net Revenue</span><strong>₹{data.profitAndLoss?.netSalesRevenue?.toFixed(2)}</strong><small>Gross less returns</small></article>
                <article><span>Gross Profit</span><strong>₹{data.profitAndLoss?.grossProfit?.toFixed(2)}</strong><small>{data.profitAndLoss?.grossMarginPercent}% margin</small></article>
                <article><span>Net Operating Profit</span><strong style={{ color: data.profitAndLoss?.netOperatingProfit >= 0 ? "#16a34a" : "#dc2626" }}>₹{data.profitAndLoss?.netOperatingProfit?.toFixed(2)}</strong><small>{data.profitAndLoss?.netProfitMarginPercent}% net</small></article>
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
                <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--line)", paddingBottom: "10px", marginBottom: "16px" }}>
                  Statement of Profit and Loss
                </h2>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span>Gross Sales</span>
                  <span>₹{data.profitAndLoss?.grossSales?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "#dc2626" }}>
                  <span>Less: Sales Returns</span>
                  <span>(-) ₹{data.profitAndLoss?.salesReturns?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: "bold", borderTop: "1px dashed var(--line)", borderBottom: "1px dashed var(--line)" }}>
                  <span>Net Sales Revenue</span>
                  <span>₹{data.profitAndLoss?.netSalesRevenue?.toFixed(2)}</span>
                </div>

                <div style={{ marginTop: "16px", marginBottom: "8px", fontWeight: "bold", color: "var(--muted)", textTransform: "uppercase", fontSize: "0.75rem" }}>
                  Cost of Goods Sold (COGS)
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 6px 12px" }}>
                  <span>Opening Stock (Cost)</span>
                  <span>₹{data.profitAndLoss?.openingStockCost?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 6px 12px" }}>
                  <span>Add: Net Purchases</span>
                  <span>(+) ₹{data.profitAndLoss?.netPurchasesCost?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 6px 12px", color: "var(--muted)" }}>
                  <span>Less: Closing Stock (Cost)</span>
                  <span>(-) ₹{data.profitAndLoss?.closingStockCost?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: "bold", borderTop: "1px dashed var(--line)" }}>
                  <span>Total Cost of Goods Sold</span>
                  <span>₹{data.profitAndLoss?.cogs?.toFixed(2)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: "bold", fontSize: "1.05rem", background: "rgba(22, 163, 74, 0.08)", borderRadius: "6px", margin: "12px 0", paddingLeft: "8px", paddingRight: "8px" }}>
                  <span>Gross Profit</span>
                  <span style={{ color: "#16a34a" }}>₹{data.profitAndLoss?.grossProfit?.toFixed(2)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span>Operating Expenses (from Vouchers)</span>
                  <span style={{ color: "#dc2626" }}>(-) ₹{data.profitAndLoss?.operatingExpenses?.toFixed(2)}</span>
                </div>
                {data.profitAndLoss?.otherIncome > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span>Other Income</span>
                    <span style={{ color: "#16a34a" }}>(+) ₹{data.profitAndLoss?.otherIncome?.toFixed(2)}</span>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: "bold", fontSize: "1.15rem", borderTop: "2px solid var(--line)", marginTop: "12px" }}>
                  <span>Net Operating Profit</span>
                  <span style={{ color: data.profitAndLoss?.netOperatingProfit >= 0 ? "#16a34a" : "#dc2626" }}>
                    ₹{data.profitAndLoss?.netOperatingProfit?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* DAY CLOSE CASH */}
          {category === "dayclose" && (
            <div style={{ maxWidth: "700px", margin: "0 auto" }}>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "8px", padding: "20px" }}>
                <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--line)", paddingBottom: "10px", marginBottom: "16px" }}>
                  Day Close Cash Register Summary ({data.dayCloseSummary?.date})
                </h2>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                  <span>Opening Cash Balance</span>
                  <span style={{ fontWeight: "bold" }}>₹{data.dayCloseSummary?.totalOpeningCash?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", color: "#16a34a" }}>
                  <span>Total Cash Inflows (+)</span>
                  <span>+ ₹{data.dayCloseSummary?.cashInflows?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", color: "#dc2626" }}>
                  <span>Total Cash Outflows (-)</span>
                  <span>- ₹{data.dayCloseSummary?.cashOutflows?.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderTop: "2px solid var(--line)", marginTop: "10px", fontWeight: "bold", fontSize: "1.15rem" }}>
                  <span>Expected Drawer Cash Balance</span>
                  <span style={{ color: "var(--accent)" }}>₹{data.dayCloseSummary?.expectedClosingCash?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

