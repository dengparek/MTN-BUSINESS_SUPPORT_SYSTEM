# MTN Business Support System (BSS) & Admin Portal

A secure, production-ready telecommunications Business Support System and Administrative Dashboard designed for managing field agent liquidity, USSD-based authentication, financial reconciliation, and immutable audit logging.

---

## 🏗 System Architecture & Monorepo Structure

The project is structured as a full-stack monorepo separating the administrative backend API, the USSD gateway simulation service, and the frontend web dashboard.

```text
mtn-bss/
├── src/                          # Backend API & USSD Services (Node.js / Express)
│   ├── config/                   # Database & environment configurations
│   ├── database/                 # Drizzle ORM schema definitions & migrations
│   ├── middleware/               # JWT authentication, RBAC, and request validation
│   └── modules/                  # Feature modules
│       ├── admin/                # Admin auth, agent management, audit logs, float controls
│       └── ussd/                 # USSD session handling & agent PIN verification
├── frontend/                     # Admin Dashboard (React, Vite, Tailwind CSS)
└── README.md                     # Root project documentation
```

🚀 Core Features & Capabilities

1. Administrative & Agent Lifecycle Management
   Dual-Role Access Control: Strict separation between system Administrators (authenticated via stateless JWT and secure passwords) and Field Agents (authenticated via hashed 4-digit USSD PINs).

Agent Onboarding & Status Control: Automated unique agent code generation (AGT-XXXX) with lifecycle management (ACTIVE, SUSPENDED, LOCKED).

Compliance Guardrails: Inactive, suspended, or locked agents are automatically blocked from performing or receiving any financial transactions (403 Forbidden).

2. Financial Integrity & Liquidity Management
   BigInt Precision: All monetary values are processed and stored in minor units (BigInt) to prevent floating-point rounding errors.

Atomic Float Adjustments: Admin-driven CREDIT and DEBIT operations update agent balances securely inside atomic database transactions.

Automatic Idempotency Protection: Built-in 30-second temporal safety window prevents duplicate financial processing or accidental double-submits from the UI.

3. Immutable Audit Trails
   Comprehensive Tracking: Every administrative action (login, status change, float adjustment) generates an atomic audit log entry recording the acting admin UUID, target ID, request IP, and detailed description.

Loose UUID Targeting: Designed without strict foreign key constraints on targetId to support cross-entity auditing without migration gridlock.

🛠 Tech Stack
Backend Runtime: Node.js, Express.js, TypeScript

Database & ORM: Neon PostgreSQL, Drizzle ORM

Security: bcrypt, JSON Web Tokens (JWT), CORS, custom rate-limiting & sanitization

Frontend: React, Vite, Tailwind CSS

Development & Tooling: HTTPie / Postman for API validation

⚙️ Environment Variables
Create a .env file in the root directory (and inside the frontend folder where applicable) with the following configuration:

PORT=5000
DATABASE_URL=postgres://user:password@host:port/dbname
JWT_SECRET=your_super_secret_jwt_key_here
NODE_ENV=development

📥 Installation & Local Setup

Clone the repository:

git clone [https://github.com/your-username/mtn-bss.git](https://github.com/your-username/mtn-bss.git)

cd mtn-bss
Install backend dependencies:

Bash
npm install
Run database migrations (Drizzle):

Bash
npm run db:push
Start the backend development server:

Bash
npm run dev
Navigate to frontend and run the dashboard:

Bash
cd frontend
npm install
npm run dev

🔒 Security Policy
Zero Secret Leakage: Sensitive attributes such as pinHash are strictly scrubbed from all API responses.

Strict Parameter Normalization: All route parameters are validated and sanitized to type-safe strings before query execution.
