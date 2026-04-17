# Architecture Decisions — Required Before Phase 2+

Each section below is a **decision the user must make** before the relevant phase docs can be written accurately. Recommendations are given, but the user owns the call. Once decided, the answer gets copied into the top of the affected phase doc and this file becomes read-only history.

---

## D1. Real-time collaboration strategy

**Context.** Active Assistant is a single-HTML client-only app with no backend server. The only shared state lives in M365 Dataverse (cloud mode) or locally (offline mode). Notifications today use 30-second polling.

**Options.**
| Option | Freshness | Infra needed | Cost | Offline-compatible |
|---|---|---|---|---|
| **A. Polling only (status quo)** | 30s lag | None | $0 | Yes |
| B. Dataverse change webhooks + Azure Function relay | ~5s | Azure Function + SignalR/Pusher | $10-50/mo | No |
| C. Third-party realtime (Ably, Pusher, Supabase Realtime) | <1s | Third-party acct | $0-25/mo tier | No |
| D. SharePoint Lists + WebSocket bridge | ~5s | Bridge service | medium | No |

**Recommendation: A (polling).** It preserves the "single HTML file, no backend" design, works in offline mode, and 30s lag is acceptable for a PM tool. Allow user to override polling interval in preferences (10s / 30s / 60s / off). If the user ever wants true realtime, we can add B as an opt-in later without breaking A.

**Tradeoff accepted.** Two people editing the same task in the same minute can overwrite each other. We mitigate with last-write-wins + a `version` field + a visible "changed by X 12s ago" indicator after save.

**Decision:** ______________________________________________

---

## D2. Role key case — uppercase vs lowercase

**Context.** Plan uses `'ADMIN'`; code uses `'admin'`. They cannot both be right.

**Options.**
- **A. Standardize on lowercase** (matches `src/auth/rbac.js`, `src/App.jsx`). Zero code changes. Update plan docs.
- B. Standardize on uppercase. Requires touching `rbac.js`, `permissions.js`, `App.jsx` first-user logic, and any stored values in Dataverse.

**Recommendation: A.** The working code is lowercase, and Dataverse OptionSet values are typically lowercase/snake_case by convention.

**Decision:** ______________________________________________

---

## D3. Dataverse table naming — prefix or bare?

**Context.** The plan specifies `aa_users`, `aa_projects`, etc. Current `src/config.js` uses bare names (`'users'`, `'projects'`). Dataverse typically **requires** a publisher prefix on custom tables (e.g., `cr123_users`). If the tenant already has `aa_*` tables configured, bare names will 404.

**Questions for user:**
1. Are the Dataverse tables already created in the target tenant? If yes, **what are their exact logical names?**
2. Is there a publisher prefix enforced (e.g., `aa_`, `tkc_`, `new_`)?

**Options.**
- A. Keep bare names and create standard tables in Dataverse (may not be permitted depending on tenant policy).
- B. Adopt prefix (e.g., `aa_`) and update `src/config.js` `DATAVERSE_SCHEMA.tables` + `DATAVERSE_COLUMN_MAPS`.
- C. Make the prefix configurable via `getM365Config()` so the wizard can capture it during cloud setup.

**Recommendation: C.** It's the most portable; different tenants will have different publisher prefixes. Phase 1.2 or 1.3 doc will add a `dataversePrefix` field to the M365 setup wizard.

**Decision (prefix value, or "configurable"):** ______________________________________________

---

## D4. Legacy files — delete now or defer?

**Context.** These files exist but are unreferenced by the two-mode architecture:

- `src/db/offline.js` (78 lines, old IndexedDB layer, DB_VERSION 8)
- `src/vault/gist.js` (82 lines, GitHub Gist storage, never wired in the new flow)
- Possibly orphaned deps: `dexie`, `react-mentions` (verify via grep before removing)

**Options.**
- **A. Delete in phase 1.2** along with the storage simplification work. Clean repo before Phase 2.
- B. Keep as "reference" for 30 days then delete.
- C. Move to `src/_archive/` out of build path.

**Recommendation: A.** Git history preserves it. Dead code attracts bugs.

**Decision:** ______________________________________________

---

## D5. PWA approach — or skip it entirely?

**Context.** `vite-plugin-singlefile` inlines all assets into one `dist/index.html`. A standard PWA needs a separate `manifest.webmanifest` and `sw.js` served from known URLs. These two goals are in direct architectural conflict.

**Options.**
- A. **Keep single-file build, skip PWA.** User downloads HTML, double-clicks, runs offline. No install prompt, no home-screen icon.
- B. **Dual build targets.** `npm run build` → `dist/index.html` (current). `npm run build:pwa` → multi-file output with manifest + SW. Two distribution channels.
- C. **Manifest-only PWA.** Ship a separate `manifest.webmanifest` alongside `index.html`; users who want install get both files. No SW (the HTML is already fully self-contained offline).
- D. Drop single-file build, switch to standard Vite output + `vite-plugin-pwa`.

