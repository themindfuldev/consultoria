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

### 2.2 Enable the Google APIs

1. Sidebar → **APIs & Services → Library**
2. Search for and **Enable** each of these:
   - **Google Sheets API** — read training tabs, write the `Respostas` tab
   - **Google Drive API** — video folders, the weekly feedback Google Doc
   - **Google Picker API** — the spreadsheet picker the student uses to select
     their sheet (this is what grants per-file `drive.file` access)

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
5. **Scopes** step → click **"Add or Remove Scopes"** → add just this one:
   - `https://www.googleapis.com/auth/drive.file`
   - → **"Update"** → **"Save and Continue"**
6. **Test users** step → add your own email (and any other testers) → **"Save and Continue"**
7. **Summary** → **"Back to Dashboard"**

> The app deliberately requests **only** the non-sensitive `drive.file` scope. It
> never asks for the broad `spreadsheets` scope: the student unlocks a specific
> spreadsheet by selecting it in the Google Picker, which grants `drive.file`
> access to just that file. Staying off sensitive scopes avoids Google's
> sensitive-scope verification.
>
> While the app is in **"Testing"** status, only test users can sign in. Before
> going live, click **"Publish App"** to move to production.

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

### 2.5 Create the Browser API key (for the Google Picker)

The Google Picker needs a **developer/API key** in addition to the OAuth client
ID. This is `VITE_GOOGLE_API_KEY`.

1. Sidebar → **APIs & Services → Credentials**
2. **"+ Create Credentials"** → **"API key"**
3. Copy the key that appears.
4. Click **"Edit API key"** and restrict it:
   - **Application restrictions** → **Websites** → add your origins
     (`http://localhost:5173`, `https://your-project-id.web.app`, and your custom
     domain if any).
   - **API restrictions** → **Restrict key** → select **Google Picker API**.
   - **Save.**

```
API key → VITE_GOOGLE_API_KEY
```

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

# ── Google OAuth + Picker (Google Cloud Console → APIs & Services → Credentials) ──
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSy...   # Browser API key, restricted to the Google Picker API

# ── New-registration alerts (optional; see "Approving new users") ──
# EmailJS credentials for sending an alert when someone new requests access.
# All three are public-safe. Leave unset to disable emails (the review queue
# still records every request). The destination address is set in the EmailJS
# template, not here.
VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
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
| `VITE_GOOGLE_API_KEY` | Same as `.env.local` (Google Picker browser key) |
| `VITE_EMAILJS_SERVICE_ID` | Same as `.env.local` (optional — new-registration alerts) |
| `VITE_EMAILJS_TEMPLATE_ID` | Same as `.env.local` (optional — new-registration alerts) |
| `VITE_EMAILJS_PUBLIC_KEY` | Same as `.env.local` (optional — new-registration alerts) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase console → Project settings → **Service accounts** tab → **"Generate new private key"** → copy the entire JSON as a single line |

> The `FIREBASE_SERVICE_ACCOUNT_KEY` account also deploys the Firestore
> security rules from CI (see `.github/workflows/deploy.yml`). Grant it the
> **Firebase Rules Admin** role under Google Cloud Console → IAM, or the rules
> deploy step will fail with a `403 permission denied`.

---

## Approving new users (registration allowlist)

The app is publicly reachable, so **new student registrations require manual
approval**. Anyone can sign in with Google, but a first-time user cannot create
a profile — they land on a "Conta aguardando aprovação" screen — until you add
their email to the `allowlist` collection in Firestore.

> Existing students (who already have a `users/{uid}` document) and invited
> trainers are unaffected — this gate only applies to brand-new registrations.

**To approve someone:**

