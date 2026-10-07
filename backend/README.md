# MTN Business Support System (BSS) - Core Backend Engine

A simulated Telecom Business Support System (BSS) and Operations Support System (OSS) backend built with **Node.js, Express, TypeScript, PostgreSQL (Drizzle ORM), and Redis**.

This project simulates how a modern telecom operator like MTN handles subscriber lifecycles, KYC registration, airtime retail distribution via USSD agents, real-time balance rating, and bundle conversions (Data, Voice, and SMS) via Africa's Talking USSD Gateway.

---

## 🏗️ System Architecture

The system consists of two primary operational layers:

```
                        │     Africa's Talking USSD Gateway       │
                      │        (*131# Dial Handler)             │
                      └────────────────────┬────────────────────┘
                                           │
                                   Lookup Phone Number
                                           │
                   ┌───────────────────────┴───────────────────────┐
                   ▼                                               ▼
        Role: AGENT / SELLER                             Role: SUBSCRIBER
┌─────────────────────────────────┐             ┌─────────────────────────────────┐
│ 1. Sell Airtime to Subscriber   │             │ 1. Check Balances               │
│ 2. Check Float Balance          │             │ 2. Buy Data Bundles             │
│ 3. Check Recent Sales           │             │ 3. Buy Voice Bundles            │
└────────────────┬────────────────┘             │ 4. Buy SMS Bundles              │
                 │                              └────────────────┬────────────────┘
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │
                                         ▼
                      ┌─────────────────────────────────────────┐
                      │         MTN BSS Admin Dashboard         │
                      │   • Onboard Subscribers & SIM Cards     │
                      │   • Register Agents & Allocate Float    │
                      │   • Manage Products (Data/Voice/SMS)    │
                      │   • Monitor Transactions & Usage CDRs   │
                      └─────────────────────────────────────────┘
```

1. **Dual-Persona USSD Layer (`*131#`):** Interfaced via Africa's Talking API with Redis session state management. Automatically detects whether the caller is an **Agent Seller** (to load subscriber airtime) or a **Subscriber** (to check balances and buy bundles).
2. **MTN HQ Admin BSS Dashboard REST API:** Provides operational endpoints for registering subscribers, verifying KYC, assigning physical SIMs, issuing airtime float stock to agents, and tracking network consumption telemetry (CDRs).

---

## ⚡ Tech Stack

- **Runtime & Framework:** Node.js, Express.js (TypeScript)
- **Database & ORM:** PostgreSQL, Drizzle ORM
- **Session Cache:** Redis (USSD State Machine tracking)
- **Telephony Gateway:** Africa's Talking USSD Gateway API
- **Financial Calculations:** Integer Minor Unit Ledger (1 SSP = 100 minor units) for zero-floating-point financial accuracy.

---

## 📊 Core Data Entities

- **`users`:** Unified identity model with Role-Based Access Control (`ADMIN`, `AGENT`, `SUBSCRIBER`).
- **`subscribers`:** Profile data, National ID (NIN), and KYC status (`PENDING`, `VERIFIED`, `REJECTED`).
- **`agents`:** Airtime retailer inventory profiles, 4-digit USSD PIN hashes, and float stock balances (`floatBalanceMinor`).
- **`sim_cards` & `msisdns`:** Physical ICCID/IMSI tracking paired with assigned phone numbers.
- **`charging_accounts`:** Subscriber airtime wallets operating with optimistic concurrency locks (`version`).
- **`products`:** Catalog configurations defining capacity allowances in base units (`BYTES`, `SECONDS`, `COUNT`).
- **`product_instances`:** Active bundle allowances purchased by subscribers.
- **`orders`:** Financial transaction logs for top-ups and bundle purchases.
- **`usage_records`:** Call Detail Record (CDR) consumption events.

---

## 📱 USSD Menu Navigation Flows (`*131#`)

### Agent / Airtime Seller Persona

```text
Root Menu
1. Sell Airtime
2. Check Float Balance

Flow: Sell Airtime
CON Enter Subscriber Phone Number: 0920000001
CON Enter Airtime Amount in SSP: 10000
CON Enter 4-digit Agent PIN: ****
END Success! 10,000 SSP airtime loaded to 0920000001. Ref: TXN-982341.

```

Subscriber Persona
Plaintext
Root Menu

1. Check Balances
2. Buy Data Bundles
3. Buy Voice Bundles
4. Buy SMS Bundles

Flow: Buy Data Bundle
CON Select Data Package:

1. 1GB Daily @ 5,000 SSP
2. 5GB Weekly @ 20,000 SSP
   CON Confirm purchase of 1GB Daily for 5,000 SSP? (1. Yes / 2. No)
   END Success! 1GB Daily Data Bundle active. Remaining Airtime: 5,000 SSP.

🚀 Getting Started

1. Prerequisites
   Node.js v18+

PostgreSQL instance

Redis instance

2. Environment Setup
   Create a .env file in the root directory:

PORT=5000
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mtn_bss_db
REDIS_URL=redis://localhost:6379
AT_USERNAME=sandbox
AT_API_KEY=your_africastalking_api_key

3. Installation & Database Setup
   Bash

# Install dependencies

npm install

# Push database schema to PostgreSQL

npm run db:push

# Seed database with initial catalog, agents, and subscribers

npm run db:seed

# Start development server with hot-reload

npm run dev

Available Scripts

```
|Command             |       Action
|------------------------------------------------------------------------------
|npm run dev         |    Runs local server with tsx watch mode on src/index.ts.
|npm run build,      |   Compiles TypeScript source files into ./dist.
|npm run start,      |    Runs compiled production JavaScript server.
|npm run db:push,    |    Applies Drizzle ORM schema directly to PostgreSQL.
|npm run db:seed,    |   Populates default products catalog, demo agent,
|                    |   and subscriber    records."
| npm run db:studio, |  Launches Drizzle Studio GUI for interactive database inspection.
```
