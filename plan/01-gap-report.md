# Gap Report — Plan vs. Actual Code

**Audit date:** 2026-04-16
**Method:** Read every file referenced in `IMPLEMENTATION_PLAN.md` and cross-checked against the plan's prescribed content. Any deviation is flagged below.

Legend: ✅ Done · 🟡 Partial · ❌ Missing · ⚠️ Wrong (exists but diverges from plan)

---

## Phase 1 — Foundation

### 1.1 Schemas — ✅ Done
- `src/db/schemas.js` (497 lines) exports every schema the plan requires: `userSchema`, `workspaceSchema`, `permissionSchema`, `auditLogSchema`, `commentSchema`, `notificationSchema`, `timeEntrySchema`, updated `projectSchema`/`taskSchema`/`personSchema`/`clientSchema`/`communicationSchema`, plus `ALL_SCHEMAS`, `DATAVERSE_COLUMN_MAPS`, `JSON_FIELDS`.
- **Action in phase doc:** verification only — confirm `ALL_SCHEMAS` ordering matches VaultDB `STORES` array.

### 1.2 Storage simplification — 🟡 Partial
- ✅ `src/db/index.js` — two-mode router (offline / cloud) matches plan.
- ✅ `src/vault/VaultDB.js` — `STORES` updated to all 13 collections (verified in this session).
- ✅ `src/db/m365.js` — Dataverse layer complete with column mapping + JSON stringify/parse.
- ⚠️ **Legacy files present:**
  - `src/db/offline.js` (78 lines, IndexedDB, DB_VERSION 8, only 6 stores) — **not referenced** by the new router. Dead code.
  - `src/vault/gist.js` (82 lines, GitHub Gist storage) — **not referenced** by the new architecture. Dead code.
- ⚠️ Git status shows `src/sync/*` deleted but `package.json` may still reference RxDB/Dexie deps; need to audit for orphan dependencies.
- **Action in phase doc:** delete `src/db/offline.js`, delete `src/vault/gist.js`, audit `package.json` for unused RxDB/Dexie/pouchdb deps, verify router.

### 1.3 Auth wizard — ✅ Done
- `src/components/auth/WizardOnboarding.jsx` (357 lines) matches plan: 2-step wizard, offline/cloud branches, imports `PasswordStrength` + `getMsalApp` + `decryptVault`.
- `src/components/auth/PasswordStrength.jsx` (107 lines) matches plan 1:1.
- **Action in phase doc:** verification only.

### 1.4 User management — 🟡 Partial
- ✅ First-user-admin logic exists in `App.jsx` `handleAppUnlocked()` — creates a user record in Dataverse on first cloud login and assigns `'admin'` role.
- ✅ `src/hooks/useCurrentUser.js` matches plan.
- ❌ No admin-facing `UserManagement.jsx` (invite, edit role, deactivate).
- ❌ No user-profile / account settings UI.
- ✅ `ChangePasswordModal.jsx` exists (151 lines) with INITIAL_STATE pattern.
- **Action in phase doc:** build `src/components/admin/UserManagement.jsx`; build user-profile modal.

### 1.5 RBAC — ⚠️ Wrong-case (critical)
- `src/auth/rbac.js` (147 lines) uses **lowercase** role keys: `ROLE_KEYS = {ADMIN: 'admin', MANAGER: 'manager', ...}`.
- `src/App.jsx` writes `'admin'` to Dataverse for first-user.
- **Plan in `IMPLEMENTATION_PLAN.md` uses UPPERCASE** (`'ADMIN'`, `'MANAGER'`) throughout its examples.
- `src/auth/permissions.js` (51 lines) generates `resource:action` constants correctly, with both UPPER-keyed and lower-keyed accessors; `OWNERSHIP_FIELDS = ['createdBy','ownerId','userId','assigneeId']`.
- `usePermission.js` hook matches plan exactly.
- **Decision needed** (see 02): standardize on lowercase (matches current code) — update plan doc, not code.
- **Action in phase doc:** document current lowercase convention, add migration shim for any `'ADMIN'`-cased values already in Dataverse, write a one-off script.

