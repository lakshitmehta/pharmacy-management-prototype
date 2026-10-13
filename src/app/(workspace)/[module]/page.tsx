import { redirect } from "next/navigation";

const moduleDetails: Record<string, { eyebrow: string; title: string; description: string; signal: string }> = {
  dashboard: { eyebrow: "Today at a glance", title: "Dashboard", description: "Sales, inventory health, and day-close signals will be derived from your store ledger.", signal: "Operational overview" },
  billing: { eyebrow: "Counter", title: "Billing & POS", description: "Build a bill with batch-aware medicine search, customer details, discounts, tax, and payment method.", signal: "POS workspace" },
  inventory: { eyebrow: "Counter", title: "Medicine Inventory", description: "Manage medicines, batches, stock thresholds, expiry, barcode actions, and inventory movements.", signal: "Batch ledger" },
  sales: { eyebrow: "Counter", title: "Sales View", description: "Search invoices, inspect payment modes, and export sales registers.", signal: "Sales ledger" },
  returns: { eyebrow: "Counter", title: "Returns & Exchange", description: "Validate invoice-linked returns and exchanges before posting stock and financial adjustments.", signal: "Controlled adjustments" },
  suppliers: { eyebrow: "Stock & purchase", title: "Suppliers Profile", description: "Register and manage supplier contact profiles and purchasing relationships.", signal: "Supplier registry" },
  expiry: { eyebrow: "Stock & purchase", title: "Expiry Ledger", description: "Review expired, near-expiry, and healthy batches with supplier coordination actions.", signal: "Clearance review" },
  "purchase-orders": { eyebrow: "Stock & purchase", title: "Purchase Orders", description: "Create purchase agreements and receive supplier invoices into inventory and payables.", signal: "Procurement" },
  "supplier-notes": { eyebrow: "Stock & purchase", title: "Credit / Debit Notes", description: "Track supplier returns, expiry claims, and payable adjustments.", signal: "Supplier adjustments" },
  "purchase-reports": { eyebrow: "Stock & purchase", title: "Purchase Reports", description: "Review payables analytics, aging, and monthly procurement summaries.", signal: "Procurement analytics" },
  payables: { eyebrow: "Banking & payments", title: "Accounts Payable", description: "Settle outstanding supplier bills and inspect payment audit history.", signal: "Supplier balances" },
  payments: { eyebrow: "Banking & payments", title: "Payments", description: "Record supplier payment transactions with FIFO allocation to oldest bills.", signal: "Payment transaction" },
  "bank-book": { eyebrow: "Banking & payments", title: "Bank & Cash Book", description: "Review cash, bank, UPI, transfers, and source-linked entries.", signal: "Cash position" },
  "voucher-entry": { eyebrow: "Banking & payments", title: "Voucher Entry", description: "Post balanced payment, receipt, journal, and contra vouchers.", signal: "Double-entry books" },
  reports: { eyebrow: "Reports", title: "Reports Hub", description: "Sales, purchase, stock, GST, management, accounting, and financial reports.", signal: "Reporting center" },
  customers: { eyebrow: "Customers", title: "Customers Registry", description: "Manage customer profiles, contact information, notes, and invoice records.", signal: "Customer registry" },
  khata: { eyebrow: "Customers", title: "Customer Udhaar / Khata", description: "Track credit balances and allocate customer receipts FIFO.", signal: "Customer ledger" },
  settings: { eyebrow: "Admin", title: "System Settings", description: "Configure store details, invoice numbering, backups, devices, alerts, and licensing.", signal: "Store control" },
  backup: { eyebrow: "Admin", title: "Data & Disaster Recovery", description: "Bulk CSV import/export, cryptographic backups, and verified disaster recovery.", signal: "Data management" },
};

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === "dashboard") redirect("/dashboard");
  if (module === "billing") redirect("/billing");
  if (module === "sales") redirect("/sales");
  if (module === "customers") redirect("/customers");
  if (module === "khata") redirect("/khata");
  if (module === "returns") redirect("/returns");
  if (module === "payables") redirect("/payables");
  if (module === "payments") redirect("/payments");
  if (module === "bank-book") redirect("/bank-book");
  if (module === "voucher-entry") redirect("/voucher-entry");
  if (module === "supplier-notes") redirect("/supplier-notes");
  if (module === "reports") redirect("/reports");
  if (module === "purchase-reports") redirect("/purchase-reports");
  if (module === "settings") redirect("/settings");
  if (module === "backup") redirect("/backup");
  const details = moduleDetails[module];
  if (!details) redirect("/dashboard");
  return <section className="module-page"><div className="page-heading"><div><p className="eyebrow">{details.eyebrow}</p><h1>{details.title}</h1><p>{details.description}</p></div><span className="section-signal">{details.signal}</span></div><div className="milestone-panel"><span className="panel-kicker">Milestone 2</span><h2>Authenticated workspace ready</h2><p>This route is connected to the independent store context. Its domain workflow will be added in the corresponding implementation milestone, backed by the PostgreSQL schema and transactional services.</p></div></section>;
}