**Recommendation: C.** Gets the install prompt and home-screen icon for free, keeps the single-HTML story intact, no service worker needed because the app is already 100% offline-capable by design. Phase 3.5 becomes a one-hour task instead of a week.

**Decision:** ______________________________________________

---

## D6. WebLLM model selection (Phase 4.1)

**Context.** Plan mentions "Gemma 4" — this does not exist by that name. Available in-browser via `@mlc-ai/web-llm`:

| Model | Size (4-bit quant) | First-load time (broadband) | RAM needed | Quality |
|---|---|---|---|---|
| Llama 3.2 1B | ~0.7 GB | 30-60s | 2 GB | Basic Q&A |
| Gemma 2 2B | ~1.5 GB | 1-2 min | 3 GB | Decent summaries |
| Phi-3.5-mini 3.8B | ~2.2 GB | 2-3 min | 4 GB | **Best quality/size** |
| Llama 3.2 3B | ~1.8 GB | 2 min | 4 GB | Good |
| Gemma 2 9B | ~5.1 GB | 5-10 min | 8 GB | Near GPT-3.5 |
| Qwen 2.5 7B | ~4.4 GB | 4-8 min | 7 GB | Very good |

**Recommendation: Phi-3.5-mini as default, Llama 3.2 1B as low-end fallback, Gemma 2 9B as opt-in "power" model.** Let the user pick during first AI-feature use. Cache to OPFS so re-load is instant.

**Tradeoffs.**
- Even 2 GB is a huge first-load. Must have clear progress UI and "not now" button.
- Mobile devices likely cannot run anything above Llama 1B. Detect and gate.
- Our single-HTML build does not bundle the model — WebLLM fetches from CDN. If the user is truly offline on first AI use, AI is unavailable until they go online once.

**Decision (default / offered models):** ______________________________________________

---

## D7. Gantt chart — build vs. library

**Context.** Phase 3.2 needs a Gantt view for projects/tasks.

**Options.**
| Option | Bundle size | License | Fit |
|---|---|---|---|
| A. `frappe-gantt` (vanilla JS) | ~30 KB | MIT | Good, lightweight, needs React wrapper |
| B. `@wamra/gantt-task-react` | ~100 KB | MIT | React-native, actively maintained |
| C. Custom SVG | 0 | — | Full control, 2-3 days dev |
| D. Commercial (Bryntum, DHTMLX) | 500KB+ | $$$ | Overkill |

**Recommendation: B.** React-first, active, fits the stack. Phase 3.2 doc will pin the exact version.

**Decision:** ______________________________________________

---

## D8. Integration scope (Phase 3.6)

**Context.** "Integrations" is undefined in the existing plan. Candidates:

- Outlook email ingest (parse .eml drops into communications)
- M365 calendar sync (task deadlines → calendar events)
- Teams notifications (webhook post on @mention)
- SharePoint file attach (pick files in workspace)
- Power Automate trigger (publish events for external flows)
- CSV/Excel import (already partially done via DataManagementModal)

**Recommendation.** Pick **two** for MVP: (1) M365 calendar sync for task deadlines, (2) SharePoint file attach for comments/workspaces. Defer the rest or gate behind "beta" flag.

**Decision (which two, or different list):** ______________________________________________

---

## D9. Automated testing — in scope or tech debt?

**Context.** CLAUDE.md says "No automated tests are configured. Manual testing via `npm run dev`." The new plan does not introduce tests either.

**Options.**
- A. Accept as tech debt, document in README. Continue manual testing.
- B. Add Vitest + React Testing Library in a separate Phase 0.5 before Phase 2 ships.
- C. Add Playwright E2E tests only, for critical flows (login, create project, sync).

**Recommendation: A for now; C when Phase 2 ships.** We need a working collaboration feature before E2E testing it pays off. Unit tests on the vault crypto + RBAC logic are worth writing opportunistically.

**Decision:** ______________________________________________

---

## Summary — decisions needed before Phase 2 work starts

**Must decide before phase 1.2 / 1.5 docs are written:**
- D2 (role case) — *recommend lowercase*
- D3 (Dataverse prefix) — *need tenant info*
- D4 (legacy cleanup) — *recommend delete now*

**Must decide before phase 3.5 doc:**
- D5 (PWA approach) — *recommend C: manifest-only*

**Must decide before phase 4 docs:**
- D6 (WebLLM models) — *recommend Phi-3.5 default*

**Can defer:**
- D1 (realtime) — *recommend polling, can upgrade later*
- D7 (Gantt lib) — *needs a 30-min prototype spike before finalizing*
- D8 (integration scope) — *defer until Phase 2 ships*
- D9 (testing) — *defer to tech debt backlog*
