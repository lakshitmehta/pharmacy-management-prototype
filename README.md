# PillBills — Independent Pharmacy POS

An independent pharmacy management and point-of-sale (POS) application built with TypeScript. The project includes its own PostgreSQL database, authentication, domain services, audit records, and synthetic demo data.

## Features

- **Pharmacy POS and Billing** — sales processing and receipt printing.
- **Inventory Management** — medicine batches, stock movements, and expiry tracking.
- **Purchasing and Suppliers** — purchase invoices and supplier management.
- **Customer Management** — customer records, credit ledger (Khata), and returns.
- **Payments and Accounting** — payment records, cash and bank entries, and vouchers.
- **Reports** — sales, inventory, and financial reporting.
- **Security and Administration** — authentication, role-based access control (RBAC), and audit records.
- **Data Operations** — CSV import/export and database backup/restore workflows.
- **Offline Support** — preservation of billing drafts during connectivity interruptions.

## Tech Stack

- **Frontend and Application:** Next.js, React, TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Containerization:** Docker
- **Testing:** Vitest and TypeScript checks

## Local Setup

### Prerequisites

Install the following before starting:

- [Git](https://git-scm.com/)
- [Node.js 24+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- npm (included with Node.js)

### 1. Clone the repository

Open a terminal and run:

```powershell
git clone https://github.com/lakshitmehta/pharmacy-management-prototype.git
cd pharmacy-management-prototype
```

### 2. Configure environment variables

Create your local environment file from the example:

```powershell
Copy-Item .env.example .env
```

The `.env` file contains local configuration. Never commit real credentials or secrets to GitHub.

### 3. Start PostgreSQL

Make sure Docker Desktop is running, then execute:

```powershell
docker compose up -d postgres
```

### 4. Install dependencies

```powershell
npm install
```

### 5. Initialize the database

Generate the Prisma client, apply the database migration, and load synthetic demo data:

```powershell
npm run db:generate
npm run db:migrate -- --name foundation
npm run db:seed
```

### 6. Start the application

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo Login

The local seed configuration documents the following demo credentials:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `ChangeMe!123` |

These credentials are intended for local development with synthetic demo data. Verify that the seed script completes successfully before logging in. Change the default password before exposing the application beyond your local development environment.

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the unit test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:migrate` | Create or apply a development migration |
| `npm run db:seed` | Load synthetic demo data |

## Data Integrity

The application is designed around the following principles:

- Inventory changes are recorded through inventory movement records.
- Customer receipts and supplier payments use FIFO allocation.
- Posted records are intended to be corrected through reversal workflows rather than direct deletion.
- Business mutations use PostgreSQL transactions to maintain data consistency.

Review the implementation and tests before relying on these behaviours in a production environment.

## Configuration and Deployment

Local configuration is managed through `.env`, using `.env.example` as a template.

Before deploying outside local development:

- Use strong, unique database credentials.
- Configure HTTPS and secure session cookies.
- Restrict database access to trusted services.
- Protect and regularly test database backups and restoration.
- Change demo credentials and review authentication and authorization.
- Validate billing, inventory, accounting, and reporting calculations.
- Review `DEPLOYMENT.md` for deployment guidance.

**This project is a working prototype, not a certified or production-ready pharmacy system.** Further security, accounting, operational, and deployment reviews are required before real-world use.

## Implementation Status and Verification

Refer to [DEVELOPMENT_STATUS.md](https://github.com/lakshitmehta/pharmacy-management-prototype/blob/main/DEVELOPMENT_STATUS.md) for the milestone checklist, recorded verification results, outstanding infrastructure items, and implementation decisions.

## Repository

[GitHub — pharmacy-management-prototype](https://github.com/lakshitmehta/pharmacy-management-prototype)
