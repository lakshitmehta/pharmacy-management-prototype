"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Supplier = { id: string; name: string; code: string | null; contactName: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; active: boolean; balance: number; purchaseCount: number };
const emptyForm = { name: "", code: "", contactName: "", phone: "", email: "", gstin: "", address: "", active: true };

export function SupplierManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"name" | "balance" | "purchases">("name");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/suppliers?search=${encodeURIComponent(search)}&status=${status === "all" ? "" : status}`)
      .then((response) => response.json())
      .then((result) => { if (result.suppliers) setSuppliers(result.suppliers); });
  }, [search, status]);

  const sorted = useMemo(() => [...suppliers].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "balance" ? b.balance - a.balance : b.purchaseCount - a.purchaseCount), [suppliers, sort]);
  const activeCount = suppliers.filter((supplier) => supplier.active).length;
  const totalBalance = suppliers.reduce((sum, supplier) => sum + supplier.balance, 0);

  function updateField(field: keyof typeof emptyForm, value: string | boolean) { setForm((current) => ({ ...current, [field]: value })); }
  function beginEdit(supplier: Supplier) { setEditingId(supplier.id); setForm({ name: supplier.name, code: supplier.code ?? "", contactName: supplier.contactName ?? "", phone: supplier.phone ?? "", email: supplier.email ?? "", gstin: supplier.gstin ?? "", address: supplier.address ?? "", active: supplier.active }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function resetForm() { setEditingId(null); setForm(emptyForm); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(""); setError("");
    const response = await fetch(editingId ? `/api/suppliers/${editingId}` : "/api/suppliers", { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to save supplier."); return; }
    setNotice(editingId ? "Supplier updated." : "Supplier registered."); resetForm();
    const refreshed = await fetch(`/api/suppliers?search=${encodeURIComponent(search)}&status=${status === "all" ? "" : status}`);
    const refreshedResult = await refreshed.json();
    if (refreshed.ok) setSuppliers(refreshedResult.suppliers);
  }

  async function remove(supplier: Supplier) {
    if (!window.confirm(`Delete ${supplier.name}? Suppliers with transaction history must be marked inactive instead.`)) return;
    const response = await fetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to delete supplier."); return; }
    const refreshed = await fetch(`/api/suppliers?search=${encodeURIComponent(search)}&status=${status === "all" ? "" : status}`);
    const refreshedResult = await refreshed.json();
    if (refreshed.ok) setSuppliers(refreshedResult.suppliers);
    setNotice("Supplier deleted.");
  }

  return <section className="module-page supplier-page"><div className="page-heading"><div><p className="eyebrow">Stock & purchase</p><h1>Suppliers Profile</h1><p>Register and manage supplier contact profiles. Purchasing history and payable balance stay attached to each vendor.</p></div><span className="section-signal">{suppliers.length} suppliers</span></div>
    <div className="metric-grid supplier-metrics"><article><span>Total suppliers</span><strong>{suppliers.length}</strong><small>Registered vendors</small></article><article><span>Active vendors</span><strong>{activeCount}</strong><small>Available for purchasing</small></article><article><span>Outstanding balance</span><strong>₹{totalBalance.toFixed(2)}</strong><small>From supplier ledger</small></article><article><span>Sort mode</span><strong>{sort === "name" ? "A-Z" : sort === "balance" ? "Debt" : "Bills"}</strong><small>Current list ordering</small></article></div>
    <div className="supplier-layout"><form className="work-panel supplier-form" onSubmit={submit}><div className="panel-header"><div><p className="panel-kicker">{editingId ? "Edit profile" : "New vendor"}</p><h2>{editingId ? "Edit supplier" : "Register supplier"}</h2></div>{editingId ? <button type="button" className="text-button" onClick={resetForm}>Discard</button> : null}</div><label>Company name *<input value={form.name} onChange={(event) => updateField("name", event.target.value)} required /></label><div className="form-grid"><label>Contact person<input value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} /></label><label>Contact phone *<input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required /></label><label>Supplier code<input value={form.code} onChange={(event) => updateField("code", event.target.value)} /></label><label>GSTIN<input value={form.gstin} onChange={(event) => updateField("gstin", event.target.value)} /></label><label>Email<input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} /></label><label>Status<select value={form.active ? "active" : "inactive"} onChange={(event) => updateField("active", event.target.value === "active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><label>Physical address<textarea value={form.address} onChange={(event) => updateField("address", event.target.value)} rows={3} /></label>{error ? <p className="form-error">{error}</p> : null}{notice ? <p className="form-success">{notice}</p> : null}<button className="primary-button" type="submit">{editingId ? "Save supplier" : "Confirm registration"}</button></form>
      <div className="work-panel supplier-list"><div className="panel-header"><div><p className="panel-kicker">Supplier registry</p><h2>Wholesale suppliers</h2></div><div style={{ display: "flex", gap: "8px" }}><a className="secondary-button" href="/api/export/suppliers" download style={{ textDecoration: "none", fontSize: "0.82rem", padding: "4px 8px" }}>CSV Export</a><Link className="secondary-button" href="/backup" style={{ textDecoration: "none", fontSize: "0.82rem", padding: "4px 8px" }}>Bulk Import</Link></div></div><div className="filter-row"><input placeholder="Search name, code, phone, GSTIN..." value={search} onChange={(event) => setSearch(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="name">Name A-Z</option><option value="balance">Balance</option><option value="purchases">Bills</option></select></div><div className="supplier-cards">{sorted.map((supplier) => <article className="supplier-card" key={supplier.id}><div className="supplier-card-head"><div><h3>{supplier.name}</h3><span>{supplier.code || "Auto-coded supplier"}</span></div><span className={supplier.active ? "status-badge active" : "status-badge inactive"}>{supplier.active ? "Active" : "Inactive"}</span></div><div className="supplier-card-grid"><span>Contact<strong>{supplier.contactName || "Not listed"}</strong></span><span>Phone<strong>{supplier.phone || "Not listed"}</strong></span><span>GSTIN<strong>{supplier.gstin || "Unspecified"}</strong></span><span>Balance<strong>₹{supplier.balance.toFixed(2)}</strong></span></div><div className="supplier-card-foot"><span>{supplier.purchaseCount} purchase bills</span><div><button className="text-button" onClick={() => beginEdit(supplier)}>Edit</button><button className="text-button danger" onClick={() => remove(supplier)}>Delete</button></div></div></article>)}{sorted.length === 0 ? <div className="empty-state">No suppliers match the current filter.</div> : null}</div></div></div>
  </section>;
}
