# Firebase + Google Cloud Setup Guide

This guide walks through creating and configuring all external services required to run Consultoria locally and in production.

---

## Prerequisites

You need two things that share the same underlying Google Cloud project:
- **Firebase** — handles Auth, Firestore, and Hosting
- **Google Cloud Console** — enables the Sheets/Drive/Docs APIs and issues the OAuth client ID

---

## Part 1 — Firebase Project

### 1.1 Create the project

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **"Add project"**
3. Give it a name (e.g. `consultoria`)
4. **Disable** Google Analytics (not needed) → click **"Create project"**

> Firebase automatically creates a matching Google Cloud project with the same name.

---

### 1.2 Upgrade to Blaze plan

Firestore requires the Blaze (pay-as-you-go) plan. Expected bill for this project: **$0.00–$0.05/month**.

1. In the Firebase console sidebar, click the **Spark** badge at the bottom left → **"Upgrade"**
2. Select **Blaze** → add a billing account (requires a credit card, but free quota covers everything here)

---

### 1.3 Enable Firestore

1. Sidebar → **Build → Firestore Database** → **"Create database"**
2. Choose **"Start in production mode"** (you'll deploy security rules later in Phase 6)
3. Choose a region close to your users — e.g. **`us-east1`** or **`southamerica-east1`** (São Paulo)
4. Click **"Enable"**

---

### 1.4 Enable Google Sign-In

1. Sidebar → **Build → Authentication** → **"Get started"**
2. **Sign-in method** tab → click **Google** → toggle **Enable** → set a **Project support email** (your own) → **"Save"**

---

### 1.5 Register the web app and get config values

1. Sidebar → **Project Overview** (home icon) → click the **`</>`** (Web) icon
2. Register app name: `consultoria-web`
3. Check **"Also set up Firebase Hosting for this app"**
4. Click **"Register app"**
5. You'll see a config snippet like this — **copy it**, you need these values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",                           // → VITE_FIREBASE_API_KEY
  authDomain: "consultoria-abc.firebaseapp.com", // → VITE_FIREBASE_AUTH_DOMAIN
  projectId: "consultoria-abc",                  // → VITE_FIREBASE_PROJECT_ID
  storageBucket: "consultoria-abc.appspot.com",  // → VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "123456789",                // → VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:123456789:web:abc123"                // → VITE_FIREBASE_APP_ID
};
```

6. Keep clicking **Next / Continue to console** — you don't need to run the `firebase init` commands shown there (we'll do that manually)

> **To find this config again later**: Project Overview → gear icon ⚙️ → **Project settings** → scroll down to **"Your apps"** → click the web app → **"SDK setup and configuration"** → select **"Config"**

---

## Part 2 — Google Cloud Console

The Firebase project *is* a Google Cloud project. You now need to enable the APIs your app calls, and create an OAuth 2.0 client ID for the GIS Token Client.

### 2.1 Open the Cloud Console for your project

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. In the top-left project selector, make sure your Firebase project is selected (same name you gave it)

---

### 2.2 Enable the three Google APIs

1. Sidebar → **APIs & Services → Library**
2. Search for and **Enable** each of these:
   - **Google Sheets API**
   - **Google Drive API**
   - **Google Docs API**

For each: click the result → **"Enable"**

---

### 2.3 Configure the OAuth Consent Screen

This is what users see when they authorize the app. Only needs to be done once.

1. Sidebar → **APIs & Services → OAuth consent screen**
2. User type: **External** → **"Create"**
3. Fill in:
   - **App name**: `Consultoria`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **"Save and Continue"**
5. **Scopes** step → click **"Add or Remove Scopes"** → add these three:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/documents`
   - → **"Update"** → **"Save and Continue"**
6. **Test users** step → add your own email (and any other testers) → **"Save and Continue"**
7. **Summary** → **"Back to Dashboard"**

> While the app is in **"Testing"** status, only test users can sign in. Before going live, click **"Publish App"** to move to production. Google may ask you to verify the app if you're requesting sensitive scopes — for a personal project this is usually straightforward.

