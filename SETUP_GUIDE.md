# Active Assistant — GitHub Pages Setup & Dev Guide

## What You Now Have

Your app is split into this structure:

```
active-assistant/
├── .github/workflows/deploy.yml   ← Auto-deploys on every git push
├── src/
│   ├── config.js                  ← M365 credentials & constants (edit this)
│   ├── App.jsx                    ← Main shell, nav, routing
│   ├── context.jsx                ← React contexts
│   ├── utils.js                   ← Shared helper functions
│   ├── index.css                  ← All styles
│   ├── db/
│   │   ├── offline.js             ← IndexedDB provider
│   │   ├── m365.js                ← Dataverse provider
│   │   └── index.js               ← Active DB switcher
│   └── components/
│       ├── Icons.jsx              ← All icons (add new ones here)
│       ├── DynamicCard.jsx        ← Draggable/resizable card
│       ├── DashboardWorkspace.jsx ← Dashboard with metrics
│       ├── ProjectWorkspace.jsx   ← Project drawer + canvas
│       ├── ClientWorkspace.jsx    ← Client drawer
│       ├── PersonWorkspace.jsx    ← Team member drawer
│       ├── SpatialCanvas.jsx      ← Spatial drag canvas view
│       ├── KanbanView.jsx         ← Kanban board
│       ├── GridViews.jsx          ← Card grid views
│       ├── ListViews.jsx          ← Table list views
│       ├── DataManagementModal.jsx← Import/Export modal
│       └── ConfirmDialog.jsx      ← Confirm dialog
├── index.html
├── package.json
├── vite.config.js                 ← REPO_NAME must match your GitHub repo name
└── tailwind.config.js
```

---

## PART 1 — One-Time GitHub Setup (Do This First, At Home)

### Step 1: Install Node.js (home only, needed once)
1. Go to https://nodejs.org
2. Download and install the **LTS version** (e.g. 20.x)
3. Verify: open a terminal and run `node --version`

### Step 2: Create a GitHub Account (if you don't have one)
- Go to https://github.com and sign up (free)

### Step 3: Create the Repository
1. Go to https://github.com/new
2. Name it exactly: `active-assistant` (or whatever you prefer)
3. Set it to **Public** (required for free GitHub Pages)
4. Do NOT initialize with README — leave it empty
5. Click **Create repository**

### Step 4: Enable GitHub Pages
1. In your new repo, go to **Settings** → **Pages** (left sidebar)
2. Under **Source**, select **GitHub Actions**
3. Click Save

### Step 5: Update vite.config.js with your repo name
Open `vite.config.js` and change this line to match your exact repo name:
```js
const REPO_NAME = 'active-assistant'  // ← change if your repo is named differently
```

### Step 6: Push your code to GitHub
Open a terminal in the `active-assistant` folder and run:

```bash
npm install
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/active-assistant.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 7: Wait for the build
1. Go to your repo on GitHub
2. Click the **Actions** tab
3. You'll see a workflow running — wait ~2 minutes for it to finish
4. When it shows a green checkmark, your app is live

### Step 8: Get your URL
Your app will be at:
```
https://YOUR_USERNAME.github.io/active-assistant/
```

Bookmark this — this is the URL you use at work.

---

## PART 2 — Register Your App with Azure (For M365 Mode)

Skip this if you only need Offline/IndexedDB mode.

1. Go to https://portal.azure.com
2. Search for **App registrations** → **New registration**
3. Name: `Active Assistant`
4. Supported account types: **Single tenant**
5. Redirect URI: **Single-page application (SPA)** → enter your GitHub Pages URL:
   `https://YOUR_USERNAME.github.io/active-assistant/`
6. Click **Register**
7. Copy the **Application (client) ID** and **Directory (tenant) ID**
8. Go to **API permissions** → **Add a permission** → **Dynamics CRM** → **user_impersonation** → Grant admin consent

