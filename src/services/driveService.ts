/**
 * driveService.ts
 *
 * All Google Drive API interactions:
 *   - Create a session folder (student's Drive)
 *   - Upload a compressed video file (multipart, with XHR for progress)
 *   - Create a trainer feedback folder (trainer's Drive)
 *   - Upload trainer audio/video reply
 *   - Set any file/folder to "anyone with link → Viewer"
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function driveJson<T>(
  path: string,
  options: RequestInit,
  token: string,
): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Drive API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Set a file or folder to "anyone with the link → reader". */
async function makePublicViewer(fileId: string, token: string): Promise<void> {
  await driveJson(
    `/files/${fileId}/permissions`,
    {
      method: 'POST',
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
    token,
  );
}

// ── Folder creation ───────────────────────────────────────────────────────────

export interface DriveFolder {
  id: string;
  webViewLink: string;
}

/**
 * Creates a Drive folder, optionally nested inside a parent folder.
 * Sets public viewer permission so the other party can open the link.
 */
export async function createDriveFolder(
  name: string,
  token: string,
  parentFolderId?: string,
): Promise<DriveFolder> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) metadata['parents'] = [parentFolderId];

  const folder = await driveJson<{ id: string; webViewLink: string }>(
    '/files?fields=id,webViewLink',
    { method: 'POST', body: JSON.stringify(metadata) },
    token,
  );

  await makePublicViewer(folder.id, token);
  return folder;
}

// ── File upload (multipart, with progress callback) ───────────────────────────

export interface UploadedFile {
  id: string;
  webViewLink: string;
}

/**
 * Uploads a binary buffer to Drive using the multipart upload endpoint.
 * Reports progress via `onProgress(0–1)`.
 * After upload sets the file to public viewer.
 */
export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  data: ArrayBuffer | Uint8Array,
  parentFolderId: string,
  token: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedFile> {
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    parents: [parentFolderId],
  });

  const boundary = 'drive_upload_boundary_' + Date.now();
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    metadata +
    '\r\n';
  const mediaPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closingBoundary = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const mediaHeaderBytes = new TextEncoder().encode(mediaPart);
  const closingBytes = new TextEncoder().encode(closingBoundary);
  const dataBytes =
    data instanceof Uint8Array ? data : new Uint8Array(data);

  const body = new Uint8Array(
    metaBytes.byteLength +
      mediaHeaderBytes.byteLength +
      dataBytes.byteLength +
      closingBytes.byteLength,
  );
  let offset = 0;
  body.set(metaBytes, offset); offset += metaBytes.byteLength;
  body.set(mediaHeaderBytes, offset); offset += mediaHeaderBytes.byteLength;
  body.set(dataBytes, offset); offset += dataBytes.byteLength;
  body.set(closingBytes, offset);

  const result = await new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadedFile);
      } else {
        reject(new Error(`Drive upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Drive upload network error'));

    xhr.send(body);
  });

  await makePublicViewer(result.id, token);
  return result;
}

// ── Session folder (student) ──────────────────────────────────────────────────

/**
 * Creates (or returns cached) the per-session Drive folder:
 *   "Consultoria — <cycleTitle> — <YYYY-MM-DD>"
 *
 * Returns the folder id + webViewLink.
 */
export async function getOrCreateSessionFolder(
  cycleTitle: string,
  dateStr: string,   // e.g. "2026-05-25"
  token: string,
): Promise<DriveFolder> {
  const folderName = `Consultoria — ${cycleTitle} — ${dateStr}`;
  return createDriveFolder(folderName, token);
}

// ── Trainer feedback folder ───────────────────────────────────────────────────

/**
 * Ensures "Consultoria Feedback/" root folder exists in trainer's Drive,
 * then creates a sub-folder for this specific student + session.
 *
 * Returns the sub-folder id + webViewLink.
 */
export async function getOrCreateTrainerFeedbackFolder(
  studentName: string,
  sessionLabel: string, // e.g. "Terça — 2026-05-25"
  token: string,
  rootFolderId?: string, // cached from workspace doc
): Promise<{ subfolder: DriveFolder; rootFolderId: string }> {
  let root: DriveFolder;

  if (rootFolderId) {
    // Re-use known root folder — just fetch its webViewLink.
    const meta = await driveJson<{ id: string; webViewLink: string }>(
      `/files/${rootFolderId}?fields=id,webViewLink`,
      { method: 'GET' },
      token,
    );
    root = meta;
  } else {
    root = await createDriveFolder('Consultoria Feedback', token);
  }

  const subName = `${studentName} — ${sessionLabel}`;
  const subfolder = await createDriveFolder(subName, token, root.id);
  return { subfolder, rootFolderId: root.id };
}
