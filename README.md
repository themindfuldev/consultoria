# Consultoria 🏋️‍♂️💪

A premium, mobile-first, and highly responsive web application inspired by **Hevy**, designed specifically for personal trainers and their students. It replaces frustrating, raw Google Sheets interactions with a gorgeous interactive workout UI, while seamlessly preserving Google Sheets as the single source of truth.

---

## ✨ Features

### 🌎 Bilingual Support & UI
- Fully localizable UI supporting **English** and **Portuguese (Brasil)**.
- Preferred language persists on the user's account and updates dynamically across the entire app.
- Dynamic localized Google Workspace naming conventions: Google Drive folders, Spreadsheet columns, sheet tabs, and Document titles automatically match the user's language setting.

### 🛡️ Workspace and Multi-Tenancy
- **Google Sign-In**: Secure and easy authentication for both trainers and students.
- **Trainer Workspace**: Created automatically when a trainer registers.
- **Student Invites**: Trainers can invite students to join their workspaces.
- **Workspace Association**: Students can belong to multiple workspaces. If a student is removed from a workspace, their access becomes **read-only**, ensuring they keep their historical workouts.
- **Account Control**: Students and trainers can delete their accounts at any time.

### 📊 Major Use Case: Localized Spreadsheet Engine
- **Non-Destructive Student Mode**: Instead of editing cells in the Google Sheets app on a tiny mobile screen, students view a beautiful workout console.
- **Interactive Workout Grid**: Easy tracking of Sets, Reps, Load, and RPE, with checkboxes to mark items completed.
- **Sentiment Tracking**: Short pre- and post-workout sentiment questionnaires (Energy level 1–5, feeling before/after) seamlessly integrated into the start/finish flow.
- **Exercise Library**: Validation of exercises directly from the trainer's custom spreadsheet library, featuring video links and descriptions.
- **Auto-Notifications**: Sends a notification to the trainer when a student starts or finishes a training session.
- **Brand Customization**: Dynamic logo integration. Upload your custom logo and have it beautifully embedded inside generated Google Sheets.

### 📝 Major Use Case: Rich Feedback System
- Automated Google Drive folder creation for feedback uploads.
- Single-button trainer review tool that automatically creates a secure Google Doc, writes comments/media links, and synchronizes the document on both trainer and student views.

### 📈 Use Case: Progress Tracking & Photos
- **Evolution Reports**: Visual analysis of sets, reps, load, and RPE mapped on interactive Recharts graphs.
- **Shared Drive Photos**: Shared Google Drive media folders organized by date, allowing students to easily upload progress photos.
- **Morning Emails**: Automated workout emails sent to students every morning of their training days.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React + Vite (TypeScript)
- **Styling**: Tailwind CSS v4 (Full responsive mobile & tablet layouts + native Dark Mode)
- **Backend & DB**: Firebase Auth & Cloud Firestore
- **Deployment**: Firebase Hosting & Firebase Cloud Functions
- **Secrets Management**: Google Cloud Secret Manager & GitHub Secrets
- **Emails**: Resend API (safely managed under the Spark/free tier)

---

## 🚀 Development Instructions

### 📋 Prerequisites
Make sure you have the following tools installed locally:
- [Node.js](https://nodejs.org/) (v20 or higher)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- A Firebase Project set up with Authentication and Firestore enabled.

### 📦 Setup & Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/themindfuldev/consultoria.git
   ```
2. Install the project dependencies:
   ```bash
   npm install
   ```
3. Set up your local environment variables. Create a `.env.local` file in the root directory:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### 🏃 Running Locally
Start the development server:
```bash
npm run dev
```
The application will be accessible at `http://localhost:5173`.

### 🏗️ Building for Production
To build the application and compile TypeScript:
```bash
npm run build
```

---

## 📦 Deployment

This project uses **GitHub Actions** for automated building and deployment to **Firebase Hosting**.

### Secrets Configuration (GitHub)
Ensure your GitHub repository has the following secrets configured:
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Service account credentials JSON.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc. (used during build process).

On every push to the `main` branch, the workflow will automatically execute `npm run build` and deploy the production static assets to Firebase.

---

## 📄 Documentation

For full details on the technical design, database schemas, and Google API structures, check the **[Design Document & Plan](docs/design_doc.md)**.