Then update `src/config.js`:
```js
clientId: 'paste-your-client-id-here',
tenantId: 'paste-your-tenant-id-here',
dataverseUrl: 'https://YOUR_ORG.crm.dynamics.com',
```

Commit and push — the app auto-deploys.

---

## PART 3 — Daily Development Workflow

### At Home (making changes)

```bash
# 1. Navigate to your project folder
cd active-assistant

# 2. Start local dev server (hot reload — changes appear instantly in browser)
npm run dev

# 3. Open http://localhost:5173 in your browser

# 4. Edit any file in src/ — browser updates automatically

# 5. When done, push to GitHub
git add .
git commit -m "describe what you changed"
git push
```

GitHub Actions auto-builds and deploys. In ~2 minutes the live URL is updated.

### At Work (using the app)

Just open your GitHub Pages URL in the browser:
```
https://YOUR_USERNAME.github.io/active-assistant/
```

- **Offline mode**: data saves to the browser's IndexedDB on that work computer
- **M365 mode**: data syncs to Dataverse — same data everywhere

---

## PART 4 — How to Edit Specific Things

| What you want to change | File to edit |
|---|---|
| M365 credentials | `src/config.js` |
| App name / branding | `src/App.jsx` (top nav) |
| Dashboard layout defaults | `src/components/DashboardWorkspace.jsx` (DEFAULT_LAYOUTS) |
| Project workspace UI | `src/components/ProjectWorkspace.jsx` |
| Client workspace UI | `src/components/ClientWorkspace.jsx` |
| Team member workspace | `src/components/PersonWorkspace.jsx` |
| Add a new icon | `src/components/Icons.jsx` |
| Kanban columns | `src/components/KanbanView.jsx` (columns array) |
| Global CSS styles | `src/index.css` |
| Shared helper functions | `src/utils.js` |
| IndexedDB schema | `src/db/offline.js` |
| Dataverse column mapping | `src/config.js` (columnMaps) |

---

## PART 5 — Keeping Work and Home in Sync (Data)

Your **code** is always in sync via GitHub. Your **data** depends on which mode you use:

### Option A: Offline mode at work, offline mode at home
- Data is **separate** on each machine
- Use the **Data → Export JSON** button to back up / transfer data manually

### Option B: M365/Dataverse mode everywhere (recommended)
- Data lives in Dataverse, accessible from any browser
- You must complete Part 2 (Azure registration) first
- Works at work because your work browser already has M365 session

### Option C: Mix (offline at work, M365 at home)
- Works — but data doesn't sync between the two stores
- Use Export/Import to bridge if needed

---

## PART 6 — Troubleshooting

**Build fails in GitHub Actions**
- Check the Actions tab for error details
- Most common cause: syntax error in a .jsx file
- Run `npm run build` locally first to catch errors before pushing

**App shows blank page at work**
- Make sure `REPO_NAME` in `vite.config.js` matches your exact GitHub repo name (case-sensitive)
- Check browser console (F12) for errors

**M365 sign-in popup is blocked**
- Work browsers may block popups — allow popups for `github.io` in browser settings

**CORS error with Dataverse**
- Ensure your GitHub Pages URL is in the Azure App Registration redirect URIs
- Ensure `user_impersonation` permission has admin consent

**IndexedDB data missing at work**
- IndexedDB is per-browser — if IT clears browser data, local data is gone
- Export regularly as a backup, or use M365 mode

---

## PART 7 — Adding New Features (The Right Way)

1. Create a new file in `src/components/` for new UI sections
2. Import it in `App.jsx` or the relevant parent component
3. Add shared logic to `src/utils.js`
4. Add new config values to `src/config.js`
5. Test locally with `npm run dev`
6. Push when ready — auto-deploys in ~2 minutes

```bash
# Typical feature development cycle
npm run dev          # start dev server
# ... edit files ...
git add .
git commit -m "Add feature X"
git push             # triggers auto-deploy
```
