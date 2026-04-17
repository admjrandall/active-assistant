# Active Assistant — Implementation Plan (Master Index)

**Source of truth.** This index supersedes the monolithic `IMPLEMENTATION_PLAN.md`. Each phase doc is designed to be self-contained so a fresh AI session can execute it without reading any other phase.

**Audit date:** 2026-04-16
**Plan version:** 2.0 (split per-phase)
**App target:** Active Assistant — single-HTML client-side PM app (React 18 + Vite 6 + Tailwind + vite-plugin-singlefile)
**Storage modes:** `offline` (VaultDB, in-memory + .dat file) and `cloud` (M365 Dataverse). The legacy `sync` (RxDB) mode has been removed.

---

## How to use this plan

1. **Before coding any phase**, read `01-gap-report.md` to see what already exists vs. what the phase will add. Several phases are partially or fully done.
2. **Before making architectural choices**, read `02-architecture-decisions.md`. It flags tradeoffs the user must resolve (realtime strategy, WebLLM model size, legacy cleanup, role-case standardization, Dataverse table prefix, PWA approach).
3. **Each phase doc is self-contained.** It includes: preconditions, file-by-file changes with complete code, verification steps, and rollback notes. No phase doc assumes you have the others open.
4. **Dependencies flow downward.** Do not start Phase 2 until Phase 1 is green. Phase 4 (AI) can be deferred indefinitely.

---

## Session deliverables (this session — complete)

| # | Doc | Purpose |
|---|-----|---------|
| 00 | [00-index.md](00-index.md) | This file. |
| 01 | [01-gap-report.md](01-gap-report.md) | Per-phase Done / Partial / Missing / Wrong, grounded in code audit. |
| 02 | [02-architecture-decisions.md](02-architecture-decisions.md) | Tradeoffs flagged for user decision before Phase 2+ work. |

---

## Phase docs (per-session deliverables — future)

Each row = one future session. Status is from the gap report.

### Phase 1 — Foundation

| # | Doc | Status | Depends on | Notes |
|---|-----|--------|------------|-------|
| 1.1 | `phase-1.1-schemas.md` | ✅ Done | — | Verify only. `src/db/schemas.js` matches plan. |
| 1.2 | `phase-1.2-storage-simplification.md` | 🟡 Partial | 1.1 | Two-mode router done; legacy `offline.js` + `gist.js` not yet removed. |
| 1.3 | `phase-1.3-auth-wizard.md` | ✅ Done | 1.1, 1.2 | `WizardOnboarding.jsx` + `PasswordStrength.jsx` match plan. |
| 1.4 | `phase-1.4-user-management.md` | 🟡 Partial | 1.3 | First-user-admin logic in App.jsx; no admin UserManagement UI yet. |
| 1.5 | `phase-1.5-rbac.md` | ⚠️ Wrong-case | 1.4 | Code uses lowercase role keys (`'admin'`). Plan used uppercase (`'ADMIN'`). Decision: standardize on lowercase. |
| 1.6 | `phase-1.6-security.md` | 🟡 Partial | 1.5 | Session manager + WebAuthn wrappers exist; WebAuthn not wired into wizard. |

### Phase 2 — Collaboration

| # | Doc | Status | Depends on | Notes |
|---|-----|--------|------------|-------|
| 2.1 | `phase-2.1-workspaces.md` | 🟡 Partial | 1.4, 1.5 | Admin `WorkspaceManagement.jsx` done; per-workspace data scoping not implemented. |
| 2.2 | `phase-2.2-comments-mentions.md` | ✅ Done | 2.1 | `CommentThread.jsx` + `MentionInput.jsx` match plan. Needs integration into workspaces. |
| 2.3 | `phase-2.3-notifications.md` | ✅ Done | 2.2 | `NotificationCenter.jsx` + `useUnreadNotifications` match plan. 30s polling only (see decisions doc). |
| 2.4 | `phase-2.4-admin-dashboard.md` | ❌ Missing | 2.1 | No `AdminDashboard.jsx`, `UserManagement.jsx`, `AuditLogViewer.jsx`, `Analytics.jsx`. |
| 2.5 | `phase-2.5-activity-feed.md` | ❌ Missing | 2.2, 2.3 | No `ActivityFeed.jsx`. Audit log writes not yet implemented. |