---

### 2.4 Create the OAuth 2.0 Client ID

This is `VITE_GOOGLE_CLIENT_ID` — used by the GIS Token Client in the browser to silently refresh the access token without a popup.

1. Sidebar → **APIs & Services → Credentials**
2. **"+ Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: `Consultoria Web`
5. **Authorized JavaScript origins** — add both:
   - `http://localhost:5173` ← Vite dev server
   - `https://your-project-id.web.app` ← Firebase Hosting (replace with your actual project ID)
   - `https://your-project-id.firebaseapp.com` ← Firebase Hosting alt domain
6. **Authorized redirect URIs** — add:
   - `https://your-project-id.firebaseapp.com/__/auth/handler` ← Firebase Auth redirect
7. **"Create"**
8. Copy the **Client ID** that appears (looks like `123456789-abc....apps.googleusercontent.com`)

```
Client ID → VITE_GOOGLE_CLIENT_ID
```

> **To find this again later**: Credentials page → click the pencil ✏️ on your OAuth client → Client ID is at the top.

---

## Part 3 — Populate `.env.local`

Create the file at the project root (it's already in `.gitignore` — never commit it):

```bash
# /path/to/consultoria/.env.local

# ── Firebase (from Firebase console → Project settings → Your apps → Config) ──
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=consultoria-abc.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=consultoria-abc
VITE_FIREBASE_STORAGE_BUCKET=consultoria-abc.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# ── Google OAuth (from Google Cloud Console → APIs & Services → Credentials) ──
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

---

## Part 4 — Firebase Hosting init (one-time CLI setup)

This wires up `firebase deploy` and the GitHub Actions workflow.

```bash
# Install Firebase CLI if you don't have it
npm install -g firebase-tools

# Login
firebase login

# In your project root:
firebase init hosting
```

When prompted:
- **"Use an existing project"** → select your Firebase project
- **Public directory**: `dist`
- **Single-page app**: **Yes**
- **Automatic builds with GitHub Actions**: **No** (handled by our own workflow)
- **Overwrite `dist/index.html`**: **No**

This creates `firebase.json` and `.firebaserc` — commit both.

---

## Part 5 — GitHub Secrets (for CI/CD)

Add these in **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Where to get it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Same as `.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same as `.env.local` |
| `VITE_FIREBASE_PROJECT_ID` | Same as `.env.local` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same as `.env.local` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same as `.env.local` |
| `VITE_FIREBASE_APP_ID` | Same as `.env.local` |
| `VITE_GOOGLE_CLIENT_ID` | Same as `.env.local` |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase console → Project settings → **Service accounts** tab → **"Generate new private key"** → copy the entire JSON as a single line |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create *(Phase 5 — morning emails)* |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Cloud Console → IAM & Admin → Service Accounts → create one with Sheets + Drive read permissions → download JSON *(Phase 5 — email cron)* |

---

## Verification

Once `.env.local` is populated, start the dev server:

```bash
pnpm install   # if not done yet
pnpm dev
```

Open `http://localhost:5173` — you should see the Landing page. Click **"Sign in with Google"** — it should open a Google popup, request Sheets/Drive/Docs permissions on first sign-in, then route you to role selection.

---

## Expected Monthly Cost

For 1 trainer and up to 30 students, every service stays within its free tier:

| Service | Free quota used | Monthly cost |
|---|---|---|
| Cloud Firestore | ~1% of daily ops, ~1% of storage | $0.00 |
| Firebase Auth | Negligible | $0.00 |
| Firebase Hosting | ~14% of transfer | $0.00 |
| Google APIs (Sheets/Drive/Docs) | User-quota, not billed | $0.00 |
| GitHub Actions | ~5% of minutes | $0.00 |
| Resend | ~20% of email quota | $0.00 |
| **Total** | | **$0.00/month** |

The Blaze plan credit card is a safety net only — the free quota is sufficient for this scale. Costs would only appear at roughly 100× current usage.
