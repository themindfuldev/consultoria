# Plano: Integração de Vídeo e Feedback via Google Drive

This document specifies the full design for the async video feedback loop between student and trainer — Phase 3 of the Consultoria implementation plan.

---

## Overview

```
Student records workout video on phone
        ↓
App compresses it client-side (ffmpeg.wasm, ~100MB → 12MB)
        ↓
App uploads to student's Google Drive (per-session folder)
        ↓
Student taps "Notificar treinador" → wa.me WhatsApp deep link
        ↓
Trainer opens the session in the app → watches videos
        ↓
Trainer writes text feedback per exercise + uploads audio/video replies
        ↓
Trainer taps "Feedback completo" → wa.me deep link to student
        ↓
Student opens the app and reads/watches feedback
```

No WhatsApp Business API, no server-side code, near-zero cost.

---

## Part A — Student: Session Creation & Video Upload

### A1. Session creation (simplified — no sheet parsing yet)

Since we are not reading the spreadsheet content yet, a "session" is a lightweight manual record the student creates before uploading videos.

**UI flow:**

1. Student opens a cycle on `/student` (the cycle card)
2. Taps **"Nova sessão de vídeos"**
3. A bottom sheet appears with two fields:
   - **Data** — date picker, defaults to today
   - **Dia de treino** — free-form text (e.g., "Terça", "Treino A", "Peito e Tríceps")
4. Taps **"Iniciar"** → creates a `sessions` Firestore doc, navigates to `/student/cycles/{cycleId}/sessions/{sessionId}`

**Firestore write:**

```ts
// sessions/{sessionId}
{
  id: autoId,
  cycleId,
  studentUid,
  workspaceId,
  tabName: "Terça",       // student-entered training day label
  status: "in_progress",
  date: Timestamp(today),
  startedAt: serverTimestamp(),
  hasVideos: false,
  // preWorkout / postWorkout / driveFolderId filled later
}
```

---

### A2. Session detail page `/student/cycles/:cycleId/sessions/:sessionId`

This is the central hub for a session. It shows:

- Session header (date, training day, cycle title)
- **Video list** — thumbnails of uploaded videos, each labelled with the exercise name
- **"Adicionar vídeo"** button
- **"Notificar treinador"** button (appears after at least 1 video is uploaded)
- **"Ver feedback"** section (appears after trainer marks feedback complete)

---

### A3. Video upload flow

**Trigger:** student taps "Adicionar vídeo" → native `<input type="file" accept="video/*" capture="environment">` opens.

On mobile this opens the camera roll or the camera directly.

#### Step 1 — File selected

The `File` object is in JS memory. The app shows a preview sheet:

```
┌─────────────────────────────────────┐
│ 🎬 agachamento_take2.mp4            │
│ Tamanho original: 187 MB            │
│                                     │
│ Exercício (opcional):               │
│ [Agachamento Livre         ▼]       │
│                                     │
│    [ Cancelar ]  [ Comprimir e enviar ]  │
└─────────────────────────────────────┘
```