### 1.6 Security — 🟡 Partial
- ✅ `src/auth/sessionManager.js` (105 lines) — more sophisticated than plan. Passive listeners, `touchstart` included, 60s warning or 80%-of-timeout (whichever is sooner), exports `restartSessionTimer`, `updateLastActivity`, `initSessionManager`, `lockSession`, `teardownSessionManager`, accepts `options.autoLockMinutes`.
- ✅ `src/vault/crypto.js` has `rotateVaultPassword` already.
- 🟡 `src/auth/webauthn.js` (60 lines) — thin wrappers only: `isWebAuthnSupported`, `isPlatformAuthenticatorAvailable`, `supportsWebAuthnAutofill`, `registerPasskey`, `authenticateWithPasskey`, `serializeCredential`. **Not wired into wizard or login UI.**
- ❌ No `BiometricAuth.jsx` UI component.
- ❌ No CSP meta tag review in `index.html` or final security headers audit.
- **Action in phase doc:** wire WebAuthn into wizard (offline unlock + cloud "remember this device"), build `BiometricAuth.jsx`, audit CSP.

---

## Phase 2 — Collaboration

### 2.1 Workspaces — 🟡 Partial
- ✅ `src/components/admin/WorkspaceManagement.jsx` (288 lines) matches plan. Uses `useCurrentUser` hook, has `WorkspaceCard` + `WorkspaceFormModal`.
- ✅ `src/components/admin/index.js` barrel export exists.
- ❌ No per-workspace data scoping — projects/tasks/etc. are not filtered by `workspaceId` anywhere in the app.
- ❌ No workspace switcher in main nav.
- ❌ No `workspaceId` field populated on new projects/tasks (schema supports it, UI doesn't set it).
- **Action in phase doc:** add `workspaceId` to CRMContext, propagate to all `put` calls in workspace components, add workspace switcher in App.jsx header.

### 2.2 Comments & mentions — ✅ Done
- `src/components/collaboration/CommentThread.jsx` (328 lines) matches plan: comments, replies via `parentId`, reactions, mention extraction, auto-notification on `@mention`.
- `src/components/collaboration/MentionInput.jsx` (111 lines) matches plan: textarea with `@`-autocomplete, Arrow/Enter/Tab/Escape keys.
- ✅ `src/components/collaboration/index.js` barrel exists.
- ❌ **Not integrated** into `ProjectWorkspace.jsx`, `ClientWorkspace.jsx`, `PersonWorkspace.jsx`, or any task view.
- **Action in phase doc:** integrate `<CommentThread resourceType="project" resourceId={...} />` into each workspace; add comment-count badges to cards/list rows.

### 2.3 Notifications — ✅ Done (infrastructure)
- `src/components/collaboration/NotificationCenter.jsx` (169 lines) matches plan: 30s polling, mark-read/mark-all/clear-all, `NotificationItem`, exports `useUnreadNotifications`.
- ✅ `NotificationBell` component already wired in `App.jsx` header using `useUnreadNotifications`.
- 🟡 Only source of notifications today is `CommentThread` mentions; no other emitters (assignments, deadlines, system events).
- **Action in phase doc:** add notification emitters for: task assignment, deadline warnings, workspace invites; document extension points.

### 2.4 Admin dashboard — ❌ Missing
- No `AdminDashboard.jsx`, `UserManagement.jsx`, `AuditLogViewer.jsx`, `Analytics.jsx`.
- Only admin UI today is `WorkspaceManagement.jsx`.
- **Action in phase doc:** build full admin routes + nav gating.

### 2.5 Activity feed — ❌ Missing
- No `ActivityFeed.jsx`.
- `auditLogs` schema exists but **no write sites** in the codebase — nothing is currently being logged.
- **Action in phase doc:** add `logActivity()` helper in `src/utils/` (which doesn't exist yet), instrument CRUD call sites, build `ActivityFeed.jsx` reader.

---

## Phase 3 — Advanced

### 3.1 Time tracking — ❌ Missing
- Schema `timeEntrySchema` exists; no UI, no timer component, no reports. Zero code written.

### 3.2 Gantt — ❌ Missing
- No lib installed. Decision needed (see 02): custom SVG vs. `frappe-gantt` vs. `@wamra/gantt-task-react` vs. commercial.

### 3.3 Dashboard widgets — ❌ Missing
- `DashboardWorkspace.jsx` exists but has only basic metrics cards. No customizable widgets, no time-based widgets.

### 3.4 Reports & export — ❌ Missing
- `jspdf` and `xlsx` (or `sheetjs-ce`) not installed.
- Current export is JSON via `DataManagementModal.jsx` only.

### 3.5 PWA — ❌ Missing (architecture conflict — see 02)
- No `public/` folder. No manifest. No service worker.
- `vite-plugin-singlefile` **inlines all assets into `dist/index.html`** — this fundamentally conflicts with a standard PWA that needs separate `manifest.webmanifest` + `sw.js` files.

### 3.6 Integrations — ❌ Missing
- Scope undefined in plan. Flagged in 02 for user to decide what "integrations" means here.

---

## Phase 4 — AI

### 4.1 WebLLM integration — ❌ Missing
- `@mlc-ai/web-llm` not in `package.json`.
- No `src/ai/` folder.
- **Decision needed** (see 02): model choice. Plan mentions Gemma 4 (doesn't exist as that name; Gemma 2 9B ≈ 5GB quantized; Gemma 2 2B ≈ 1.5GB).

### 4.2 Chat drawer — ❌ Missing
- No `src/components/ai/` folder.

### 4.3 Agents — ❌ Missing

### 4.4 Context injection — ❌ Missing

---

## Dependency audit (`package.json`)

Installed (verified):
- `@azure/msal-browser ^3.30.0`
- `@simplewebauthn/browser ^13.3.0`
- `@tiptap/react ^3.22.3`, `@tiptap/starter-kit ^3.22.3` (partially used)
- `date-fns ^4.1.0`
- `dexie ^4.4.2` — **may be orphaned** now that RxDB/sync mode is gone; verify in phase 1.2
- `react ^18.3.1`, `react-dom ^18.3.1`
- `react-mentions ^4.4.10` — not actually imported by `MentionInput.jsx` (which is a custom implementation); possibly orphaned
- `uuid ^13.0.0`
- `zxcvbn ^4.4.2`

Not installed (Phase 3/4 will need these):
- `@mlc-ai/web-llm`
- `chart.js` / `recharts`
- `jspdf`, `xlsx`
- `react-flow-renderer`
- Gantt library (TBD)
- `vite-plugin-pwa` (conflicts with `vite-plugin-singlefile` — see 02)

**Action in phase 1.2 doc:** remove `dexie` and `react-mentions` if grep confirms zero imports; document as "not installed on purpose" in respective phase docs.

---

## Missing folders / files (plan references but code doesn't have)

```
public/                                       (Phase 3.5 PWA)
src/ai/                                       (Phase 4)
src/components/ai/                            (Phase 4)
src/components/advanced/                      (Phase 3.1-3.4)
src/utils/                                    (activity logger, exporters, formatters — used by multiple phases)
src/components/admin/AuditLogViewer.jsx       (Phase 2.4)
src/components/admin/UserManagement.jsx       (Phase 1.4 / 2.4)
src/components/admin/Analytics.jsx            (Phase 2.4)
src/components/admin/AdminDashboard.jsx       (Phase 2.4)
src/components/collaboration/ActivityFeed.jsx (Phase 2.5)
src/components/auth/BiometricAuth.jsx         (Phase 1.6)
src/db/migrations.js                          (referenced in plan; not needed until a schema change — defer)
```

---

## Plan-vs-code naming mismatches (flagged for decisions doc)

| Concern | Plan says | Code says | Recommendation |
|---|---|---|---|
| Role case | `'ADMIN'`, `'MANAGER'`, `'CONTRIBUTOR'`, `'VIEWER'` | `'admin'`, `'manager'`, `'contributor'`, `'viewer'` | Keep lowercase (code wins). Update plan docs. |
| Dataverse table names | `'aa_users'`, `'aa_projects'`, etc. (prefixed) | `'users'`, `'projects'`, etc. (bare) | Needs user call — Dataverse publisher prefix may be required by tenant. See 02. |
| Storage modes | `offline`, `sync`, `m365` (three) | `offline`, `cloud` (two — sync removed) | Plan is stale. Two-mode model is final. |

---

## Summary counts

- Phase 1: 1/6 fully done, 4/6 partial, 1/6 wrong-case → ~70% complete.
- Phase 2: 2/5 done, 1/5 partial (workspaces), 2/5 missing → ~50% complete.
- Phase 3: 0/6 done → 0%.
- Phase 4: 0/4 done → 0%.

**Overall plan completion: ~30%.** Phase 1 is close to shippable; Phase 2 needs integration work more than new components; Phase 3+ are greenfield.
