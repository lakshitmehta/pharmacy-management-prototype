# Development Status

## Milestone 1: Foundation

**Complete.** Next.js/TypeScript foundation, PostgreSQL/Prisma schema, secure session primitives, synthetic seed data, finance invariants, environment template, Docker Compose, and setup documentation are present.

## Milestone 2: Authentication and Workspace Shell

**Complete.** Credentials login, Argon2 password verification, database-backed HttpOnly sessions, five-device policy, logout/audit events, protected routes, store/user context, responsive audited navigation, dashboard metrics, notifications count, and dark-mode shell are implemented.

## Milestone 2 pending verification item

Docker/PostgreSQL was unavailable during the original Milestone 2 validation. Therefore database migration, seed execution, and successful database-backed login were not verified in that environment. The application build, TypeScript, lint, route smoke test, and database-independent tests passed.

## Milestone 3: Purchasing and Supplier Management

**Complete.**

- Supplier list, search, active/inactive filtering, sorting, registration, edit, delete protection for transaction history, balances, and purchase counts.
- Supplier validation with company name and phone requirements.
- Purchase order creation and past-order listing.
- Received purchase invoice workflow with supplier, invoice number/date, reverse charge, medicine search, batch, expiry, packs, free quantity, wholesale rate, MRP, HSN, GST, ITC eligibility, totals, discard, and save actions.
- Transactional purchase receiving that creates/updates batches, appends inventory movements, records supplier payable debit, and records an audit event.
- Synthetic API endpoints for suppliers, medicines, purchase orders, and purchase invoices.
- Excel import, invoice scanner/OCR, rate/scheme alerts, supplier returns, and credit/debit note execution remain reserved for their later operational milestones; the UI exposes honest entry-point messaging where applicable.

### Milestone 3 business decisions for audited UNKNOWN behavior

- **Decision:** Inventory posts when a received purchase invoice is saved, not when a draft purchase order is created.
- **Decision:** Received quantity plus free quantity creates the inbound inventory movement.
- **Decision:** Supplier payable is recorded as a debit ledger entry for the invoice total.
- **Decision:** Posted supplier records with transactions cannot be deleted; they must be marked inactive.
- **Decision:** Purchase totals use line taxable amounts and line GST with currency rounding.

## Milestone 4: Medicine Inventory & Stock Management

**Complete.**

- Medicine inventory workspace (`/inventory`):
  - Responsive metric cards for Stock Cost Valuation, MRP Valuation, Total SKUs, Total Units, and Low Stock count.
  - Search by medicine name, generic name, manufacturer, and barcode.
  - View filtering by All Stock, Low Stock, and Negative Stock.
  - Sorting by Medicine Name (A-Z / Z-A), Current Stock (High / Low), and Wholesale Rate.
  - Tabbed interface supporting Stock Items, Drug Master Catalog, and Rate & Scheme Intelligence.
  - Itemized batch drawer/table with batch numbers, expiry dates, supplier attribution, unit stock, wholesale rate, MRP, and stock adjustment actions.
  - Transactional "+ Add Stock Item" modal allowing simultaneous registration of medicine catalog metadata and initial opening batch with `OPENING` inventory movement.
  - Direct "Adjust Stock" modal supporting incremental (+ or -) physical count reconciliations, creating immutable `ADJUSTMENT` ledger records with mandatory reasons and audit log entries.
  - Inline "Edit Details" modal for medicine master attributes (name, generic, manufacturer, barcode, HSN, GST rate, safety stock limit).
  - Barcode label preview and print modal with simulated Code128 barcode bars, MRP display, and tax compliance indicators.
- Expiry management workspace (`/expiry`):
  - Metric cards for Expired Batch Loss Value, Near-Expiry (0-90 days) Exposure Value, Healthy Stock Value, and Total Inventory Ledger Cost.
  - Filtering by Expiry Status (All, Expired, Near-Expiry, Healthy) and Supplier/Distributor.
  - Itemized batch table with expiry status tags, days remaining to expiry, supplier name, current stock packs, unit cost, and total exposure value.
  - Dedicated action entry points for distributor return initiation and write-off processing.
- Domain invariants & calculations (`src/domain/inventory.ts`):
  - `calculateBatchStock`: Net stock from inbound (`OPENING`, `PURCHASE`, `RETURN_IN`) minus outbound (`SALE`, `ADJUSTMENT`, `RETURN_OUT`).
  - `calculateInventoryValuation`: Accurate cost valuation and MRP valuation across batches.
  - `categorizeExpiry`: 3-tier classification (EXPIRED < 0 days, NEAR_EXPIRY 0–90 days, HEALTHY > 90 days).
  - `checkStockHealth`: NEGATIVE (< 0), LOW (<= safetyLimit), and HEALTHY.
  - Zod validation schemas for medicine registration, medicine updates, and stock adjustments.
- Real database-backed API endpoints:
  - `GET /api/inventory`: Multi-parameter search, view filtering, sorting, itemized batches, and aggregated valuation metrics.
  - `POST /api/inventory`: Transactional medicine and opening batch creation with `AuditLog` recording.
  - `PATCH /api/inventory/[id]`: Partial medicine master attribute updates.
  - `DELETE /api/inventory/[id]`: Transaction-safe deletion guard preventing deletion of medicines with active movements.
  - `POST /api/inventory/adjust`: Transactional batch stock adjustment creating immutable `ADJUSTMENT` movements and audit logs.
  - `GET /api/expiry`: Real-time batch-level expiry calculation with financial exposure aggregation and distributor filtering.

### Milestone 4 business decisions for audited UNKNOWN behavior

- **Decision:** Stock health thresholds compare aggregate stock across all batches of a medicine against its configured `safetyLimit`. Aggregate stock <= 0 is marked NEGATIVE, <= safetyLimit is marked LOW, and > safetyLimit is marked HEALTHY.
- **Decision:** Expiry categorization uses a 90-day window for NEAR_EXPIRY to give pharmacy managers sufficient lead time for supplier return or clearance before product expiration.
- **Decision:** Inventory valuation maintains separate cost value (`sum(batch.purchaseRate * batch.stock)`) and retail MRP value (`sum(batch.mrp * batch.stock)`).
- **Decision:** Manual stock adjustments require a documented reason, generate an immutable `MovementType.ADJUSTMENT` ledger entry, and record an audit log with the user and store ID.
- **Decision:** Medicines with existing inventory movements cannot be hard-deleted (returns 409 Conflict); only unreferenced catalog entries may be removed.

## Milestone 5: Counter POS & Billing & Sales View