1. Firebase console → **Firestore Database** → **Data** tab.
2. Start (or open) the **`allowlist`** collection.
3. Add a **document whose ID is the person's email, in lowercase**
   (e.g. `maria.silva@gmail.com`). The document body can be empty — only the
   existence of the doc matters. (Optionally add fields like `approvedAt` or
   `note` for your own records; they're ignored by the app.)
4. The pending user clicks **Sair** and signs in again (or reloads) — they're
   now let through to onboarding.

**To revoke a not-yet-onboarded user**, delete their `allowlist` document. Note
that once someone has completed onboarding they hold a `users` document and keep
access regardless of the allowlist; to fully remove them, delete their `users`
document (and related data) or disable the account under **Authentication →
Users**.

The `allowlist` collection is **read-only from the app** (a user may read only
their own entry to learn their status); all changes are made here in the
console.

### The review queue (`access_requests`)

You don't have to hunt through **Authentication → Users** to find who's waiting.
When a new account lands on the pending screen, the app records it in the
**`access_requests`** collection (document ID = the account's uid), holding the
email, display name, photo, and request time. Open that collection in the
Firestore console to see everyone currently waiting.

Entries clear automatically once the person is approved and completes onboarding
(the app deletes their own entry). You can also delete an entry by hand after
approving or rejecting someone — any trainer account may read and clear the
queue.

### Email alerts (optional — EmailJS)

To be emailed the moment someone requests access, wire up
[EmailJS](https://www.emailjs.com), which sends mail directly from the browser —
no backend, no Cloud Functions, no Firebase Extension (Extensions are being
retired on March 31, 2027). When the three `VITE_EMAILJS_*` vars are set, the
app sends one alert per new request; leave them unset to keep the queue with no
email.

One-time setup:

1. Create a free EmailJS account and connect an email service (Gmail, Outlook,
   or SMTP) → gives you a **Service ID**.
2. Create an **email template**. Set its **To** field to the address that should
   receive alerts (this stays in EmailJS, never in the app bundle). Reference
   these variables in the subject/body:
   - `{{requester_name}}` — the new user's name
   - `{{requester_email}}` — their email (the value you'll add to `allowlist`)
   - `{{app_url}}` — the app origin
   This gives you a **Template ID**.
3. Copy your **Public Key** (Account → General).
4. Put the three values in `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`,
   and `VITE_EMAILJS_PUBLIC_KEY` (in `.env.local` and as GitHub secrets).
5. In EmailJS **Account → Security**, add your site's origin
   (`https://consultoria.tiagoromero.me`) to **Allowed Origins** so only your app
   can use the key.

Security notes: all three EmailJS values are public by design; the allowed-origins
list plus EmailJS's per-account rate limits are what prevent abuse, and the
recipient address lives only in the EmailJS template. The alert is sent once per
new account (guarded by the `access_requests` entry), and a send failure is
silently ignored — the queue remains the reliable record of who's waiting.

---

## Verification

Once `.env.local` is populated, start the dev server:

```bash
pnpm install   # if not done yet
pnpm dev
```

Open `http://localhost:5173` — you should see the Landing page. Click **"Entrar com Google"** — it should open a Google popup and request the `drive.file` permission on first sign-in. A brand-new account then lands on the "aguardando aprovação" screen (see below); once approved it proceeds to onboarding.

> **First run:** because new registrations are gated (see *Approving new users*
> above), your very first sign-in lands on the "aguardando aprovação" screen.
> Add your own email to the `allowlist` collection in the Firestore console,
> then reload to bootstrap the first account.

---

## Expected Monthly Cost

For 1 trainer and up to 30 students, every service stays within its free tier:

| Service | Free quota used | Monthly cost |
|---|---|---|
| Cloud Firestore | ~1% of daily ops, ~1% of storage | $0.00 |
| Firebase Auth | Negligible | $0.00 |
| Firebase Hosting | ~14% of transfer | $0.00 |
| Google APIs (Sheets/Drive) | User-quota, not billed | $0.00 |
| GitHub Actions | ~5% of minutes | $0.00 |
| **Total** | | **$0.00/month** |

The Blaze plan credit card is a safety net only — the free quota is sufficient for this scale. Costs would only appear at roughly 100× current usage.
