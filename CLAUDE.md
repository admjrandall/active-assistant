# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Active Assistant** is a secure, privacy-first project management application that runs entirely client-side as a single HTML file. It supports three storage modes:

1. **Offline Mode** (`offline`) - In-memory VaultDB with AES-256-GCM encryption, manual save to `.dat` file
2. **Sync Mode** (`sync`) - RxDB with IndexedDB persistence, encrypted database, and M365 Dataverse replication
3. **M365 Mode** (`m365`) - Direct Microsoft 365 Dataverse integration via MSAL authentication

Built with React, RxDB, Vite, and TailwindCSS. Outputs a single self-contained `index.html` file.

## Commands

### Development
```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server at http://localhost:5173
npm run build        # Build production single-file HTML to dist/index.html
npm run preview      # Preview production build locally
```

### Deployment
- Every push to `main` triggers GitHub Actions workflow (`.github/workflows/deploy.yml`)
- Builds and uploads `dist/index.html` as an artifact
- No GitHub Pages deployment - users download the HTML file directly

### Testing
No automated tests are configured. Manual testing via `npm run dev`.

## Architecture

### Storage Architecture (Three-Mode System)

The app uses a **unified DB interface** that routes to different implementations:

```
src/db/index.js         ← Central router, exports DB based on mode
  ├── offline → VaultDB (src/vault/VaultDB.js)
  ├── sync    → RxDBWrapper (src/sync/RxDBWrapper.js)
  └── m365    → DataverseDB (src/db/m365.js)
```

**All storage implementations provide identical interface:**
- `getAll(store)` - Retrieve all records from a collection
- `put(store, record)` - Insert or update a record
- `delete(store, id)` - Delete a record by ID
- `generateId()` - Generate unique ID with mode-specific prefix (`v-`, `rx-`, `id-`)

### Data Model

Six main collections (consistent across all storage modes):
- `projects` - Core project entities with workspace layouts
- `tasks` - Task items linked to projects
- `people` - Team members
- `clients` - Client contacts
- `departments` - Organizational units
- `communications` - Client communication logs

**Important:** Dataverse column mapping is defined in `src/config.js` (`DATAVERSE_SCHEMA.columnMaps`). JSON fields are stringified before sending to Dataverse and parsed on retrieval.

### Storage Mode Details

#### Offline Mode (VaultDB)
- **File:** `src/vault/VaultDB.js`
- **Encryption:** `src/vault/crypto.js` - AES-256-GCM with PBKDF2 (310,000 iterations)
- Data lives **only in JavaScript memory** (`_state` object), never touches disk/IndexedDB
- User must explicitly save to `.dat` file (Ctrl+S or Environment Hub menu)
- `saveStatus` state tracks unsaved changes: `'saved'` | `'unsaved'` | `'saving'` | `'error'`
- Native File System API used for silent overwrite when supported

#### Sync Mode (RxDB)
- **Setup:** `src/sync/RxDBSetup.js` - Creates RxDB with Dexie storage + encryption
- **Wrapper:** `src/sync/RxDBWrapper.js` - Adapts RxDB API to match DB interface
- **Replication:** `src/sync/M365Replication.js` - Bidirectional sync with M365 Dataverse
- Encrypted IndexedDB via RxDB's `wrappedKeyEncryptionCryptoJsStorage`
- Field-level encryption on sensitive fields (see schemas in RxDBSetup.js)
- Conflict resolution: Last-Write-Wins with `lastModified` timestamp
- Rate limiting: 10 requests/second to avoid throttling
- Device ID generated and stored in localStorage for multi-device sync

#### M365 Mode (DataverseDB)
- **File:** `src/db/m365.js`
- Direct MSAL authentication + Dataverse Web API
- Column mapping: Local field names → Dataverse schema (see `src/config.js`)
- JSON fields stringified/parsed automatically (e.g., `notes`, `workspaceLayout`, `subtasks`)

### Application Structure

**Entry Point:** `src/App.jsx` - Main application shell
- Manages auth state, active DB instance, and workspace navigation
- Handles Environment Hub (lock/switch environments, save vault, sync)
- Three storage mode states managed via `StorageModeContext`

**Authentication:** `src/components/AuthGate.jsx`
- Mode selection screen (Offline, Sync, M365)
- Password entry for offline/sync modes
- MSAL popup/redirect for M365 mode
- Calls `handleAppUnlocked()` in App.jsx when authenticated

