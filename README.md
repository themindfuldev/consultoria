# Consultoria 🏋️‍♂️

A mobile-first web app that fills two gaps in the personal training workflow:

1. **Enhanced Google Sheets experience** — a beautiful, phone-friendly interface so students can view and log their weekly training session without fighting Google's mobile Sheets app.
2. **Structured video feedback loop** — students upload compressed session videos; trainers deliver per-exercise text feedback; both parties are notified via WhatsApp.

> **Scope**: Consultoria does **not** replace Google Sheets for program creation. The trainer keeps authoring cycles in their existing spreadsheet; Consultoria reads it for display and writes student responses to a dedicated `Respostas` tab.

---

## ✨ Key Features

- **Weekly training flow** — students start a week (which re-reads the spreadsheet and creates a session per tab), then open, skip, or complete each session, and finally conclude the week to lock it read-only. Concluded weeks stay viewable as accordions.
- **Session view** — parses the trainer's spreadsheet tab into an interactive exercise list with planned values shown read-only and input fields for actual reps, load, a color-coded 1–10 RPE picker, and observations.
- **Pre/post workout check-in** — energy level (1–5 stars) and feeling selectors before and after training. Filling the pre-workout form is what starts the session (and notifies the trainer).
- **Spreadsheet write-back** — on session completion, student actuals are appended to a `Respostas` tab (created automatically if absent). The trainer's layout is never modified.
- **WhatsApp notifications** — `wa.me` deep links sent at session start, finish, video upload, and feedback completion. No WhatsApp Business API, no cost.
- **Video upload with compression** — ffmpeg.wasm compresses phone videos client-side (≈ 100 MB → 10–15 MB) before uploading to the student's Google Drive. No server required.
- **Trainer feedback** — per-exercise text feedback; student receives a WhatsApp link when feedback is ready.
- **Historical feedback** — "💬 Feedback anterior" chip on each exercise shows trainer notes from the last 5 sessions.
- **Progress photos** — dated Drive subfolders; chronological thumbnail timeline with side-by-side comparison.
- **Progress charts** — load, RPE, and volume over time per exercise (Recharts).
- **Multiple cycles** — students can train multiple programs simultaneously (different modalities, different trainers).
- **Mobile-first glassmorphism UI** — dark mode, 375 px baseline, Tailwind CSS v4.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript (strict) |
| Styling | Tailwind CSS v4 — class-based dark mode |
| Auth | Firebase Auth — Google Sign-In |
| Database | Cloud Firestore (Blaze plan, free quota) |
| Google APIs | Sheets API + Drive API — read/write via GIS Token Client |
| Video | ffmpeg.wasm (Web Worker, lazy-loaded) |
| Charts | Recharts |
| CI/CD | GitHub Actions → Firebase Hosting |

**Language**: UI, spreadsheets, and all user-facing artifacts are in **PT-BR**. The codebase (variables, types, comments) is in **English**.

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- Firebase CLI (`npm install -g firebase-tools`)

### Setup

```bash
git clone https://github.com/themindfuldev/consultoria.git
cd consultoria
pnpm install
```

Create `.env.local` in the project root (see [`docs/setup_guide.md`](docs/setup_guide.md) for how to get each value):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_CLIENT_ID=...
```

### Run locally

```bash
pnpm dev
```

Open `http://localhost:5173`.

### Build for production

```bash
pnpm build
```

---

## 📦 Deployment

Push to `main` → GitHub Actions builds and deploys to Firebase Hosting automatically.

See [`docs/setup_guide.md`](docs/setup_guide.md) for the one-time Firebase and Google Cloud setup.

---

## 💰 Expected Monthly Cost

For 1 trainer + up to 30 students: **$0.00 – $0.05 / month** (all services stay within free quotas).

---

## 📄 Documentation

| Document | Description |
|---|---|
| [`docs/design_doc.md`](docs/design_doc.md) | Full architecture, data models, API flows, spreadsheet spec, implementation plan |
| [`docs/setup_guide.md`](docs/setup_guide.md) | Step-by-step Firebase + Google Cloud setup, env vars, CI/CD secrets |
