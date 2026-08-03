/**
 * pickerService.ts
 *
 * Thin wrapper around the Google Picker API used to let a student SELECT the
 * training spreadsheet — their own, or one a trainer shared with them. The act
 * of picking a file grants this app `drive.file` access to that specific
 * spreadsheet, which is what lets us use the Sheets API on it WITHOUT the broad
 * `spreadsheets` scope. The grant persists per (user, file), so a student picks
 * a sheet once and later sessions read/write it by id with no re-pick.
 */

/* The Picker/gapi globals are injected at runtime; keep them loosely typed. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;

export interface PickedSpreadsheet {
  id: string;
  name: string;
  url: string;
}

let pickerReady: Promise<void> | null = null;

/** Loads apis.google.com/js/api.js and the `picker` module exactly once. */
function loadPickerApi(): Promise<void> {
  if (w.google?.picker) return Promise.resolve();
  if (pickerReady) return pickerReady;

  pickerReady = new Promise<void>((resolve, reject) => {
    const loadModule = () =>
      w.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Falha ao carregar o Google Picker.')),
      });

    if (w.gapi) return loadModule();

    // The GIS/gapi loader may already be on the page (e.g. added by a prior
    // call). Reuse it rather than injecting a duplicate <script>.
    const existing = document.querySelector<HTMLScriptElement>('script[data-gapi]');
    if (existing) {
      existing.addEventListener('load', loadModule);
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar a API do Google.')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.dataset.gapi = 'true';
    s.onload = loadModule;
    s.onerror = () => reject(new Error('Falha ao carregar a API do Google.'));
    document.body.appendChild(s);
  });
  return pickerReady;
}

/**
 * Opens the Google Picker filtered to Google Sheets (including sheets shared
 * with the user). Resolves with the picked spreadsheet, or null if the user
 * cancels. `token` must be a Google OAuth access token carrying `drive.file`,
 * and `appId` the Cloud project number that token's client belongs to — see the
 * `setAppId` note below for why it is not optional.
 */
export async function pickSpreadsheet(
  token: string,
  apiKey: string,
  appId: string,
): Promise<PickedSpreadsheet | null> {
  await loadPickerApi();
  const google = w.google;

  return new Promise<PickedSpreadsheet | null>((resolve, reject) => {
    try {
      // Not calling setOwnedByMe surfaces both "My Drive" and "Shared with me"
      // spreadsheets — a student's sheet is usually shared to them by a trainer.
      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setLabel('Meu Drive')
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST);

      // Dedicated "Shared with me" tab. The default view opens on My Drive /
      // Recent, where a sheet a trainer shared but that the student never added
      // to their own Drive can be hard to find — setOwnedByMe(false) lists
      // exactly those, giving the student an explicit place to look. Both views
      // default to the "Spreadsheets" label, so set explicit ones to tell the
      // two tabs apart.
      const sharedView = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setLabel('Compartilhados comigo')
        .setOwnedByMe(false)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.LIST);

      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .addView(sharedView)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        // REQUIRED for the grant to actually happen. Under `drive.file` the
        // Picker only hands the app access to the picked file when it knows
        // which app to grant it to, and the OAuth token alone doesn't say —
        // `appId` (the Cloud project number) is what identifies us. Without it
        // the Picker still returns the file id, so the pick *looks* successful
        // and the sheet id is saved, but no grant is ever issued and every
        // later Sheets call answers 404 NOT_FOUND. Re-picking doesn't help,
        // because the re-pick is just as silently grant-less.
        .setAppId(appId)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            resolve(
              doc
                ? {
                    id: doc.id,
                    name: doc.name ?? '',
                    url: doc.url ?? `https://docs.google.com/spreadsheets/d/${doc.id}/edit`,
                  }
                : null,
            );
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      reject(e);
    }
  });
}
