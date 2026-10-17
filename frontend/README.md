# MTN BSS Admin Dashboard (Frontend)

The administrative web portal for the MTN Business Support System (BSS). Built for telecommunications operators and system administrators to oversee field agent liquidity, manage account statuses, and monitor immutable system audit logs in real-time.

---

## 🛠 Tech Stack

- **Core Framework**: React, TypeScript, Vite
- **Styling**: Tailwind CSS (clean, minimalist enterprise design)
- **Routing**: React Router
- **API Client**: Axios / Native Fetch with interceptors for JWT injection
- **Icons**: Lucide React

---

## 📂 Project Structure

```
frontend/
├── public/                       # Static assets & favicons
├── src/
│   ├── assets/                   # Images and branding assets
│   ├── components/               # Reusable UI components (Modals, Tables, Buttons)
│   ├── context/                  # Auth and global state management
│   ├── hooks/                    # Custom React hooks (useAuth, useAgents)
│   ├── pages/                    # Core view components (Login, Dashboard, Agents, AuditLogs)
│   ├── services/                 # API service modules (authService, agentService)
│   ├── types/                    # TypeScript interfaces & type definitions
│   ├── App.tsx                   # Root component & route definitions
│   └── main.tsx                  # Application entry point
├── tailwind.config.js            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript compiler configuration
└── package.json                  # Frontend dependencies and scripts
```

🚀 Key Features & UI Modules

1. Secure Authentication Portal

Clean login screen for administrative credentials.
Stateless JWT session storage with automatic redirection for expired tokens (401 Unauthorized).

2. Agent Directory & Management

Search & Filter: Real-time filtering of agents by name, agent code (AGT-XXXX), or operational status (ACTIVE, SUSPENDED, LOCKED).
Onboarding Modal: Secure form to provision new field agents with auto-generated or custom codes and secure 4-digit USSD PINs.

3. Financial Float Adjustments

   Interactive modal for crediting or debiting agent float balances in minor units (SSP).
   Mandatory audit justification field required before submitting any financial movement.
   Real-time validation blocking adjustments on inactive or suspended accounts (403 Forbidden). 4. Status Control Center

   Instant toggling of agent operational states (ACTIVE --> SUSPENDED / LOCKED).
   Audit trail feedback confirming successful status transitions.

   ⚙️ Environment Variables
   Create a .env file in the root of the frontend directory with your backend API base URL:
   Code snippet
   VITE_API_BASE_URL=http://localhost:5000/api/v1

   📥 Installation & Local Development

   Navigate to the frontend directory:

   Bash
   cd frontend

   Install dependencies:Bashnpm install
   Start the development server:

   Bash
   npm run dev

   Build for production:

   Bash
   npm run build

   🎨 Design Principles

   Designed following clean, realistic, and minimalist enterprise UI standards:

   Zero AI-Slop: Avoids superfluous background gradients, placeholder cards, and bloated component libraries.

   Data-Dense & Scannable: Optimized tables and status badges allowing operators to assess agent liquidity and risk at a glance.
