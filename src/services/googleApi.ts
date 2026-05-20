import type { Language } from '../types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

// ── Drive ─────────────────────────────────────────────────────────────────────

export async function createDriveFolder(
  name: string,
  token: string,
  parentId?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];

  const res = await fetch(DRIVE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Drive folder creation failed: ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

export async function listDriveFolderContents(
  folderId: string,
  token: string,
): Promise<DriveFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,thumbnailLink,webViewLink)');
  const res = await fetch(
    `${DRIVE_API}?q=${query}&fields=${fields}&orderBy=name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
  const data = await res.json() as { files: DriveFile[] };
  return data.files ?? [];
}

export async function shareDriveItem(
  fileId: string,
  emailAddress: string,
  token: string,
  role: 'reader' | 'writer' = 'reader',
): Promise<void> {
  const res = await fetch(`${DRIVE_API}/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'user', role, emailAddress }),
  });
  if (!res.ok) throw new Error(`Drive share failed: ${await res.text()}`);
}

// ── Sheets ────────────────────────────────────────────────────────────────────

export async function createSpreadsheet(
  title: string,
  token: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!res.ok) throw new Error(`Spreadsheet creation failed: ${await res.text()}`);
  const data = await res.json() as { spreadsheetId: string; spreadsheetUrl: string };
  return { id: data.spreadsheetId, url: data.spreadsheetUrl };
}

export async function setSheetValues(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  token: string,
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) throw new Error(`Sheet values update failed: ${await res.text()}`);
}

export async function getSheetValues(
  spreadsheetId: string,
  range: string,
  token: string,
): Promise<(string | number)[][]> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheet values read failed: ${await res.text()}`);
  const data = await res.json() as { values?: (string | number)[][] };
  return data.values ?? [];
}

// ── Locale dictionary for Google artifact naming ──────────────────────────────

export const GOOGLE_LOCALE: Record<Language, {
  exerciseLibraryTitle: string;
  exerciseLibraryHeaders: string[];
  rootFolderName: string;
  feedbacksFolderName: string;
}> = {
  en: {
    exerciseLibraryTitle: 'Exercise Library — Consultoria',
    exerciseLibraryHeaders: ['Name', 'Muscle Group', 'Equipment', 'Description', 'Video URL'],
    rootFolderName: 'Consultoria Training',
    feedbacksFolderName: 'Feedbacks',
  },
  'pt-BR': {
    exerciseLibraryTitle: 'Biblioteca de Exercícios — Consultoria',
    exerciseLibraryHeaders: ['Nome', 'Grupo Muscular', 'Equipamento', 'Descrição', 'URL do Vídeo'],
    rootFolderName: 'Treinos Consultoria',
    feedbacksFolderName: 'Feedbacks',
  },
};
