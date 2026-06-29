# 📡 SkillSwap — Freelance Micro-Task Platform Server

This is the secure Node.js & Express.js backend server for SkillSwap—a freelance micro-task marketplace platform. It handles the database operations, secure role-based API endpoints, dynamic task queries, and manages data integration with MongoDB for smooth client-freelancer coordination.

---

## 🔗 Project Links & Base URL

* **🌐 Deployed Live Server:** [Live API Endpoint](https://skillswap-server-nu.vercel.app/)
* **💻 Server (Backend) Repository:** [GitHub Server Repo](https://github.com/ab-bakkar71/skillswap-server)
* **🎨 Frontend (Client) Repository:** [GitHub Client Repo](https://github.com/ab-bakkar71/skillswap-client)

---

## 🗄️ Database Architecture (MongoDB Schemas)

The server architecture connects directly with the MongoDB `skill_swap` cluster, structuring data into the following core collections:

* **`users`** -> Stores profile details, roles, skills, bio, and operational variables (`name`, `email`, `image`, `role`, `skills`, `bio`, `isBlocked`, `createdAt`).
* **`tasks`** -> Tracks platform micro-jobs, budgets, deadlines, and project statuses (`title`, `category`, `description`, `budget`, `deadline`, `client_email`, `status`, `deliverable_url`, `createdAt`).
* **`proposals`** -> Manages freelancer application bids and custom cover notes (`task_id`, `freelancer_email`, `proposed_budget`, `estimated_days`, `cover_note`, `status`, `submitted_at`).
* **`payments`** -> Logs transaction receipts validated natively (`client_email`, `freelancer_email`, `task_id`, `amount`, `transaction_id`, `payment_status`, `paid_at`).

---

## ⚡ Core API Routing Endpoints

### 💼 Client Operations
* `POST /api/tasks` — Publishes a new micro-task to the platform directory (default status: open).
* `GET /api/client/tasks` — Fetches tasks posted exclusively by the logged-in client.
* `PATCH /api/proposals/status` — Upgrades status flags for freelancer application lines.

### 🛠️ Freelancer Operations
* `GET /api/tasks/browse` — Features title search, category string filters, and a server-driven 9-document pagination index loop.
* `POST /api/proposals` — Commits a single distinct project bidding line per task.
* `PATCH /api/tasks/deliverable` — Attaches working deliverable URLs and updates status states to completed.

### 🛡️ Admin Controls
* `GET /api/admin/users` — Pulls data arrays mapping identity profiles.
* `PATCH /api/admin/users/update-status/:id` — Runs immediate Block/Unblock account restrictions.
* `DELETE /api/admin/tasks/delete/:id` — Removes guideline-violating text pipelines.

---

## 📦 Core NPM Packages Utilized

### Production Runtime Dependencies
* `express` — Minimalist web framework for building network routing parameters.
* `mongodb` — Native MongoDB driver for aggregating documents and managing connections.
* `cors` — Cross-Origin Resource Sharing controller to permit requests from the client domain safely.
* `dotenv` — Environmental configuration compiler for local workspace isolation.

---

