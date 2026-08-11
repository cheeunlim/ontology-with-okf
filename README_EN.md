# 🌐 OKF Omni: Enterprise Ontology Integration Platform

**[🇺🇸 English Guide (README_EN.md)](./README_EN.md) | [🇰🇷 한국어 문서 (README.md)](./README.md)**

[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-red.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/🚀_Cloud_Run_Live_Demo-Click_to_Launch-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://okf-omni-924723860007.us-central1.run.app/)
[![Project Master](https://img.shields.io/badge/Master_Spec-prod.md-FF6F00?style=for-the-badge&logo=markdown&logoColor=white)](./prod.md)
[![Agent Spec](https://img.shields.io/badge/AI_Engine-AGENT.md-34A853?style=for-the-badge&logo=googlegemini&logoColor=white)](./AGENT.md)
[![Design System](https://img.shields.io/badge/Design_System-DESIGN.md-9333EA?style=for-the-badge&logo=figma&logoColor=white)](./DESIGN.md)

**OKF Omni** is an enterprise-grade ontology integration and semantic intelligence platform. It bridges the gap between **structured data assets** (BigQuery data lake schemas, physical tables, views, Property Graphs) and **unstructured business knowledge** (internal wiki documents, customer support manuals, corporate policy PDFs) by compiling them into a unified **Google Cloud Open Knowledge Format (OKF v0.2)** knowledge graph.

---

## ⚡ 1-Click Live Demo
Experience the live production platform deployed on Google Cloud Run:

[![Launch Demo App](https://img.shields.io/badge/👉_https://okf--omni--924723860007.us--central1.run.app/-ENTER_PLATFORM-FF6F00?style=for-the-badge&logo=googlechrome&logoColor=white)](https://okf-omni-924723860007.us-central1.run.app/)

---

## 🌟 Key Capabilities

1. **Structured & Unstructured Knowledge Transpilation**:
   - Compiles raw PDF policies, CS manuals, and markdown wikis into OKF v0.2 standard format with YAML frontmatter, bidirectional backlinks (`[[Entity]]`), and footnote citations (`[^id]`).
   - Harvests BigQuery physical tables/views metadata and generates OKF markdown documentation.
2. **Cross-Domain Metadata Enrichment**:
   - Cross-references business terms in unstructured documents with physical table columns in BigQuery to generate enriched column-level descriptions and business context.
3. **Autonomous BigQuery Property Graph Synthesis**:
   - Analyzes schema dependencies, foreign keys, and query patterns to automatically generate standard BigQuery Property Graph DDL and GQL (`GRAPH_TABLE`) definitions.
4. **Autonomous AI Data Agent with Self-Healing**:
   - Powered by `gemini-3.5-flash` with full **Thought-Process inspection**, hybrid SQL/GQL query execution, 1-retry automatic query repair loop, and OKF-attested computation receipts.
5. **Dataplex Universal Catalog Sync**:
   - Synchronizes enriched OKF metadata directly with GCP Dataplex Universal Catalog aspects (`okf-aspect.json`) and native business glossaries.

---

## 🏛️ Architecture & Documentation System

The project is governed by a strict Single Source of Truth (SSOT) hierarchy:

| Area | Core Document / Directory | Description & Role |
| :--- | :--- | :--- |
| 🚀 **Project Master** | **[`prod.md`](./prod.md)** | **[SSOT]** Master project specification, epic-to-task matrix, ripple policy |
| 🤖 **AI Agent Spec** | **[`AGENT.md`](./AGENT.md)** | Multi-agent orchestration, `gemini-3.5-flash` specs, thoughts extraction, self-healing |
| 🎨 **Design System** | **[`DESIGN.md`](./DESIGN.md)** | 5-tab UI navigation structure, rich aesthetic theme tokens, UI component rules |
| 🧠 **Gemini Specs** | **[`GEMINI.md`](./GEMINI.md)** | Model integration specifications, prompt centralization, view fallback rules |
| 🛠️ **Workflow Skills** | **[`SKILL.md`](./SKILL.md)** | Developer workflow skills (`/epic-dev`, `/local-test`, `/cloud-deploy`, `/github-push`) |
| 📑 **Documents** | **[`documents/`](./documents/)** | System architecture (`01`), developer/user guides (`02`), Epics (`03`), Tasks (`04`) |
| 💻 **Source Code** | **[`srcs/`](./srcs/)** | Express backend gateway, React frontend, AI agents, prompts, and tools |
| 📚 **References** | **[`references/`](./references/)** | External reference frameworks (OKF v0.2 spec, sample docs, templates) |

---

## 📂 Directory Structure

```text
ontology-with-okf/
├── .gitignore                # 🛡️ Git ignore rules (zero-leak policy)
├── LICENSE                   # 📜 PolyForm Noncommercial 1.0.0 License
├── AGENT.md                  # 🤖 AI Agent architecture & Gemini standard
├── DESIGN.md                 # 🎨 UI/UX Design System & 5-tab layout
├── GEMINI.md                 # 🧠 Gemini integration spec & inference rules
├── prod.md                   # 🚀 [SSOT] Project master specification
├── SKILL.md                  # 🛠️ [Skills Master] Workflow skill specifications
├── README.md                 # 🌐 Main documentation (Korean)
├── README_EN.md              # 🌐 Project overview & guide (English)
│
├── skills/                   # 🛠️ Development & operational workflow skills
│   ├── EPIC_TASK_DEV.md      # Epic-to-task continuous development workflow
│   ├── LOCAL_TEST_AND_DEPLOY.md # Local browser test & Cloud Run deploy skill
│   ├── GITHUB_PUSH.md        # Code cleanup, security scan & push skill
│   ├── GITHUB_REF_UPDATE.md  # External reference repository update skill
│   └── DEV_WORKFLOW.md       # Development policy validation skill
│
├── documents/                # 📑 Architecture, guidelines, Epics & Tasks
│   ├── 01_architecture/      # Roadmap & LLM-Wiki engine design specifications
│   ├── 02_guidelines/        # Developer guide, user guide, testing log
│   ├── 03_epics/             # Epic specifications (EPIC-001 ~ EPIC-008)
│   └── 04_tasks/             # Task specifications (TASK-001 ~ TASK-008)
│
├── references/               # 📚 Reference specifications & templates
│   ├── knowledge-catalog/    # Google Cloud OKF reference implementation
│   ├── sample_docs/          # Business sample PDF documents
│   ├── okf_templates/        # OKF standard markdown templates
│   └── specifications/       # Policy YAMLs and architecture proposals
│
└── srcs/                     # 💻 Full application source code & server
    ├── package.json          # Node.js project configuration & dependencies
    ├── package-lock.json     # Dependency lockfile
    ├── vite.config.js        # Vite bundler configuration (port: 3003)
    ├── server.js             # Express API backend gateway
    ├── start_server.sh       # Auto-restart sentinel daemon script
    ├── Dockerfile            # Cloud Run container build specification
    ├── index.html            # React HTML entrypoint
    ├── deploy/               # Deployment configuration
    ├── scripts/              # Utility scripts
    ├── scratch/              # Local cache & temporary store
    ├── dist/                 # Frontend build artifacts
    ├── public/               # Static assets & favicon
    └── src/                  # Core frontend & backend modules
        ├── agents/           # Gemini 3.5 Flash client (geminiAgent.js)
        ├── prompts/          # Centralized prompt templates (agentPrompts.js)
        ├── tools/            # GCP BigQuery, GCS, Dataplex tools (gcpTools.js)
        ├── components/       # React UI components & studio tabs
        ├── lib/              # Utility libraries & pipeline helpers
        ├── assets/           # Icons and image assets
        ├── server.js         # API gateway server logic
        ├── App.jsx           # React main application
        ├── App.css           # Component styles
        ├── index.css         # Global design tokens
        └── main.jsx          # React rendering entrypoint
```

---

## 🚀 4-Step Quickstart

### Step 1: Prerequisites & Clone
- **Node.js**: v18.0 or higher
- **Google Cloud SDK (`gcloud`)**: Authenticated with access to BigQuery and Dataplex
- **Gemini API Key**: `GEMINI_API_KEY` (or Google Cloud ADC credentials)

```bash
git clone https://github.com/seanjungG/ontology-with-okf.git
cd ontology-with-okf/srcs
```

### Step 2: Environment Configuration
Create a `.env` file inside the `srcs/` directory (ensure it is excluded by `.gitignore`):

```bash
# In srcs/.env
PORT=3003
GEMINI_API_KEY="your-gemini-api-key"
GCP_PROJECT_ID="your-gcp-project-id"
BIGQUERY_DATASET="your_bigquery_dataset"
```

### Step 3: Install Dependencies & Build
```bash
# Inside srcs directory
npm install
npm run build
```

### Step 4: Launch Backend & Web Interface
```bash
# Start the unified server on port 3003
node server.js

# Or start with auto-restart sentinel daemon
bash start_server.sh
```

- **Open Web Application**: [http://localhost:3003](http://localhost:3003)

---

## 🛡️ Security & Zero-Leak Policy

- **Application Default Credentials (ADC)**: The application leverages standard GCP ADC or securely passed environment variables.
- **Zero API Key Leakage**: No API keys, credentials, service account keys (`*key*.json`), or confidential customer data are ever committed to git history.
- **Strict `.gitignore`**: Environment configurations (`.env*`), private keys, cache directories, and build artifacts are strictly excluded.

---

## 📜 License & Terms of Use

This project is licensed and distributed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

### ✅ Permitted Noncommercial Uses
- **Personal Learning & Academic Research**: Free to clone, study, experiment with, and adapt for personal learning, academic research, and non-commercial prototyping.
- **Nonprofit Organizations & Educational Institutions**: Permitted for use by accredited universities, public research organizations, and non-profit educational initiatives.
- **Open Knowledge Format (OKF) Reference**: Free to evaluate as a reference implementation for enterprise ontology and knowledge graphs.

### 🚫 Commercial Use Strictly Prohibited
- **Commercial SaaS / Paid Hosting**: Incorporating the codebase or derived works into commercial products, paid SaaS offerings, or hosted commercial cloud services is strictly prohibited without prior written permission.
- **Enterprise Proprietary Deployment**: Unauthorized commercial deployment within revenue-generating production environments is restricted.
- **Resale & Sublicensing**: Sublicensing, distributing for fee, or commercial bundling of this software is strictly prohibited.

### 💼 Commercial Licensing Inquiries
For commercial licensing, enterprise production integration, or commercial partnership inquiries, please contact the author:
* **Licensor / Author**: `seanjung` (<seanjung@google.com>)
* **Full License Text**: [`LICENSE`](./LICENSE)
