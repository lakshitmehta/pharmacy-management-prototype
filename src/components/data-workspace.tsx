/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatActionLabel } from "@/domain/audit";

type ActiveTab = "csv" | "backup" | "audit";

interface RowError {
  row: number;
  item: string;
  errors: string[];
}

interface ValidationReport {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  errors: RowError[];
  preview?: any[];
}

export function DataWorkspace() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("csv");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Medicine CSV state
  const [medFile, setMedFile] = useState<File | null>(null);
  const [medReport, setMedReport] = useState<ValidationReport | null>(null);
  const [medSuccess, setMedSuccess] = useState<string | null>(null);

  // Supplier CSV state
  const [supFile, setSupFile] = useState<File | null>(null);
  const [supReport, setSupReport] = useState<ValidationReport | null>(null);
  const [supSuccess, setSupSuccess] = useState<string | null>(null);

  // Backup & Restore state
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<any | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  // Audit history state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Load audit history for data operations
  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab]);

  async function fetchAuditLogs() {
    try {
      const res = await fetch("/api/audit-trail?limit=50");
      if (res.ok) {
        const data = await res.json();
        const relevantActions = [
          "MEDICINE_IMPORT",
          "MEDICINE_EXPORT",
          "SUPPLIER_IMPORT",
          "SUPPLIER_EXPORT",
          "DATABASE_BACKUP",
          "DATABASE_RESTORE",
        ];
        const filtered = (data.events || []).filter((e: any) =>
          relevantActions.includes(e.action)
        );
        setAuditLogs(filtered);
      }
    } catch {
      // Ignore
    }
  }

  // --- Medicine CSV Handlers ---
  function downloadMedicineTemplate() {
    const template = "Name,Generic Name,Manufacturer,Barcode,HSN,GST Rate (%),Safety Limit\r\nParacetamol 500mg,Paracetamol,Cipla,8901234567890,300490,12,20\r\nAmoxicillin 250mg,Amoxicillin,Sun Pharma,8901234567891,300490,5,15";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "medicines_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleMedicineCsv(dryRun: boolean) {
    if (!medFile) {
      setError("Please select a medicine CSV file first.");
      return;
    }
    setError(null);
    setNotice(null);
    setMedSuccess(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", medFile);
      formData.append("dryRun", dryRun ? "true" : "false");

      const res = await fetch("/api/import/medicines", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to process medicine CSV.");
        if (data.errors) {
          setMedReport({
            totalRows: data.totalRows || 0,
            validCount: data.validCount || 0,
            invalidCount: data.invalidCount || data.errors.length,
            errors: data.errors,
          });
        }
      } else {
        if (dryRun) {
          setMedReport(data);
          setNotice(`Validation complete: ${data.validCount} valid rows, ${data.invalidCount} invalid rows.`);
        } else {
          setMedSuccess(`Successfully imported ${data.importedCount} medicines (${data.failedCount} skipped due to errors).`);
          setMedReport(data);
          setMedFile(null);
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // --- Supplier CSV Handlers ---
  function downloadSupplierTemplate() {
    const template = "Supplier Name,Code,Contact Person,Phone,Email,GSTIN,Address\r\nApollo Wholesale,SUP001,Rajesh Kumar,9876543210,orders@apollo.com,07AAAAA0000A1Z5,New Delhi\r\nMedLife Distributors,SUP002,Sunil Sharma,9123456789,info@medlife.in,27ABCDE1234F1Z5,Mumbai";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "suppliers_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleSupplierCsv(dryRun: boolean) {
    if (!supFile) {
      setError("Please select a supplier CSV file first.");
      return;
    }
    setError(null);
    setNotice(null);
    setSupSuccess(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", supFile);
      formData.append("dryRun", dryRun ? "true" : "false");

      const res = await fetch("/api/import/suppliers", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to process supplier CSV.");
        if (data.errors) {
          setSupReport({
            totalRows: data.totalRows || 0,
            validCount: data.validCount || 0,
            invalidCount: data.invalidCount || data.errors.length,
            errors: data.errors,
          });
        }
      } else {
        if (dryRun) {
          setSupReport(data);
          setNotice(`Validation complete: ${data.validCount} valid rows, ${data.invalidCount} invalid rows.`);
        } else {
          setSupSuccess(`Successfully imported ${data.importedCount} suppliers (${data.failedCount} skipped due to errors).`);
          setSupReport(data);
          setSupFile(null);
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // --- Backup & Restore Handlers ---
  async function downloadFullBackup() {
    setLoading(true);
    setError(null);
    try {
      const link = document.createElement("a");
      link.href = "/api/backup";
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setNotice("Database backup download started.");
    } catch (err: any) {
      setError(err.message || "Failed to start backup download.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyBackupFile() {
    if (!backupFile) {
      setError("Please select a backup JSON file first.");
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const text = await backupFile.text();
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        setError("Uploaded file is not a valid JSON document.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, dryRun: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Backup verification failed.");
        setBackupPreview(null);
      } else {
        setBackupPreview(data);
        setNotice("Backup file verified successfully! Review details below before proceeding.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred verifying backup.");
    } finally {
      setLoading(false);
    }
  }

  async function executeRestore() {
    if (!backupFile) {
      setError("Please select a backup JSON file first.");
      return;
    }
    if (confirmationInput !== "CONFIRM_RESTORE") {
      setError("Please type 'CONFIRM_RESTORE' into the confirmation box to authorize restore.");
      return;
    }

    setError(null);
    setNotice(null);
    setRestoreSuccess(null);
    setLoading(true);

    try {
      const text = await backupFile.text();
      const payload = JSON.parse(text);

      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, confirmation: confirmationInput, dryRun: false }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Restore execution failed.");
      } else {
        setRestoreSuccess("Restore completed successfully! Store configuration and records have been synchronized.");
        setBackupPreview(null);
        setConfirmationInput("");
        setBackupFile(null);
      }
    } catch (err: any) {
      setError(err.message || "Restore execution encountered an error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace-container">
      <header className="workspace-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data & Disaster Recovery</h1>
          <p className="text-sm text-gray-500">
            Bulk CSV Import/Export for medicines and suppliers, cryptographic database backups, and verified recovery
          </p>
        </div>
        <div className="workspace-actions">
          <Link href="/settings" className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
            &larr; Store Settings
          </Link>
        </div>
      </header>

      {/* Notifications */}
      {notice && (
        <div className="p-3 mb-4 text-sm text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-3 mb-4 text-sm text-red-800 bg-red-50 rounded border border-red-200">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("csv")}
          className={`py-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "csv"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Bulk CSV Operations
        </button>
        <button
          onClick={() => setActiveTab("backup")}
          className={`py-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "backup"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Database Backup & Recovery
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`py-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "audit"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Operation Audit Trail
        </button>
      </div>

      {/* TAB 1: BULK CSV OPERATIONS */}
      {activeTab === "csv" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Medicine CSV Card */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Medicine Catalog CSV</h2>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded">Inventory</span>
              </div>
              <p className="text-sm text-gray-600 mt-2 mb-4">
                Export your current medicine catalog or import new inventory products in bulk with automatic column mapping.
              </p>

              {medSuccess && (
                <div className="p-3 mb-4 text-xs text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
                  {medSuccess}
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-wrap gap-2 mb-4">
                <a
                  href="/api/export/medicines"
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                  download
                >
                  Download Medicines CSV
                </a>
                <button
                  type="button"
                  onClick={downloadMedicineTemplate}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                >
                  Download CSV Template
                </button>
              </div>

              {/* Import Section */}
              <div className="bg-gray-50 p-4 rounded border border-gray-200 mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Medicines CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setMedFile(e.target.files?.[0] || null);
                    setMedReport(null);
                    setMedSuccess(null);
                  }}
                  className="block w-full text-xs text-gray-500 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 mb-3"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!medFile || loading}
                    onClick={() => handleMedicineCsv(true)}
                    className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                  >
                    {loading ? "Validating..." : "Validate (Dry Run)"}
                  </button>
                  <button
                    type="button"
                    disabled={!medFile || loading}
                    onClick={() => handleMedicineCsv(false)}
                    className="px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {loading ? "Importing..." : "Execute Import"}
                  </button>
                </div>
              </div>

              {/* Validation Report */}
              {medReport && (
                <div className="mt-3 text-xs">
                  <div className="flex justify-between items-center bg-gray-100 p-2 rounded mb-2">
                    <span>Total Rows: <strong>{medReport.totalRows}</strong></span>
                    <span className="text-emerald-700">Valid: <strong>{medReport.validCount}</strong></span>
                    <span className={medReport.invalidCount > 0 ? "text-red-700" : "text-gray-500"}>
                      Invalid: <strong>{medReport.invalidCount}</strong>
                    </span>
                  </div>

                  {medReport.errors.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-red-200 bg-red-50 p-2 rounded">
                      <p className="font-semibold text-red-800 mb-1">Validation Errors:</p>
                      {medReport.errors.map((err, i) => (
                        <div key={i} className="mb-1 text-red-700 border-b border-red-100 pb-1">
                          <strong>Line {err.row}</strong> ({err.item}): {err.errors.join("; ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Supplier CSV Card */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Supplier Directory CSV</h2>
                <span className="text-xs font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded">Procurement</span>
              </div>
              <p className="text-sm text-gray-600 mt-2 mb-4">
                Export your registered suppliers or import vendors in bulk with statutory GSTIN and contact validation.
              </p>

              {supSuccess && (
                <div className="p-3 mb-4 text-xs text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
                  {supSuccess}
                </div>
              )}

              {/* Action Toolbar */}
              <div className="flex flex-wrap gap-2 mb-4">
                <a
                  href="/api/export/suppliers"
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                  download
                >
                  Download Suppliers CSV
                </a>
                <button
                  type="button"
                  onClick={downloadSupplierTemplate}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                >
                  Download CSV Template
                </button>
              </div>

              {/* Import Section */}
              <div className="bg-gray-50 p-4 rounded border border-gray-200 mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Suppliers CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setSupFile(e.target.files?.[0] || null);
                    setSupReport(null);
                    setSupSuccess(null);
                  }}
                  className="block w-full text-xs text-gray-500 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 mb-3"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!supFile || loading}
                    onClick={() => handleSupplierCsv(true)}
                    className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                  >
                    {loading ? "Validating..." : "Validate (Dry Run)"}
                  </button>
                  <button
                    type="button"
                    disabled={!supFile || loading}
                    onClick={() => handleSupplierCsv(false)}
                    className="px-3 py-1 text-xs font-medium bg-purple-700 text-white rounded hover:bg-purple-800 disabled:opacity-50"
                  >
                    {loading ? "Importing..." : "Execute Import"}
                  </button>
                </div>
              </div>

              {/* Validation Report */}
              {supReport && (
                <div className="mt-3 text-xs">
                  <div className="flex justify-between items-center bg-gray-100 p-2 rounded mb-2">
                    <span>Total Rows: <strong>{supReport.totalRows}</strong></span>
                    <span className="text-emerald-700">Valid: <strong>{supReport.validCount}</strong></span>
                    <span className={supReport.invalidCount > 0 ? "text-red-700" : "text-gray-500"}>
                      Invalid: <strong>{supReport.invalidCount}</strong>
                    </span>
                  </div>

                  {supReport.errors.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-red-200 bg-red-50 p-2 rounded">
                      <p className="font-semibold text-red-800 mb-1">Validation Errors:</p>
                      {supReport.errors.map((err, i) => (
                        <div key={i} className="mb-1 text-red-700 border-b border-red-100 pb-1">
                          <strong>Line {err.row}</strong> ({err.item}): {err.errors.join("; ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATABASE BACKUP & RESTORE */}
      {activeTab === "backup" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Backup Generator Card */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 pb-3 border-b border-gray-100">
              Complete Store Snapshot Backup
            </h2>
            <p className="text-sm text-gray-600 mt-2 mb-4">
              Generates an offline, portable JSON snapshot encompassing all pharmacy data: store settings, medicines, batches, suppliers, sales invoices, ledgers, vouchers, and audit logs.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 mb-5">
              <p className="font-semibold mb-1">Cryptographic Tamper Protection:</p>
              <p>
                Every backup is sealed with a SHA-256 cryptographic checksum in the manifest to verify data integrity before restoration.
              </p>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={downloadFullBackup}
              className="w-full py-2 px-4 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 transition"
            >
              Generate & Download System Backup (.json)
            </button>
          </div>

          {/* Safe Restore Card */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 pb-3 border-b border-gray-100">
              Safe Recovery from Backup
            </h2>
            <p className="text-sm text-gray-600 mt-2 mb-4">
              Upload a previously exported PillBills backup snapshot to verify integrity and perform safe data synchronization.
            </p>

            {restoreSuccess && (
              <div className="p-3 mb-4 text-xs text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
                {restoreSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Backup Snapshot (.json)
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    setBackupFile(e.target.files?.[0] || null);
                    setBackupPreview(null);
                    setConfirmationInput("");
                    setRestoreSuccess(null);
                  }}
                  className="block w-full text-xs text-gray-500 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              <button
                type="button"
                disabled={!backupFile || loading}
                onClick={verifyBackupFile}
                className="w-full py-1.5 px-3 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? "Checking..." : "Verify & Preview Backup Snapshot"}
              </button>

              {/* Backup Manifest Inspection */}
              {backupPreview && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs space-y-2">
                  <p className="font-semibold text-amber-900">Backup Manifest Details:</p>
                  <div className="grid grid-cols-2 gap-1 text-gray-700">
                    <div>Store: <strong>{backupPreview.manifest?.storeCode}</strong></div>
                    <div>Version: <strong>{backupPreview.manifest?.version}</strong></div>
                    <div className="col-span-2">
                      Exported At: <strong>{new Date(backupPreview.manifest?.exportedAt).toLocaleString()}</strong>
                    </div>
                  </div>

                  <p className="font-semibold text-amber-900 pt-1">Entity Counts:</p>
                  <div className="grid grid-cols-3 gap-1 text-[11px] bg-white p-2 rounded border border-amber-200">
                    {Object.entries(backupPreview.tableCounts || {}).map(([table, count]) => (
                      <div key={table}>
                        {table}: <strong>{String(count)}</strong>
                      </div>
                    ))}
                  </div>

                  {/* Safety Guard: Confirmation input */}
                  <div className="pt-2 border-t border-amber-200">
                    <label className="block font-semibold text-red-800 mb-1">
                      Type &apos;CONFIRM_RESTORE&apos; to authorize:
                    </label>
                    <input
                      type="text"
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      placeholder="CONFIRM_RESTORE"
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded font-mono uppercase focus:ring-1 focus:ring-red-500"
                    />
                    <button
                      type="button"
                      disabled={confirmationInput !== "CONFIRM_RESTORE" || loading}
                      onClick={executeRestore}
                      className="w-full mt-2 py-1.5 px-3 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 disabled:opacity-40"
                    >
                      Execute Safe Restore
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-base font-semibold text-gray-900">Data Management Audit Trail</h2>
            <button
              onClick={fetchAuditLogs}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Refresh
            </button>
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase tracking-wider font-semibold">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Details / Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">
                    No data management audit events found.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-semibold text-gray-900">
                        {formatActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {log.user ? `${log.user.displayName} (@${log.user.username})` : "System"}
                    </td>
                    <td className="py-2 px-3 text-gray-500 font-mono text-[11px]">
                      {log.metadata ? JSON.stringify(log.metadata) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

