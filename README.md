# PillBills Independent Pharmacy POS

An independent TypeScript pharmacy/POS application based on the verified PillBills audit. It has its own PostgreSQL database, authentication, domain services, audit records, and synthetic demo data.

## Local setup

Requirements: Node.js 24+, npm, and Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run db:generate
npm run db:migrate -- --name foundation
npm run db:seed
npm run dev
```

Open `http://localhost:3000` after starting the development server.

Synthetic seed login: `admin` / `ChangeMe!123`. Change this password before using the application outside local development.

## Commands

- `npm run dev`: start the development server.
- `npm run build`: create a production build.
- `npm run lint`: run ESLint.
- `npm test`: run unit tests.
- `npm run db:migrate`: create/apply a local Prisma migration.
- `npm run db:seed`: load synthetic pharmacy data.

## Data integrity

Inventory changes are append-only movement records. Customer receipts and supplier payments are allocated FIFO. Posted records are not deleted; future correction workflows use reversal records. Business mutations will execute inside PostgreSQL transactions.

## Configuration and deployment

Copy `.env.example` to an environment-specific `.env`. Never commit secrets. Production deployment requires PostgreSQL, secure HTTPS cookies, a strong database password, and scheduled backups. Backup/restore workflows will be implemented in the operations milestone.

## Implementation status

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for the milestone checklist, verified checks, pending infrastructure items, and explicit decisions for audited unknown behavior.