**Implemented in this milestone.**

- Billing & Point of Sale counter workspace (`/billing`):
  - Fast, keyboard-accessible counter billing workspace with real-time medicine search and barcode scanner support.
  - Batch-aware dispensing with FEFO (First Expiry, First Out) ordering, live available stock verification, near-expiry tags, and strict expiration blocking.
  - Interactive counter bill lines table with pack quantity increment/decrement, MRP/rate override, line discount %, GST %, and live total calculation.
  - Patient / Customer selection supporting:
    - Walk-in cash customer default.
    - Phone number / name search across registered customers with auto-fill and live Khata credit balance display.
    - Quick "+ New Customer" inline registration (name, phone, optional notes).
    - Prescribing doctor attribution.
  - Financial calculations & settlements:
    - Live taxable subtotal, line discounts, bill-level discount %, GST breakdown, and net grand total with 2-decimal currency rounding.
    - Multi-payment support for Cash, UPI, Card, Credit (Khata / Udhaar), Chemist, and Own Use.
    - Cash tender input with live change due calculation and quick-denomination buttons.
    - Credit (Khata) validation requiring customer attribution and recording customer ledger entries.
  - Thermal / A4 Printable Bill Receipt modal with store branding, GSTIN, DL#, customer details, itemized batch breakdown, tax summary, and window.print print styling.
