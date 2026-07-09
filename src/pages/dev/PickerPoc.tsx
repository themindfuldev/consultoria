import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

/**
 * DEV-ONLY proof-of-concept for the "trainer uploads into the student's
 * Drive folder" idea (see the auth discussion). It validates the one uncertain
 * step: with only the `drive.file` scope, can we CREATE a child file inside a
 * folder that is *owned by someone else* and shared-as-editor, after the user
 * selects it via the Google Picker?
 *
 * Pass  = the create call returns 200 and the file appears in the shared folder.
 * Fail  = 403/404 → `drive.file` + Picker does NOT cover writing to a
 *         shared-but-not-owned folder, and we fall back to the trainer's own Drive.
 *
 * Prerequisites (you must set these up — I can't run OAuth from here):
 *   1. Enable "Google Picker API" in the same Google Cloud project.
 *   2. Create a browser API key; add it as VITE_GOOGLE_API_KEY in .env.local.
 *   3. From a SECOND Google account ("student"), create a folder and share it
 *      as EDITOR with the account you'll use here ("trainer").
 *   4. Run `pnpm dev`, open /dev/picker-poc signed into the "trainer" account,
 *      click Run, and pick that shared folder under "Shared with me".
 */

// The Picker/gapi globals are loaded at runtime; keep them loosely typed here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (w.google?.picker) return resolve();
    const existing = document.querySelector('script[data-gapi]');
    const onReady = () => w.gapi.load('picker', { callback: () => resolve(), onerror: reject });
    if (existing) { onReady(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.dataset.gapi = 'true';
    s.onload = onReady;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

export function PickerPoc() {
  const { getAccessToken } = useAuth();
  const [log, setLog] = useState<string[]>([]);
  const [directId, setDirectId] = useState('');
  const append = (m: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${m}`]);

  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;

  const run = async () => {
    setLog([]);
    try {
      if (!apiKey) { append('❌ VITE_GOOGLE_API_KEY is not set — add it to .env.local and restart dev.'); return; }
      append('Requesting Google access token…');
      const token = await getAccessToken();
      append('✅ Got token (drive.file scope).');

      append('Loading Picker API…');
      await loadPickerApi();
      append('✅ Picker API ready. Opening picker — choose a SHARED folder.');

      const google = w.google;
      const sharedFolders = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setOwnedByMe(false); // surface "Shared with me" items

      const picker = new google.picker.PickerBuilder()
        .addView(sharedFolders)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.CANCEL) { append('Picker cancelled.'); return; }
          if (data.action !== google.picker.Action.PICKED) return;
          const folder = data.docs?.[0];
          if (!folder) { append('No doc returned.'); return; }
          append(`Picked: "${folder.name}" (id ${folder.id}), owned-by-me=${folder.isOwnedByMe}`);
          setDirectId(folder.id);
          void (async () => {
            await tryCreateChild(token, folder.id, 'picked folder');
            await testDescendant(token, folder.id);
          })();
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      append(`❌ ${String(e)}`);
    }
  };

  /** Returns the created file id, or null on failure. */
  const tryCreateChild = async (token: string, folderId: string, label: string): Promise<string | null> => {
    append(`Attempting files.create inside the ${label}…`);
    const boundary = 'poc_boundary';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: `poc-write-test-${Date.now()}.txt`, parents: [folderId] }) +
      `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
      `drive.file + Picker write test\r\n--${boundary}--`;
    try {
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      );
      const text = await res.text();
      if (res.ok) {
        append(`✅ WRITE SUCCEEDED (${res.status}) in the ${label}.`);
        return (JSON.parse(text) as { id: string }).id;
      }
      append(`❌ WRITE FAILED (${res.status}) in the ${label}. ${text}`);
      return null;
    } catch (e) {
      append(`❌ Network error: ${String(e)}`);
      return null;
    }
  };

  // (c) Does picking the root grant writes to a DESCENDANT subfolder?
  const testDescendant = async (token: string, parentId: string) => {
    append('— Descendant test — creating a subfolder inside the picked folder…');
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `poc-sub-${Date.now()}`, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
      });
      const text = await res.text();
      if (!res.ok) { append(`❌ Subfolder create failed (${res.status}). ${text}`); return; }
      const subId = (JSON.parse(text) as { id: string }).id;
      append(`✅ Subfolder created (${subId}). Now writing a file INSIDE the subfolder…`);
      const fileId = await tryCreateChild(token, subId, 'descendant subfolder');
      append(fileId
        ? '✅ (c) Descendant writes WORK → we can drop feedback into the exact session subfolder.'
        : '❌ (c) Descendant writes FAIL → must write directly into the picked folder.');
    } catch (e) {
      append(`❌ ${String(e)}`);
    }
  };

  // (b) Does the grant survive without re-picking? Reload the page first, then
  // paste the folder id from a previous run and click — a fresh token, no Picker.
  const directWrite = async () => {
    if (!directId.trim()) { append('Paste a folder id first.'); return; }
    append('— Persistence test — fresh token, NO Picker…');
    const token = await getAccessToken();
    const id = await tryCreateChild(token, directId.trim(), 'folder id (no picker)');
    append(id
      ? '✅ (b) Grant PERSISTS → trainer picks once ever; later uploads need no Picker.'
      : '❌ (b) Grant did NOT persist → trainer must re-pick each session.');
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-lg font-bold">Picker + drive.file write POC</h1>
      <p className="mb-4 text-sm text-slate-600">
        Sign in with the “trainer” Google account, click Run, and pick a folder that a
        second account shared with you as editor.
      </p>
      <button
        onClick={run}
        className="mb-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Run test
      </button>

      <div className="mb-4 rounded-xl border border-slate-200 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">
          Persistence test (b): after a Run, <strong>reload this page</strong>, then paste the picked
          folder id here and click — it uses a fresh token and skips the Picker.
        </p>
        <div className="flex gap-2">
          <input
            value={directId}
            onChange={(e) => setDirectId(e.target.value)}
            placeholder="folder id from a previous run"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
          <button onClick={directWrite} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
            Direct write
          </button>
        </div>
      </div>

      <pre className="whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
        {log.length ? log.join('\n') : 'Log output will appear here…'}
      </pre>
    </div>
  );
}