The exercise dropdown is populated from a free-form list the student maintains (seeded from video tags they've used before on this cycle). There is also an "Outro — descreva" option for general footage.

#### Step 2 — Client-side compression (ffmpeg.wasm)

```
Comprimindo vídeo…  ████████░░  76%
180 MB → estimativa: ~14 MB
```

**Implementation:**

```ts
// src/workers/compress.worker.ts  (lazy-loaded)
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

self.onmessage = async ({ data: { file } }: MessageEvent<{ file: File }>) => {
  await ffmpeg.load({
    coreURL: await toBlobURL(
      'https://unpkg.com/@ffmpeg/core/dist/umd/ffmpeg-core.js',
      'text/javascript',
    ),
    wasmURL: await toBlobURL(
      'https://unpkg.com/@ffmpeg/core/dist/umd/ffmpeg-core.wasm',
      'application/wasm',
    ),
  });

  ffmpeg.on('progress', ({ progress }) => {
    self.postMessage({ type: 'progress', progress });
  });

  await ffmpeg.writeFile('input', await fetchFile(file));
  await ffmpeg.exec([
    '-i', 'input',
    '-vf', 'scale=-2:720',          // scale to 720p, preserve AR
    '-c:v', 'libx264',
    '-crf', '28',                   // quality (lower = better, 28 is good balance)
    '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',      // MP4 metadata at start → streams before full download
    'output.mp4',
  ]);

  const data = await ffmpeg.readFile('output.mp4');
  self.postMessage({ type: 'done', buffer: (data as Uint8Array).buffer }, [(data as Uint8Array).buffer]);
};
```

The worker is instantiated lazily in a React hook (`useVideoCompress`) only when the student initiates an upload. The ffmpeg WASM binary (~10 MB) is fetched from unpkg CDN on first use and cached by the browser thereafter.

**Firebase Hosting headers** (required for multi-threaded WASM via SharedArrayBuffer):

```json
// firebase.json
{
  "hosting": {
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
          { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
        ]
      }
    ]
  }
}
```

#### Step 3 — Google Drive folder creation (first video in session)

The app creates a folder in the **student's own Drive** using their OAuth token and `drive.file` scope:

```
Folder name: "Consultoria — [CycleTitle] — [Date]"
e.g.         "Consultoria — Força Bloco 1 — 2026-05-25"
```

The folder is set to **"Anyone with the link → Viewer"** so the trainer can access it via the stored URL without any explicit sharing (which would require the broader `drive` scope).

```ts
// POST https://www.googleapis.com/drive/v3/files
{
  "name": "Consultoria — Força Bloco 1 — 2026-05-25",
  "mimeType": "application/vnd.google-apps.folder"
}

// Then: PATCH /files/{folderId}/permissions
{ "role": "reader", "type": "anyone" }
```

The folder `id` and `webViewLink` are saved to `sessions.driveFolderId` and `sessions.driveFolderUrl`.

#### Step 4 — Upload compressed video

```ts
// Multipart upload to Drive
// POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart

// Body: multipart/related with:
//   Part 1 (JSON): { name, parents: [folderId], mimeType: "video/mp4" }
//   Part 2 (binary): the compressed Uint8Array
```

After upload, the file is set to "Anyone with the link → Viewer" (same as folder). A `videos` Firestore doc is created:

```ts
// videos/{videoId}
{
  id: videoId,
  sessionId,
  cycleId,
  studentUid,
  workspaceId,
  exerciseName: "Agachamento Livre",   // or null for general
  freeFormDescription: null,
  driveFileId: "1xABCD...",
  driveFileUrl: "https://drive.google.com/file/d/1xABCD.../view",
  driveThumbnailUrl: "https://lh3.googleusercontent.com/...",
  originalSizeMB: 187,
  compressedSizeMB: 14,
  uploadedAt: serverTimestamp(),
}
```

Also updates the parent session: `sessions.hasVideos = true`.

#### Step 5 — WhatsApp notification

After uploading (one or more videos), the student sees:

```
📹 1 vídeo enviado — Agachamento Livre

[ + Adicionar mais vídeos ]
[ 📱 Notificar treinador ]
```

"Notificar treinador" builds a `wa.me` link:

```ts
const msg = encodeURIComponent(
  `📹 Enviei ${videoCount} vídeo(s) do treino *${tabName}* de ${date}.\n` +
  `Aguardo seu feedback: ${appUrl}/trainer/sessions/${sessionId}`
);
const url = `https://wa.me/${trainer.whatsappPhone}?text=${msg}`;
window.open(url, '_blank');
```

The student taps **Send** once in WhatsApp. The trainer receives the link and taps it to open the app.

---

## Part B — Trainer: Review & Feedback

### B1. "Aguardando feedback" section on trainer dashboard

On `/trainer`, a new prominent section appears above the student list:

```
📹 Aguardando feedback (3)
┌──────────────────────────────────────┐
│ Ana — Terça — 25/05  [Ver →]         │
│ Pedro — Treino A — 23/05  [Ver →]    │
│ ...                                  │
└──────────────────────────────────────┘
```

**Query:**

```ts
// sessions where workspaceId == trainerWorkspaceId
//   AND status == 'completed' (or 'in_progress' with videos)
//   AND hasVideos == true
// Then client-side filter: no feedback doc OR feedback.status == 'draft'
```

In practice: query `sessions` where `workspaceId == id AND hasVideos == true`, order by date descending, then check the `feedback` collection for each — or use a `feedbackStatus` denormalized field on `sessions` to avoid N+1.

**Recommended:** add `feedbackStatus: 'none' | 'draft' | 'complete'` to the `sessions` doc (default `'none'`, updated when trainer saves/completes feedback). This makes the trainer queue a single Firestore query.

### B2. Feedback view `/trainer/sessions/:sessionId`

**Layout (mobile-first, single-column):**

```
┌───────────────────────────────────────┐
│  ← Voltar                             │
│  Ana Souza · Força Bloco 1            │
│  Terça · 25 de maio de 2026          │
├───────────────────────────────────────┤
│  🎬 AGACHAMENTO LIVRE                 │
│  ┌─────────────────────────────────┐  │
│  │  [▶ Vídeo 1 — 0:58]            │  │
│  │  [▶ Vídeo 2 — 1:12]            │  │
│  └─────────────────────────────────┘  │
│  Feedback de texto:                   │
│  ┌─────────────────────────────────┐  │
│  │ Profundidade boa, mas joelhos   │  │
│  │ saindo na 3ª série…             │  │
│  └─────────────────────────────────┘  │
│  [ 🎤 Adicionar áudio/vídeo ]         │
├───────────────────────────────────────┤
│  🎬 LEVANTAMENTO TERRA               │
│  [▶ Vídeo 1 — 2:03]                  │
│  [texto de feedback…]                 │
│  [ 🎤 Adicionar áudio/vídeo ]         │
├───────────────────────────────────────┤
│  📝 Observações gerais                │
│  ┌─────────────────────────────────┐  │
│  │ Sessão muito boa, PR no terra…  │  │
│  └─────────────────────────────────┘  │
├───────────────────────────────────────┤
│  [ Salvar rascunho ]  [✅ Concluir ]  │
└───────────────────────────────────────┘
```

**Video player:** uses `<video src={driveFileUrl} controls />`. Drive's shareable URLs serve the video directly — no transcoding needed. The trainer just streams it.

**Per-exercise feedback:** text area + media upload button per exercise section.

### B3. Trainer media upload (audio/video reply)

When trainer taps "Adicionar áudio/vídeo":
- Native file picker opens (accepts `audio/*,video/*`)
- File is uploaded to **trainer's own Drive**:
  ```
  Folder: "Consultoria Feedback/Ana — Terça — 2026-05-25/"
  ```
- File is set to "Anyone with link → Viewer"
- Stored in `feedback.exerciseFeedback[n].mediaFiles`

The trainer's Drive folder `Consultoria Feedback/` is created on the trainer's first feedback submission (one-time, per trainer).

### B4. Save draft / Complete feedback

**"Salvar rascunho":**

```ts
// setDoc or updateDoc on feedback/{sessionId}
{
  id: sessionId,
  sessionId, cycleId, studentUid, workspaceId, trainerUid,
  status: 'draft',
  exerciseFeedback: [
    { exerciseName: "Agachamento Livre", textFeedback: "...", mediaFiles: [] },
    ...
  ],
  generalNotes: "...",
  createdAt: serverTimestamp(),
}
// Also update sessions/{sessionId}.feedbackStatus = 'draft'
```

**"Concluir feedback":**

```ts
// update feedback.status = 'complete', feedback.completedAt = now()
// update sessions.feedbackStatus = 'complete'

// Then open WhatsApp deep link:
const msg = `📝 Seu feedback do treino *${tabName}* de ${date} está pronto!\n${appUrl}/student/sessions/${sessionId}/feedback`;
window.open(`https://wa.me/${student.whatsappPhone}?text=${encodeURIComponent(msg)}`, '_blank');
```

---

## Part C — Student: View Feedback

Route: `/student/sessions/:sessionId/feedback`

Read-only mirror of the trainer's feedback view:

- Each exercise section shows trainer text + embedded audio/video player
- Audio rendered as `<audio controls>`, video as `<video controls>`
- General notes section at the bottom
- No editing

Accessible from:
1. The WhatsApp deep link (direct URL)
2. The session detail page on the student's cycle view

---

## Firestore Changes Required

| Collection | Change |
|---|---|
| `sessions` | Add `feedbackStatus: 'none' \| 'draft' \| 'complete'` (denormalized from feedback doc) |
| `feedback` | No change — already in `types.ts` |
| `videos` | No change — already in `types.ts` |

---

## New Routes

| Route | Component | Who |
|---|---|---|
| `/student/cycles/:cycleId` | `CycleDetail` | Student |
| `/student/cycles/:cycleId/sessions/:sessionId` | `SessionDetail` | Student |
| `/student/sessions/:sessionId/feedback` | `FeedbackView` (read-only) | Student |
| `/trainer/sessions/:sessionId` | `TrainerFeedbackView` | Trainer |

---

## New npm Packages

| Package | Purpose |
|---|---|
| `@ffmpeg/ffmpeg` | JS wrapper for ffmpeg.wasm |
| `@ffmpeg/util` | File helpers (`fetchFile`, `toBlobURL`) |
| `@ffmpeg/core` | WASM binary (fetched from CDN at runtime, not bundled) |

Install: `pnpm add @ffmpeg/ffmpeg @ffmpeg/util`
(`@ffmpeg/core` is fetched from CDN at runtime — no install needed.)

---

## GIS Scope First-Use Prompt

When a student or trainer first triggers an upload, `getAccessToken()` is called. If it's their first time granting `drive.file`, the GIS token client will show a consent screen (even with `prompt: ''`). The app should handle this gracefully:

```ts
try {
  const token = await getAccessToken();
  // proceed with upload
} catch (err) {
  // GIS rejected or user cancelled consent
  showError('Autorize o acesso ao Google Drive para enviar vídeos.');
}
```

For subsequent calls the token refreshes silently.

---

## Implementation Order (Phase 3)

### Phase 3a — Session creation + video upload (student)
1. `CycleDetail` page — shows sessions list + "Nova sessão" button
2. Session creation bottom sheet / page
3. `SessionDetail` page — video list + upload button
4. `useVideoCompress` hook — lazy-loads ffmpeg Web Worker
5. Drive folder creation + video upload service
6. `videos` Firestore writes + `sessions.hasVideos` update
7. "Notificar treinador" `wa.me` button

### Phase 3b — Trainer feedback view
1. "Aguardando feedback" section on `TrainerDashboard`
2. `TrainerFeedbackView` page — videos grouped by exercise + text fields
3. Trainer media upload → trainer's Drive feedback folder
4. Save draft + complete feedback + `wa.me` notification to student

### Phase 3c — Student feedback view
1. `FeedbackView` (read-only) — mirrors trainer view
2. Deep link from WhatsApp → direct route to feedback
3. "Ver feedback" entry point from session detail

---

## Open Questions

| # | Question | Suggested answer |
|---|---|---|
| 1 | Should videos be grouped by exercise automatically, or does the student always tag them manually? | Manual tagging is simpler and avoids exercise-name parsing; the dropdown can be pre-filled from previous uploads on this cycle |
| 2 | Should the trainer be notified immediately on upload, or only when the student taps "Notificar treinador"? | Student-controlled — they may want to upload multiple videos before notifying |
| 3 | Should there be a size limit per video? | Warn (not block) if compressed file is > 50 MB; Drive has 15 GB free quota |
| 4 | What happens if Drive quota is exceeded? | Show clear error: "Espaço no Google Drive esgotado. Libere espaço e tente novamente." |
| 5 | Should the student be able to delete an uploaded video? | Yes — `videos` Firestore doc deleted + Drive file set to `trashed: true` via API |