- Sales Ledger & Register workspace (`/sales`):
  - Metric ribbon displaying Today's Sales Revenue, Today's Bill Count, Total Revenue, Cash Collections, and Digital / UPI collections.
  - Filter toolbar supporting search (by invoice #, customer name, phone, medicine), date range (Today, Yesterday, Last 7 Days, This Month, All), payment mode, and status (Posted vs. Voided).
  - Itemized sales register table with status tags (`POSTED` in active green, `VOIDED` in strikethrough red).
  - Invoice Details Inspection modal showing complete line items, tax breakdown, customer details, and audit event logs.
  - Re-print receipt action for past invoices.
  - Transaction-safe "Void Invoice" modal with mandatory cancellation reason: marks invoice `VOIDED`, appends compensating `CUSTOMER_RETURN` inventory movements to restore batch stock, and reverses customer credit ledger.
  - Export to CSV action for the filtered sales register.
- Dashboard integration (`/dashboard`):
  - Real-time Today's Sales Revenue and bill count integrated directly into the dashboard metric grid alongside catalog records, suppliers, and customers.
- Domain invariants & calculations (`src/domain/sales.ts`):
  - `calculateSalesLine`: Pure calculation of line gross, discount, taxable value, GST tax amount, and line total with 2-decimal rounding.
  - `calculateSalesTotals`: Aggregates lines, applies bill-level discounts, computes subtotal, GST total, final net total, and line calculation breakdowns.
  - `calculateChangeDue`: Tendered cash minus total amount.
  - `validateBatchForSale`: Validates batch existence, verifies batch is not expired prior to sale date, and validates that requested quantity does not exceed available batch stock.
  - Zod validation schemas for `salesLineInputSchema`, `salesInvoiceInputSchema`, `customerInputSchema`, `customerQuickInputSchema`, and `voidInvoiceSchema`.
- Real database-backed API endpoints:
  - `GET /api/medicines/search-for-sale`: Fast search for billing POS returning active medicines and in-stock batches with calculated available stock and expiry tags.
  - `GET /api/customers`: Multi-parameter customer search returning customer profiles, transaction counts, and computed Khata credit balance from `CustomerLedgerEntry` records.
  - `POST /api/customers`: Registers a customer profile scoped to the current store with unique phone check and audit logging.
  - `GET /api/sales`: Multi-parameter sales invoices query with search, date range, payment mode, and status filtering, plus aggregated revenue metrics.
  - `POST /api/sales`: Single atomic PostgreSQL `$transaction` creating sequential invoice number, linking customer, verifying batch stock, creating `SalesInvoice`, `SalesLine`, `SalePayment`, appending outbound `InventoryMovement` (`type: "SALE"`), posting to `CustomerLedgerEntry` / `CustomerReceipt`, checking low-stock safety limits, and recording `AuditEvent`.
  - `GET /api/sales/[id]`: Fetches complete invoice details, line items, store metadata, and audit timeline.
  - `POST /api/sales/[id]/void`: Single atomic PostgreSQL `$transaction` voiding invoice, restoring batch stock via `MovementType.CUSTOMER_RETURN`, reversing customer Khata ledger, and recording `AuditEvent`.

### Milestone 5 business decisions for audited UNKNOWN behavior

- **Decision:** Dispensing expired batches is strictly forbidden at the API and domain layers. Batches past expiry date return a validation error and cannot be sold.
- **Decision:** Outbound inventory movements for sales use positive quantities with `MovementType.SALE` because `calculateBatchStock` subtracts `SALE` movements from the balance.
- **Decision:** Reversing / voiding an invoice does not delete records; it sets `status: "VOIDED"` and creates compensating `MovementType.CUSTOMER_RETURN` records to restore batch stock.
- **Decision:** Khata (Credit) sales require a customer with a verified phone number and create a DEBIT entry in `CustomerLedgerEntry`. Reversing a voided credit sale creates a compensating CREDIT entry.
- **Decision:** Cash and digital sales with a linked customer record both an invoice DEBIT and a receipt CREDIT, preserving full auditability while keeping customer balance at 0.
- **Decision:** Invoice numbers follow store settings sequence (`${invoicePrefix}-${String(nextInvoiceNo).padStart(4, "0")}`) with atomic increment inside the sale transaction.

## Validation status

Milestone 5 validation completed on 2026-09-09.

## Milestone 6: Customer CRM, Khata (Udhaar) Ledger & Returns/Exchange

**Complete.**

- Customer CRM Workspace (`/customers`):
  - Complete customer directory with real-time search (by name, phone, GSTIN), filter pills (All Accounts, Accounts with Dues, Settled / Zero Balance), and sorting (by name, outstanding balance, order count).
  - KPI summary ribbon showing Total Registered Customers, Active Debtors count, Total Credit Balance Outstanding, and Total Orders Billed.
  - Interactive "+ Add Customer" modal supporting full profile registration (name, phone, email, GSTIN, notes).
  - "Edit Profile" modal for updating contact details, GSTIN, and operational notes.
  - Safe customer deletion guard: prevents deletion if sales or ledger transaction history exists (returns 409 Conflict).
  - Comprehensive 360° Customer Drawer:
    - Overview Tab: Key stats (balance, total spent, orders count, created date, contact info).
    - Invoices Tab: Complete chronological invoice history with bill totals, payment modes, and statuses.
    - Ledger Tab: Full running-balance debit/credit statement showing every bill, payment receipt, return credit, and balance over time.
  - Quick "+ Receive Payment" modal directly accessible from the customer list or drawer.
- Customer Udhaar / Khata Ledger Workspace (`/khata`):
  - Dedicated credit exposure management with KPI metrics:
    - Total Outstanding Udhaar (₹) across the pharmacy.
    - Debtor Accounts count.
    - High-Risk Accounts (60+ days overdue) count.
    - Overdue Accounts (31–60 days overdue) count.
    - Today's Collections (₹) and Lifetime Receipts Collected (₹).
  - Filter toolbar with text search and aging bucket selector (`all`, `CURRENT_0_30`, `OVERDUE_31_60`, `HIGH_RISK_60_PLUS`).
  - Debtor Table with aging risk badges (0–30 Days Current in green, 31–60 Days Overdue in amber, 60+ Days High Risk in red), oldest unpaid bill age, unpaid bill counts, and last payment date.
  - Transactional "+ Collect Payment" modal:
    - Amount input with "Pay Full Due" shortcut button.
    - Payment mode selection: Cash, UPI, Bank Transfer, Cheque.
    - Optional transaction reference / note.
    - Automated FIFO bill allocation: payment is sequentially applied to oldest open credit invoices first, recording `ReceiptAllocation` entries.
    - Generates printable "UDHAAR PAYMENT VOUCHER" receipt with customer metadata, previous balance, amount received, remaining balance, and itemized invoice allocations.
  - Interactive Customer Statement drawer showing running ledger balances.
- Counter Returns & Exchange Workspace (`/returns`):
  - KPI metric cards: Total Value Returned (₹), Restored Inventory Units (units), and Return Events Logged.
  - Tabbed interface: "+ Process Return or Exchange" and "Returns History Register".
  - Step 1: Invoice Lookup:
    - Queries active posted invoices by invoice number (e.g. `DEMO-0004`) or customer phone.
    - Displays invoice header: invoice #, date, customer name/phone, original payment method, and bill total.
  - Step 2: Line Item Selection & Limits:
    - Lists all original invoice items with sold quantity, already returned quantity, and maximum returnable quantity (`sold - previousReturns`).
    - Checkbox selection with quantity bounds (`1 <= qty <= returnableQuantity`).
    - Fully returned items are disabled with a "Fully Returned" badge.
    - Reason categorization (`PATIENT_RECOVERED`, `DOCTOR_CHANGED_PRESCRIPTION`, `WRONG_MEDICINE_DISPENSED`, `ADVERSE_REACTION`, `NEAR_EXPIRY_REJECTED`, `EXCESS_QUANTITY`, `OTHER`).
    - Live calculation of line refunds (proportional gross, line discount, GST, and net total).
  - Step 3: Transaction Mode Switcher:
    - Mode A (Direct Return & Refund):
      - Real-time taxable and GST refund totals.
      - Settlement channel selector: Cash Refund (`REFUND_CASH`), UPI Refund (`REFUND_UPI`), or Customer Khata Credit (`KHATA_CREDIT` which reduces customer's outstanding balance).
      - Restores inventory by creating `MovementType.CUSTOMER_RETURN` movements for each returned batch.
      - Generates printable "SALES RETURN CREDIT MEMO" voucher.
    - Mode B (Medicine Exchange):
      - Integrated replacement medicine search querying `/api/medicines/search-for-sale`.
      - Batch selection with live available stock checking and tax rate calculation.
      - Quantity controls ensuring replacements cannot exceed available batch stock.
      - Differential settlement computation (`calculateExchangeDifferential`):
        - `CUSTOMER_PAYS`: When replacement total > return total (settled via Cash, UPI, or Khata debit).
        - `STORE_REFUNDS`: When return total > replacement total (refunded via Cash, UPI, or Khata credit).
        - `EVEN_EXCHANGE`: When values match exactly.
      - Restores returned batch stock (`CUSTOMER_RETURN`) and deducts replacement batch stock (`SALE`).
      - Generates printable "COUNTER EXCHANGE MEMO" voucher.
  - Returns History Register:
    - Chronological log of all inventory restoration movements with timestamp, medicine name, batch number, restored quantity, unit rate, total value, and reason.
- Domain Invariants & Calculations:
  - `src/domain/customers.ts`:
    - `calculateCustomerBalance`: Computes current balance from ledger entries (`sum(DEBIT) - sum(CREDIT)`).
    - `categorizeKhataAging`: Categorizes oldest open credit bill into `CURRENT_0_30`, `OVERDUE_31_60`, or `HIGH_RISK_60_PLUS`.
    - `allocateReceiptFifo`: Sequentially knocks off oldest open credit invoices using `allocateFifo`.
    - Zod validation schemas for customer creation, update, and Khata receipts.
  - `src/domain/returns.ts`:
    - `validateReturnQuantity`: Invariant checking that `alreadyReturned + returnQuantity <= soldQuantity`.
    - `calculateReturnLineRefund`: Proportional calculation of refund gross, discount reversal, taxable refund, tax refund, and net refund total.
    - `calculateReturnTotals`: Aggregates return lines with 2-decimal currency rounding.
    - `calculateExchangeDifferential`: Differential calculation between return refund and replacement totals.
    - Zod validation schemas for sales returns and sales exchanges.
- Real Database-Backed API Endpoints:
  - `GET /api/customers`: Customer registry search, dues filtering, and balance computation.
  - `POST /api/customers`: Scoped customer profile registration with unique phone constraint and audit logging.
  - `GET /api/customers/[id]`: 360° customer statement, sales history, receipt records, and running ledger balance.
  - `PATCH /api/customers/[id]`: Customer profile updates.
  - `DELETE /api/customers/[id]`: Safe customer deletion guard returning 409 Conflict if transaction history exists.
  - `GET /api/khata`: Real-time debtor register with aging exposure categorization and store-wide metrics.
  - `POST /api/khata/receipt`: Atomic PostgreSQL `$transaction` creating `CustomerReceipt`, generating FIFO `ReceiptAllocation` records against oldest open invoices, posting CREDIT to `CustomerLedgerEntry`, and recording `AuditEvent`.
  - `GET /api/returns/lookup`: Computes remaining returnable quantities per batch on posted invoices by subtracting prior `CUSTOMER_RETURN` movements.
  - `GET /api/returns`: Returns register of past inventory restoration movements with metrics.
  - `POST /api/returns`: Atomic PostgreSQL `$transaction` validating return limits, creating `CUSTOMER_RETURN` movements to restore stock, applying cash/UPI refund or Khata credit, and recording `AuditEvent`.
  - `POST /api/returns/exchange`: Atomic PostgreSQL `$transaction` restoring returned batch stock (`CUSTOMER_RETURN`), deducting replacement batch stock (`SALE`), calculating net differential, posting financial settlement, and recording `AuditEvent`.

### Milestone 6 business decisions for audited UNKNOWN behavior

- **Decision:** A customer payment receipt cannot exceed the customer's total outstanding balance. Payment amounts are allocated FIFO to the oldest unpaid credit invoices first.
- **Decision:** In customer ledger double-entry convention, a DEBIT increases customer debt (e.g. credit sales, exchange differences payable), while a CREDIT decreases customer debt (e.g. payment receipts, return credits).
- **Decision:** Returnable quantity on an invoice line is strictly bounded by `originalSoldQuantity - priorReturnedQuantity`. Over-returns are rejected with 400 Bad Request at both the domain and API layers.
- **Decision:** Inventory movements for customer returns use positive quantities with `MovementType.CUSTOMER_RETURN` because `calculateBatchStock` adds `CUSTOMER_RETURN` movements back into available batch stock.
- **Decision:** Replacement items in an exchange must have available stock in the selected batch. Stock is verified and deducted atomically using `MovementType.SALE`.
- **Decision:** Customers with existing transaction records (sales, receipts, or ledger entries) cannot be deleted; attempts return 409 Conflict to protect financial and audit integrity.

## Validation status

Milestone 6 validation completed on 2026-09-09:

- **Unit tests:** 62 unit tests passing across 6 test files (`tests/finance.test.ts`, `tests/purchasing.test.ts`, `tests/inventory.test.ts`, `tests/sales.test.ts`, `tests/customers.test.ts`, `tests/returns.test.ts`).
- **TypeScript:** 0 errors (`npx tsc --noEmit` exited with code 0).
- **Next.js Production Build:** Succeeded (`npm run build` compiled all 31 static and dynamic workspace routes, including `/customers`, `/khata`, and `/returns`).
- **Database & API Integration:** Live end-to-end verification executed against local PostgreSQL instance on port 3008 via `verify-m6.mjs`:
  - User session authentication verified via `/api/auth/login`.
  - Customer registration and 360° view with ₹0 starting balance verified (`POST /api/customers`, `GET /api/customers/[id]`).
  - Credit sale created (`POST /api/sales`), debiting customer ledger and appearing in Khata debtor register with aging bucket `CURRENT_0_30`.
  - FIFO payment collection verified (`POST /api/khata/receipt`): partial payment knocking off invoice #DEMO-0003, credit ledger entry posted, and subsequent full settlement reducing balance to ₹0.00.
  - Cash sale created (`POST /api/sales`) and invoice looked up (`GET /api/returns/lookup`) confirming initial returnable quantity of 5.
  - Return of 2 units processed (`POST /api/returns`): inventory restored (`CUSTOMER_RETURN`), batch stock verified increasing from 41 to 43 (+2 units), and returnable quantity updated to 3.
  - Over-return attempt (4 units > 3 returnable) properly rejected with 400 Bad Request.
  - Counter exchange processed (`POST /api/returns/exchange`): 1 returned unit restocked and 1 replacement unit deducted, with differential calculated and settled.
## Milestone 7: Banking & Payments, Accounts Payable & General Ledger Vouchers

**Complete.**

- Accounts Payable Workspace (`/payables`):
  - Supplier payables ledger with real-time balance calculations, open bills breakdown, and aging bucket classifications (Current 0–30 days, Overdue 31–60 days, Critical 60+ days).
  - KPI summary ribbon: Total Accounts Payable (₹), Active Creditors count, Overdue (31–60d) count, Critical (60+d) count, and Total Paid to Suppliers (₹).
  - Supplier 360° statement drawer with running balance ledger and itemized open purchase invoice breakdown.
  - Quick payment trigger directly from the payables register.
  - Printable payment advice / voucher memo.
- Supplier Payments & Disbursements Workspace (`/payments`):
  - Disbursements register with filtering by payment method (Cash, UPI, Card, Net Banking) and text search.
  - Transactional payment creation modal with bank account / cash drawer source selector.
  - Automated FIFO allocation (`allocateSupplierPaymentFifo`) sequentially applying disbursements against the oldest unpaid purchase invoices, recording `PaymentAllocation` records.
  - Single atomic PostgreSQL `$transaction` creating `SupplierPayment`, generating `PaymentAllocation` records, posting `SupplierLedgerEntry` (CREDIT), recording `CashEntry` outflow, and appending `AuditEvent`.
  - Printable disbursement advice receipt with payment metadata and bill allocation details.
- Bank & Cash Book Workspace (`/bank-book`):
  - Real-time liquidity monitoring across bank accounts and counter cash drawers.
  - Chronological day book with inflow (DEBIT) and outflow (CREDIT) entries.
  - Account auto-provisioning for default store bank account and cash register if none exist.
  - Dedicated modal for adding new bank accounts or cash counter drawers.
  - Manual cash entry modal for miscellaneous inflows/outflows with category attribution.
  - Atomic contra transfer modal for cash deposits and withdrawals (bank to cash / cash to bank) recording dual `CashEntry` records and audit events.
- Double-Entry Voucher System Workspace (`/voucher-entry`):
  - Multi-line double-entry journal system supporting `JOURNAL` (JV), `PAYMENT` (PV), `RECEIPT` (RV), and `CONTRA` (CV) voucher types.
  - Strict mathematical balancing invariant (`assertBalanced`, `sum(debits) === sum(credits)`) enforced in Zod validation schema and API transactions.
  - Sequential voucher numbering per store and type (`${prefix}-${String(nextNo).padStart(4, "0")}`).
  - Real-time debit/credit tally and imbalance indicator in the UI.
  - Printable double-entry voucher memo.
- Supplier Returns & Credit/Debit Notes Workspace (`/supplier-notes`):
  - Supplier adjustment notes register.
  - Return note creation with physical stock deduction (`MovementType.SUPPLIER_RETURN`) and supplier ledger adjustment (CREDIT for debt reduction).
- Domain Invariants & Calculations:
  - `src/domain/payables.ts`:
    - `calculateSupplierBalance`: Pure calculation of supplier ledger net balance (`sum(DEBIT) - sum(CREDIT)`).
    - `categorizePayableAging`: Categorizes oldest open purchase invoice into `CURRENT_0_30`, `OVERDUE_31_60`, or `CRITICAL_60_PLUS`.
    - `allocateSupplierPaymentFifo`: Sequentially knocks off oldest open purchase invoices using `allocateFifo`.
    - Zod validation schemas for supplier payments and supplier credit/debit notes.
  - `src/domain/banking.ts`:
    - `calculateAccountBalance`: Pure calculation of bank or cash register balance (`opening + sum(DEBIT) - sum(CREDIT)`).
    - Zod validation schemas for bank accounts, cash registers, manual cash entries, and contra transfers.
  - `src/domain/vouchers.ts`:
    - `assertBalanced`: Enforces that total debits strictly equal total credits.
    - `voucherCreateSchema`: Zod schema with refinement verifying double-entry balance invariant.
- Real Database-Backed API Endpoints:
  - `GET /api/payables`: Supplier payables list with aging, open bills counts, and store-wide debt metrics.
  - `GET /api/payables/[id]`: Supplier 360° statement with running balance and open bills breakdown.
  - `GET /api/payments`: Disbursements register with method filtering.
  - `POST /api/payments`: Atomic `$transaction` recording `SupplierPayment`, FIFO `PaymentAllocation`, `SupplierLedgerEntry` (CREDIT), and `CashEntry` outflow.
  - `GET /api/bank-book`: Account liquidity cards and chronological day book with auto-provisioning.
  - `POST /api/bank-book`: Atomic contra transfer or manual cash entry.
  - `GET /api/bank-book/accounts` & `POST /api/bank-book/accounts`: Bank account and cash register management.
  - `GET /api/vouchers`: Voucher register with type and search filtering.
  - `POST /api/vouchers`: Atomic `$transaction` with sequential numbering (`JV`, `PV`, `RV`, `CV`) and double-entry balancing validation.
  - `GET /api/supplier-notes` & `POST /api/supplier-notes`: Supplier return/note updating inventory (`SUPPLIER_RETURN`) and crediting supplier ledger.

### Milestone 7 business decisions for audited UNKNOWN behavior

- **Decision:** Supplier payable balances use standard creditor ledger convention: a DEBIT increases store payable (e.g. received purchase invoice), while a CREDIT decreases store payable (e.g. payment disbursement, supplier return credit note).
- **Decision:** Disbursements are allocated to the supplier's oldest open purchase invoices first using strict FIFO allocation, generating itemized `PaymentAllocation` records.
- **Decision:** Asset account accounting invariant: Inflow into Bank or Cash is recorded as DEBIT; Outflow from Bank or Cash is recorded as CREDIT.
- **Decision:** Contra transfers (cash deposit to bank or cash withdrawal from bank) are posted as atomic dual entries in `CashEntry` within a single database transaction.
- **Decision:** Vouchers require strict mathematical equality between total debits and total credits (`sum(debit) === sum(credit)`). Any unbalanced journal is rejected with 400 Bad Request at both the Zod validation layer and API transaction level.
- **Decision:** Supplier returns create an outbound `MovementType.SUPPLIER_RETURN` inventory movement, decreasing batch stock, and post a CREDIT entry to the supplier's payable ledger.

## Milestone 8: Reports Hub & Procurement Intelligence

**Complete.**

- Reports Hub workspace (`/reports`):
  - Category selector across 6 analytical areas: Sales, Purchase, Inventory, GST, Financial P&L, and Day Close Cash.
  - Sales analytical reports:
    - Day Book: chronological invoice register with cash, digital, and credit breakdowns.
    - Item-wise Sales: quantity sold, tax generated, and revenue grouped by medicine, batch, HSN, and GST slab.
    - Party-wise Sales: sales distribution by customer with invoice counts and revenue totals.
    - Discount Analysis: itemized discount tracking, percentage discount relative to subtotal, and average discount metric.
  - Purchase analytical reports:
    - Day Book: received invoices register with payment status, paid amounts, and outstanding balances.
    - Item-wise Purchases: procurement volumes, cost rates, MRPs, and taxes grouped by product and batch.
    - Vendor Analytics: supplier procurement spend, payment history, and outstanding payables.
  - Inventory valuation & stock health:
    - Stock Valuation: comprehensive batch-by-batch valuation comparing cost value (`stock * purchaseRate`) against retail MRP value (`stock * mrp`), with unrealized profit and margin % calculations.
    - Stock Velocity: sales velocity analysis categorizing items as `FAST` (> 2 units/day), `NORMAL` (0.2–2 units/day), or `SLOW` (< 0.2 units/day) over rolling 30-day windows.
    - Reorder Alerts: low-stock and out-of-stock items based on store safety stock thresholds with suggested replenishment quantities.
  - GST tax registers:
    - GSTR-1 Outward Supply: automated segregation of B2B transactions (customers with valid GSTIN) and B2C sales grouped by statutory tax slabs (0%, 5%, 12%, 18%, 28%) with CGST, SGST, and IGST breakdowns.
    - GSTR-2 Inward ITC: inward procurement register with eligible vs. ineligible input tax credit (ITC) classification.
    - GSTR-3B Net Tax Liability: automated reconciliation of outward tax liability minus inward eligible ITC to derive net tax payable or carry-forward ITC balance.
    - HSN Summary: aggregate summary by 4/6/8-digit HSN codes with quantity, taxable value, and total tax breakdown.
  - Financial statements:
    - Profit & Loss Statement (P&L): double-entry COGS computation (`Opening Stock + Net Purchases - Closing Stock`), Gross Profit calculation, Gross Margin %, Operating Expenses derived from expense voucher lines, and Net Operating Profit.
    - Day Close Cash Reconciliation: daily cash drawer reconciliation computing `Opening Cash + Cash Inflows - Cash Outflows = Expected Closing Drawer Cash` with transaction counts.
  - Reporting utilities: date presets (Today, This Month, Last Month, Custom Date Range), CSV export generator, and clean print views (`window.print()`).
- Dedicated Procurement Intelligence workspace (`/purchase-reports`):
  - Positioned under the "Stock & purchase" navigation group for dedicated procurement analysis.
  - Real-time procurement metric cards: Total Procurement Spend, Total Inward Tax (ITC), Current Outstanding Payables, Invoices Count, and Active Suppliers Count.
  - Sub-views:
    - Procurement Overview: side-by-side view of top suppliers by spend and recent purchase invoices.
    - Vendor Spend Distribution: table detailing supplier spend, % share of total procurement, and current outstanding balances.
    - Monthly Procurement Trends: month-over-month procurement tracking with average bill value and inward tax totals.
    - Purchase Invoices Register: itemized register of all posted purchase bills with line counts, taxable subtotals, and tax totals.
  - Supplier filtering, period selectors, CSV export, and print styles.
- Domain invariants & calculations (`src/domain/reports.ts`):
  - `calculateProfitAndLoss`: Computes net sales revenue, net purchases, COGS, gross profit, margin %, and net operating profit after operating expenses.
  - `aggregateGstr1`: Segregates B2B (valid GSTIN) vs. B2C rate slab summaries with CGST/SGST/IGST breakdown.
  - `aggregateGstr2`: Inward purchase aggregation with eligible and ineligible ITC tracking.
  - `calculateGstr3bSummary`: Net tax liability calculation deducting inward eligible ITC from outward liability.
  - `aggregateHsnSummary`: Groups sales lines by HSN code and aggregates taxable amounts and taxes.
  - `calculateStockValuation`: Cost vs. MRP stock valuation with unrealized profit and potential margin %.
  - `calculateFastSlowMoving`: Daily sales velocity classification (`FAST`, `NORMAL`, `SLOW`).
  - `reportFilterSchema`: Zod validation schema for report query parameters.
- Real Database-Backed API Endpoints:
  - `GET /api/reports/sales`: Sales day book, item-wise sales, party-wise distribution, and discount analysis.
  - `GET /api/reports/purchases`: Purchase day book, item-wise purchases, and vendor spend analytics.
  - `GET /api/purchase-reports`: Dedicated procurement intelligence API with monthly trends, vendor distribution, and procurement metrics.
  - `GET /api/reports/inventory`: Inventory valuation, stock velocity classification, and reorder alerts.
  - `GET /api/reports/gst`: GSTR-1, GSTR-2, GSTR-3B, and HSN summary registers with store GSTIN settings.
  - `GET /api/reports/financial`: P&L statement with dynamic COGS and operating expenses, plus Day Close cash reconciliation.

### Milestone 8 business decisions for audited UNKNOWN behavior

- **Decision:** GSTR-1 B2B classification strictly requires a non-empty customer GSTIN of at least 15 characters on the sales invoice; all other walk-in or unregistered consumer sales aggregate into statutory B2C rate slabs (0%, 5%, 12%, 18%, 28%).
- **Decision:** Cost of Goods Sold (COGS) follows the standard retail inventory formula: `COGS = Opening Stock + Net Purchases - Closing Stock`. Stock valuation uses batch purchase rates.
- **Decision:** P&L operating expenses are dynamically extracted from double-entry accounting records (`VoucherLine` where account name contains "expense", netting debits minus credits).
- **Decision:** Stock velocity classifies items using a 30-day lookback window: items selling > 2 units/day are `FAST`, between 0.2 and 2 units/day are `NORMAL`, and < 0.2 units/day (or 0 sales) are `SLOW`.
- **Decision:** GSTR-3B tax offset sets Net Tax Payable to `max(0, Outward Tax - Inward Eligible ITC)` and stores any excess input credit as `Carry Forward ITC`.
- **Decision:** Day Close cash drawer reconciliation calculates expected drawer cash as `Opening Cash + Cash Inflows - Cash Outflows` for today's date entries.

## Validation status
### Validation status

Milestone 8 validation completed on 2026-09-10:
Milestone 8 validation completed on 2026-09-14:

- **Unit tests:** 81 unit tests passing across 9 test files (`tests/finance.test.ts`, `tests/purchasing.test.ts`, `tests/inventory.test.ts`, `tests/sales.test.ts`, `tests/customers.test.ts`, `tests/returns.test.ts`, `tests/payables.test.ts`, `tests/banking.test.ts`, `tests/reports.test.ts`).
- **Unit tests:** 83 unit tests passing across 9 test files (`tests/finance.test.ts`, `tests/purchasing.test.ts`, `tests/inventory.test.ts`, `tests/sales.test.ts`, `tests/customers.test.ts`, `tests/returns.test.ts`, `tests/payables.test.ts`, `tests/banking.test.ts`, `tests/reports.test.ts`).
- **TypeScript:** 0 errors (`npx tsc --noEmit` exited with code 0).
- **ESLint:** 0 errors (`npm run lint` exited with code 0).
- **Next.js Production Build:** Succeeded (`npm run build` compiled all 50 static and dynamic workspace routes, including `/reports`, `/purchase-reports`, and all prior milestone routes).
- **Database & API Integration:** Live end-to-end verification executed against local PostgreSQL instance on port 3009 via `scripts/verify-m8.mjs`:
- **Database & API Integration:** Live end-to-end verification executed against local PostgreSQL instance on port 3000 via `scripts/verify-m8.mjs` and `scripts/verify-m7.mjs`:
  - User session authentication verified via `/api/auth/login`.
  - Sales reports verified: Day Book (3 invoices, ₹665.22 total sales), Item-wise sales (2 aggregated items), Party-wise sales (2 customers), and Discount analysis (1 bill, ₹3.30 discount).
  - Purchase reports & procurement intelligence verified: Day Book (5 invoices, ₹60,000 spend), Item-wise purchases (5 items), Vendor analytics (1 vendor), Procurement intelligence (5 bills, 1 monthly cohort, ₹60,000 total spend).
  - Inventory valuation & velocity verified: 10 batches evaluated (Total Cost: ₹56,962.50, Total MRP: ₹84,896.00, Potential Margin: ₹27,933.50), stock velocity classified, and reorder alerts identified.
  - GST registers verified: GSTR-1 outward supply (B2B, B2C rate slabs, ₹7.52 outward tax), GSTR-2 inward supplies (₹10,000 eligible ITC), GSTR-3B net liability (Outward tax ₹7.52 - Eligible ITC ₹10,000 = Net tax payable ₹0), HSN summary verified.
  - Financial statements verified: Profit & Loss statement (Net sales revenue ₹311.22, Opening stock ₹7,554.00, Net purchases ₹49,876.00, Closing stock ₹56,962.50, COGS ₹467.50, Gross profit ₹-156.28, Operating expenses ₹7,500.00, Net operating profit ₹-7,656.28) and Day Close cash reconciliation (Opening cash ₹5,000.00, Cash inflows ₹80,000.00, Expected closing drawer cash ₹85,000.00).
  - Financial statements verified: Profit & Loss statement (Net sales revenue ₹311.22, Opening stock ₹7,554.00, Net purchases ₹49,876.00, Closing stock ₹56,962.50, COGS ₹467.50, Gross profit ₹-156.28, Operating expenses ₹7,500.00, Net operating profit ₹-7,656.28) and Day Close cash reconciliation (Opening cash ₹5,000.00, Cash inflows ₹0.00, Cash outflows ₹0.00, Expected closing drawer cash ₹5,000.00).
  - Milestone 7 banking, payables, FIFO allocation, and double-entry voucher regression verified with 100% pass rate.
  - Workspace page availability & zero regressions verified: All 18 workspace routes returned HTTP 200 OK.



### Operational Boundaries and Genuine Remaining Limitations
- **External GST Portal Sync:** GSTR-1, GSTR-2, and GSTR-3B reports compute exact statutory tax liability and inward ITC reconciliation according to Indian GST guidelines; direct automated API upload to the government GSTN portal requires statutory GST Suvidha Provider (GSP) credentials and remains outside local offline scope.
- **Hardware Peripherals:** Report printing uses standard browser printing interfaces (`window.print()`) optimized with CSS print media styles; physical ESC/POS thermal printer communication relies on the browser's native print spooler.
- **Reference Application Isolation:** The live reference application at `https://app.pillbills.com/` remains 100% untouched and strictly read-only. All execution, builds, test data, and database records remain isolated in `D:\Projects\pillbills` and the local PostgreSQL database.

## Milestone 9: Settings, Store Profile, Tax Configuration, Multi-User RBAC & Audit Trail

**Complete.**

- System Settings & Administration Workspace (`/settings`):
  - Store Profile & Statutory Tax Configuration:
    - General profile management (trading name, official phone, physical store address).
    - Statutory compliance parameters with real-time Indian GSTIN format validation (15-character alphanumeric regex), Drug License (DL) numbers (20-B / 21-B), and GST filing scheme selection (`REGULAR_MONTHLY`, `REGULAR_QUARTERLY`, `COMPOSITION`, `UNREGISTERED`).
    - Point-of-Sale invoice rules: sequential invoice prefix (e.g. `INV`, `DEMO`), next sequential number, discount display mode (`AMOUNT`, `PERCENTAGE`, `BOTH`), E-Invoice and E-Way Bill toggles.
    - Thermal/A4 receipt customization: receipt footer notice and return policy terms.
  - Multi-User Management & RBAC Workspace:
    - User directory table showing username, display name, role badge, status (`ACTIVE` vs. `INACTIVE`), created date, and action controls.
    - "+ Add New User" modal with username validation, display name, minimum 8-character password with Argon2 hashing, and role assignment.
    - Edit Staff modal with display name modification, role reassignment, optional password reset, and status toggles with self-deactivation protection for owners.
    - RBAC permissions reference matrix displaying granted workspace privileges for `OWNER`, `MANAGER`, `PHARMACIST`, `CASHIER`, and `AUDITOR`.
  - Immutable Audit Trail Inspector:
    - Chronological log of critical pharmacy business events and security actions with localized timestamps and acting user attribution.
    - Action filter dropdown (`STORE_SETTINGS_UPDATE`, `USER_CREATE`, `USER_UPDATE`, `LOGIN`, `LOGOUT`, `SALE_CREATE`, `SALE_VOID`, `STOCK_ADJUST`, `PURCHASE_RECEIVE`, `RETURN_PROCESS`).
    - Event payload modal inspecting structured JSON audit metadata.
- Domain Invariants & Calculations:
  - `src/domain/settings.ts`:
    - `isValidGstin`: Regular expression validation matching statutory 15-character Indian GSTIN format.
    - `storeSettingsUpdateSchema`: Zod schema validating pharmacy profile, tax parameters, invoice sequence bounds, and receipt notices.
  - `src/domain/rbac.ts`:
    - `hasPermission`: RBAC permission evaluator supporting root wildcard (`*`) for `OWNER` and role-specific workspace grants.
    - `createUserSchema` & `updateUserSchema`: Zod validation schemas enforcing username rules, display name constraints, and password lengths.
    - Role defaults mapping permissions for `OWNER`, `MANAGER`, `PHARMACIST`, `CASHIER`, and `AUDITOR`.
  - `src/domain/audit.ts`:
    - `auditFilterSchema`: Validates query parameters for audit log exploration.
    - `formatActionLabel`: Transforms raw action constants into user-friendly labels.
- Real Database-Backed API Endpoints:
  - `GET /api/settings`: Returns pharmacy store metadata and `StoreSettings` configuration.
  - `PATCH /api/settings`: Protected by RBAC `settings` permission; updates store name and upserts `StoreSettings`, creating an immutable `STORE_SETTINGS_UPDATE` audit event.
  - `GET /api/users`: Returns registered users with roles and permissions for the active store.
  - `POST /api/users`: Validates unique username, hashes password via Argon2, assigns role, and records `USER_CREATE` audit event.
  - `PATCH /api/users/[id]`: Updates user attributes, password, status, or role; enforces self-deactivation prevention, and records `USER_UPDATE` audit event.
  - `GET /api/audit-trail`: Scoped query returning paginated `AuditEvent` records with user relations, action filters, and total counts.
- Validation status:
  - **Unit tests:** 92 unit tests passing across 10 test files (`tests/settings.test.ts` added with 9 tests covering GSTIN validation, RBAC evaluation, user schemas, and audit formatting).
  - **TypeScript:** 0 errors (`npx tsc --noEmit` exited with code 0).
  - **ESLint:** 0 errors (`npm run lint` exited with code 0).
  - **Next.js Production Build:** Succeeded (`npm run build` compiled all 54 static and dynamic routes).
  - **E2E Script:** `scripts/verify-m9.mjs` implemented for automated verification of settings, users, RBAC, and audit log.

## Milestone 10: Bulk Import/Export and Backup/Restore

**Complete.**

- Data Management & Disaster Recovery Workspace (`/backup`):
  - Bulk CSV Operations:
    - Medicine Catalog:
      - CSV export with computed available stock and batch counts.
      - Downloadable CSV template with standard fields.
      - Upload and dry-run validation reporting row-level errors (missing name, negative tax, invalid safety limits, in-file duplicate barcodes).
      - Non-destructive execution inserting new records or updating matching barcodes without resetting demo data.
    - Supplier Directory:
      - CSV export with outstanding balances and purchase transaction counts.
      - Downloadable CSV template with contact and tax fields.
      - Upload and dry-run validation enforcing 7+ digit phone numbers, email syntax, and statutory 15-character GSTIN format.
      - Safe import upserting or creating suppliers scoped to store.
  - Database Backup & Disaster Recovery:
    - Offline, portable JSON backup generation containing all store-scoped tables: store profile, settings, medicines, batches, inventory movements, suppliers, customers, sales invoices, purchase invoices, ledgers, vouchers, and audit logs.
    - Cryptographic SHA-256 manifest sealing each backup snapshot against tampering or corruption.
    - Two-phase restore safety safeguards:
      - Phase 1: Dry-run / preview validating manifest version, schema, store ID compatibility, and checksum matching.
      - Phase 2: Explicit confirmation safeguard requiring text confirmation (`CONFIRM_RESTORE`) to prevent accidental data overwrites.
      - Safe scoped restoration protecting pre-existing demo data and recording immutable audit events.
  - Operation Audit Trail:
    - Direct log view filtered for data lifecycle events (`MEDICINE_EXPORT`, `MEDICINE_IMPORT`, `SUPPLIER_EXPORT`, `SUPPLIER_IMPORT`, `DATABASE_BACKUP`, `DATABASE_RESTORE`).
- Domain Invariants & RFC 4180 Handling:
  - `src/domain/backup-import.ts`:
    - `parseCsv`: Standard-compliant RFC 4180 CSV parser handling double quote escaping (`""`), commas and newlines within quotes, CRLF/LF line endings, and UTF-8 BOM stripping.
    - `generateCsv`: RFC 4180 CSV serializer with quote escaping.
    - `validateMedicineImportCsv`: Row-by-row validation with Zod schemas and in-file duplicate barcode detection.
    - `validateSupplierImportCsv`: Row-by-row validation with GSTIN format verification and contact validation.
    - `computeBackupChecksum`: SHA-256 cryptographic digest calculation over canonical JSON payload.
    - `validateBackupPayload`: Multi-layer validation verifying manifest structure, store ID matching, and checksum integrity.
    - `canPerformRestore`: Confirmation string evaluator.
- Real Database-Backed API Endpoints:
  - `GET /api/export/medicines`: Generates and streams `medicines.csv` with inventory counts and records `MEDICINE_EXPORT` audit event.
  - `POST /api/import/medicines`: Validates and imports medicine CSV rows with dry-run support and records `MEDICINE_IMPORT` audit event.
  - `GET /api/export/suppliers`: Generates and streams `suppliers.csv` with ledger balances and records `SUPPLIER_EXPORT` audit event.
  - `POST /api/import/suppliers`: Validates and imports supplier CSV rows with dry-run support and records `SUPPLIER_IMPORT` audit event.
  - `GET /api/backup`: Exports complete store snapshot with manifest and SHA-256 checksum, recording `DATABASE_BACKUP` audit event.
  - `POST /api/backup/restore`: Validates backup integrity and performs safe restore with dry-run preview and `CONFIRM_RESTORE` guard, recording `DATABASE_RESTORE` audit event.
- Validation status:
  - **Unit tests:** 107 unit tests passing across 11 test files (`tests/backup-import.test.ts` added with 15 tests covering RFC 4180 parsing, CSV generation, validation errors, duplicate detection, checksum verification, and confirmation guards).
  - **TypeScript:** 0 errors (`npx tsc --noEmit` exited with code 0).
  - **ESLint:** 0 errors (`npm run lint` exited with code 0).
  - **Next.js Production Build:** Succeeded (`npm run build` compiled all 61 static and dynamic routes).
  - **E2E Script:** `scripts/verify-m10.mjs` executed all 11 live verification checks with 100% pass rate.

## Milestone 11: Production Hardening, Offline Resilience, and Thermal Printer Support

**Complete.**

- Thermal Receipt Printer (ESC/POS) Architecture:
  - `src/domain/thermal-printer.ts`:
    - Standard ESC/POS formatting for 58mm (32 columns) and 80mm (42/48 columns) thermal paper widths.
    - Implemented hardware control sequences: `ESC @` (init), `ESC a n` (alignment), `GS ! n` (character sizing), `ESC E n` (bold mode), and `GS V 66 0` (partial cut).
    - Monospace text formatter (`formatThermalTextReceipt`) with bounded column widths, automatic wrapping for pharmacy details, item-level batch codes, and totals.
    - Binary ESC/POS command stream generator (`generateEscPosCommands`) returning `Uint8Array`.
  - API Endpoints:
    - Enhanced `GET /api/sales/[id]` supporting `?format=escpos` (streaming raw binary command file) and `?format=text` (monospaced plain text).
  - Billing / POS Workspace Integration (`src/components/billing-workspace.tsx`):
    - Receipt modal paper width selector: `58mm Thermal (Compact)`, `80mm Thermal (Standard)`, and `A4 / Full Sheet`.
    - Print trigger invoking browser spooler with `@media print` thermal page rules.
    - Direct "Download ESC/POS (.bin)" and "Download Text (.txt)" export actions for USB/network thermal spooling.
- Offline Resilience & POS Cart Preservation:
  - Real-time connectivity monitor tracking `navigator.onLine` and `online`/`offline` window events.
  - Header connectivity badge displaying `🟢 Online` vs `🟠 Offline · Draft Preserved Locally`.
  - Warning banner alerting user when offline that cart is safe locally, while live inventory verification and sales posting require active server connection.
  - Automatic `sessionStorage` draft persistence for cart items, customer selections, doctor notes, and discount values with auto-restore on mount.
  - "Clear Cart" button for discarding active draft.
  - Transparent network error handling with retry instructions, strictly prohibiting unverified speculative offline financial mutations.
- Production Deployment & Hardening:
  - Production Health Check endpoint (`GET /api/health`):
    - Reports system status, ISO timestamp, process uptime, environment, RSS memory in MB, and database latency via `SELECT 1`.
  - Production configuration:
    - Updated `.env.example` with comprehensive production placeholders and security comments.
    - Created `DEPLOYMENT.md` providing step-by-step deployment instructions: dependencies installation, migrations (`prisma migrate deploy`), production build (`npm run build`), server execution (`npm start` / PM2), health monitoring, thermal printer hardware spooling, and offline resilience guidelines.
- Validation status:
  - **Unit tests:** 111 unit tests passing across 12 test files (`tests/thermal-printer.test.ts` added with 4 tests verifying 58mm 32-col bounds, 80mm 42-col bounds, ESC/POS byte sequence init & cut).
  - **TypeScript:** 0 errors (`npx tsc --noEmit` exited with code 0).
  - **ESLint:** 0 errors (`npm run lint` exited with code 0).
  - **Next.js Production Build:** Succeeded (`npm run build` compiled all 62 static and dynamic routes).
  - **E2E Script:** `scripts/verify-m11.mjs` executed live against local PostgreSQL with 100% pass rate.



