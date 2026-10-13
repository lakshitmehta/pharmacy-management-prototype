# PillBills - Production Deployment & Hardware Integration Guide

This guide details the procedures for deploying the PillBills Pharmacy Management System in a production environment, configuring thermal receipt printers, and understanding offline resilience.

---

## 1. Prerequisites

- **Node.js**: v20.x or higher (Node v24 supported)
- **PostgreSQL**: Version 15 or higher (native or Docker container)
- **Memory**: Minimum 2 GB RAM (4 GB recommended for production builds)
- **Disk**: 10 GB free space for database storage, logs, and backups

---

## 2. Step-by-Step Production Setup

### Step 1: Install Dependencies
```bash
npm ci
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure the following variables are defined:
- `DATABASE_URL`: Connection string pointing to your PostgreSQL instance.
- `NODE_ENV`: Set to `production`.
- `SESSION_COOKIE_NAME`: Cookie name for HTTP-only authenticated sessions.
- `SESSION_TTL_DAYS`: Session expiry duration (e.g. `30`).
- `PORT`: HTTP port (defaults to `3000`).

### Step 3: Run Database Migrations
Apply Prisma migrations to initialize or update the PostgreSQL schema:
```bash
npx prisma migrate deploy
```

*(Optional) For initial store bootstrap and default roles/admin, run:*
```bash
npm run db:seed
```

### Step 4: Build the Production Application
Compile the Next.js application:
```bash
npm run build
```

### Step 5: Start the Production Server
Start the Next.js production server:
```bash
npm start
```
*For process management with PM2:*
```bash
pm2 start npm --name "pillbills" -- start
```

---

## 3. Production Health Monitoring

PillBills exposes an unauthenticated health check endpoint for container orchestrators (Docker, Kubernetes) and load balancers:

- **Endpoint**: `GET /api/health`
- **Response Format**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-11T12:00:00.000Z",
    "uptimeSeconds": 1420,
    "environment": "production",
    "version": "0.1.0",
    "database": {
      "status": "connected",
      "latencyMs": 3
    },
    "system": {
      "memoryRssMb": 98.4,
      "nodeVersion": "v24.16.0"
    },
    "totalResponseTimeMs": 4
  }
  ```
- **HTTP Status**: Returns `200 OK` when database and app are healthy; returns `503 Service Unavailable` if database connectivity fails.

---

## 4. Thermal Receipt Printer Setup (ESC/POS)

PillBills supports standard 58mm and 80mm thermal receipt printers via two complementary methods:

### Method A: Browser Spooler Printing (Zero Setup)
1. In the Billing / POS screen, complete a sale.
2. The printable receipt dialog appears with a paper width toggle:
   - **58mm Thermal (Compact)**: 32 columns.
   - **80mm Thermal (Standard)**: 42/48 columns.
   - **A4 / Full Sheet**: Standard desktop printer format.
3. Click **🖨️ Print Receipt**.
4. In the browser print dialog:
   - Select your thermal receipt printer (e.g., POS-58, EPSON TM-T88, TVS, Xprinter).
   - Set Margins to **None** (zero margins).
   - The CSS `@media print` rules automatically size the ticket to the exact millimeter dimensions without clipping.

### Method B: Raw ESC/POS Binary Download & Spooling
PillBills encodes standard ESC/POS hardware control codes:
- `ESC @` (0x1B 0x40): Hardware initialization
- `ESC a n` (0x1B 0x61 n): Center / Left alignment
- `GS ! n` (0x1D 0x21 n): Double-width/double-height title
- `ESC E n` (0x1B 0x45 n): Emphasized bold text
- `GS V 66 0` (0x1D 0x56 0x42 0x00): Partial paper cut

**Direct Printing via Terminal/Spooler:**
- From the POS modal or via API:
  `GET /api/sales/:id?format=escpos&width=80mm`
- Send the binary stream directly to the thermal printer port:
  - **Windows (Shared USB/Network Printer)**:
    ```cmd
    copy /b receipt-INV-0001.bin \\localhost\ThermalPrinter
    ```
  - **Linux / Raspberry Pi**:
    ```bash
    cat receipt-INV-0001.bin > /dev/usb/lp0
    ```

---

## 5. Offline Resilience Architecture

PillBills implements a safe, pragmatic offline model designed for retail pharmacy integrity:

1. **Automatic Bill Draft Preservation**:
   - Active billing cart lines, selected customer details, doctor name, and settlement options are automatically cached in browser `sessionStorage`.
   - If internet connectivity drops, or the tab/browser is accidentally closed or refreshed, the cart is automatically restored with a notice.
2. **Online / Offline Status Indicator**:
   - The billing workspace displays a real-time connectivity badge:
     - `🟢 Online`
     - `🟠 Offline · Draft Preserved Locally`
   - When offline, a warning banner explains that current draft data is safe locally, while live batch inventory lookups and financial postings require server connectivity.
3. **Financial Integrity & Double-Entry Guarantee**:
   - PillBills **does not** perform speculative offline balance updates or queue unverified financial transactions.
   - All sales invoices, batch movements, Khata ledger postings, and voucher entries are executed atomically in PostgreSQL transactions to eliminate double-spend, ghost stock, and unverified credit.