**Workspaces (Drawer Components):**
- `ProjectWorkspace.jsx` - Full-screen project detail editor with draggable cards
- `ClientWorkspace.jsx` - Client contact manager
- `PersonWorkspace.jsx` - Team member editor

**Views:**
- `DashboardWorkspace.jsx` - Metrics overview with customizable card layout
- `SpatialCanvas.jsx` - Drag-and-drop 2D canvas for projects/clients/people
- `KanbanView.jsx` - Kanban board (projects only)
- `GridViews.jsx` - Card grid views for all entity types
- `ListViews.jsx` - Table list views for all entity types

**Shared Components:**
- `DynamicCard.jsx` - Draggable/resizable card component used in workspaces
- `Icons.jsx` - All SVG icons (add new icons here)
- `DataManagementModal.jsx` - Import/Export JSON functionality
- `ConfirmDialog.jsx` - Confirmation dialogs

### State Management

Uses React Context API:
- `CRMContext` (src/context.jsx) - Provides all data arrays + `DB` instance + `loadAllData()`
- `StorageModeContext` - Provides `storageMode`, `m365AuthStatus`, `m365UserName`

### Configuration

**src/config.js:**
- `STORAGE_MODE_KEY`, `M365_SETUP_KEY` - localStorage keys
- `getM365Config()` - Retrieves M365 setup from localStorage (dynamic config)
- `DATAVERSE_SCHEMA` - Table names and column mappings for M365 mode
- `MAX_TITLE_LENGTH`, `MAX_TEXT_LENGTH` - Field validation limits

**vite.config.js:**
- `viteSingleFile()` plugin inlines all JS/CSS into single HTML
- `base: './'` for relative paths (works from file://)
- Security headers configured for dev server

### Key Workflows

#### Switching Environments
1. User clicks Environment Hub → "Switch Environments"
2. App calls `handleLockSession()` in App.jsx
3. Saves vault if unsaved (offline mode)
4. Cancels RxDB replication if sync mode
5. Closes RxDB if sync mode
6. Clears VaultDB memory
7. **Removes `'aa-storage-mode'` from localStorage** (forces mode selection on reload)
8. Calls `window.location.reload()` to reset to AuthGate

#### Saving Vault (Offline Mode)
- Automatic unsaved detection: Any `put()` or `delete()` triggers `setSaveStatus('unsaved')`
- Manual save: Ctrl+S or Environment Hub → "Save to Disk"
- Uses Native File System API if available (silent overwrite with file handle)
- Falls back to download if not supported or user requests "Export Backup"

#### RxDB Sync (Sync Mode)
- Pull: Fetches all records from M365, batch size 50
- Push: Sends pending changes to M365, batch size 20
- Conflict resolution: Compares `lastModified` timestamps, uses device ID as tiebreaker
- Status updates bubble to UI via `onStatusChange` callback

## Development Notes

### Adding New Fields to Data Model

1. **Update schemas in `src/sync/RxDBSetup.js`** if using sync mode (mark sensitive fields as `encrypted`)
2. **Update Dataverse column mapping in `src/config.js`** if field syncs to M365
3. **Update UI components** (workspace/view components) to display/edit the field
4. **JSON fields** must be added to `DATAVERSE_SCHEMA.jsonFields` array

### Adding New Icons

Add to `src/components/Icons.jsx` as a new exported component. Follow the existing pattern.

### Modifying Workspace Layouts

Default layouts defined in each workspace component (e.g., `DEFAULT_LAYOUTS` in `DashboardWorkspace.jsx`). These are only used for new items - existing items have layouts persisted in database.

### Security Considerations

- Vault mode uses **PBKDF2 with 310,000 iterations** (OWASP 2023 standard)
- RxDB encryption uses **CryptoJS wrapper** for field-level encryption
- **NEVER** store passwords, encryption keys, or session tokens in localStorage
- M365 tokens managed by MSAL library, stored in sessionStorage by default
- CSP headers configured in vite.config.js for dev server

### Build Output

`npm run build` produces a **single self-contained HTML file** in `dist/index.html`:
- All JavaScript inlined
- All CSS inlined (Tailwind utility classes)
- No external dependencies or network requests (except M365/Dataverse APIs)
- Can be run from `file://` protocol, USB drive, or any web server

### Known Limitations

- No automated tests
- No TypeScript (plain JavaScript/JSX)
- M365 mode requires Azure App Registration setup
- Sync mode replication is one-way per session (doesn't handle concurrent edits well)
- Mobile UX is functional but not fully optimized