### Phase 3 — Advanced

| # | Doc | Status | Depends on | Notes |
|---|-----|--------|------------|-------|
| 3.1 | `phase-3.1-time-tracking.md` | ❌ Missing | 1.1 | Schema exists; no UI, no timer, no reports. |
| 3.2 | `phase-3.2-gantt.md` | ❌ Missing | 1.1 | No lib installed. Decision needed: build vs. third-party. |
| 3.3 | `phase-3.3-dashboard-widgets.md` | ❌ Missing | 3.1 | Depends on time-tracking data. |
| 3.4 | `phase-3.4-reports-export.md` | ❌ Missing | 3.1, 3.3 | jsPDF + xlsx not installed. |
| 3.5 | `phase-3.5-pwa.md` | ❌ Missing | — | No `public/`, no manifest, no service worker. Decision needed: vite-plugin-pwa vs. manual. Conflicts with single-file build (see decisions doc). |
| 3.6 | `phase-3.6-integrations.md` | ❌ Missing | 3.1 | Email/calendar sync. Scope TBD. |

### Phase 4 — AI

| # | Doc | Status | Depends on | Notes |
|---|-----|--------|------------|-------|
| 4.1 | `phase-4.1-webllm-integration.md` | ❌ Missing | — | `@mlc-ai/web-llm` not installed. Decision needed: model choice (Gemma 4 9B ≈ 3GB vs. Phi-3.5-mini ≈ 2GB vs. Llama-3.2-3B ≈ 1.8GB). |
| 4.2 | `phase-4.2-chat-drawer.md` | ❌ Missing | 4.1 | |
| 4.3 | `phase-4.3-agents.md` | ❌ Missing | 4.1, 4.2 | |
| 4.4 | `phase-4.4-context-injection.md` | ❌ Missing | 4.1, 4.2 | Feeding project/task data into prompts. |

---

## Dependency graph (critical path)

```
1.1 schemas ─┬─ 1.2 storage ─ 1.3 wizard ─ 1.4 users ─ 1.5 rbac ─ 1.6 security
             │                                          │
             │                                          └─► 2.1 workspaces ─┬─ 2.2 comments ─ 2.3 notifs
             │                                                              └─ 2.4 admin ── 2.5 activity
             │
             ├─ 3.1 time ─┬─ 3.3 widgets ─ 3.4 reports
             │            └─ 3.6 integrations
             ├─ 3.2 gantt
             └─ 3.5 pwa  (independent)

4.1 webllm ─ 4.2 chat ─┬─ 4.3 agents
                       └─ 4.4 context
```

---

## Recommended session order

1. **This session:** 00, 01, 02 (done).
2. **Next session:** Review 01 + 02 with user; resolve the five decisions in 02. No code.
3. **Session 3:** `phase-1.2-storage-simplification.md` — the only Phase 1 item with real remaining work. Also writes a verification checklist for 1.1, 1.3, 1.4, 1.6 so we don't burn a whole session on each.
4. **Session 4:** `phase-1.5-rbac.md` — standardize role case, confirm permission table, write migration for any stored 'ADMIN' values.
5. **Session 5+:** Phase 2 docs, one per session, starting with 2.1.
6. Phase 3 and 4 sessions scheduled after Phase 2 ships.

---

## Conventions used by every phase doc

- **Preconditions** — what must be true before the phase starts (deps, prior phases, env).
- **Files touched** — explicit list; no surprises.
- **Complete code** — every new/changed file is shown in full. No `// ... rest unchanged`.
- **Verification** — manual test steps (we have no automated tests).
- **Rollback** — how to revert if the phase breaks prod.

---

## Non-goals (explicit)

- Multi-tenant server-side deployment (app is single-HTML, client-only).
- Real-time collaboration via WebSocket (see 02 — we chose polling).
- Mobile-native apps (PWA only, if at all).
- Automated test suite (out of scope for this plan; flagged as tech debt).
