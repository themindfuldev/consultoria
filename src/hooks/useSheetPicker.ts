import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { pickSpreadsheet, type PickedSpreadsheet } from '../services/pickerService';

/**
 * Opens the Google spreadsheet Picker and returns the chosen sheet (or null if
 * the user cancels). Picking a sheet grants this app `drive.file` access to it,
 * which is what lets the Sheets API read/write it without the broad
 * `spreadsheets` scope — see pickerService.
 */
export function useSheetPicker() {
  const { getAccessToken } = useAuth();
  const [picking, setPicking] = useState(false);

  const pick = useCallback(async (): Promise<PickedSpreadsheet | null> => {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
    if (!apiKey) throw new Error('Seletor do Google indisponível (configuração ausente).');

    // The Picker needs the Cloud project number to know which app to grant
    // `drive.file` access to. It's the leading numeric segment of the OAuth
    // client id ("123456789012-abc….apps.googleusercontent.com"), so derive it
    // rather than carrying a second env var that could drift out of sync.
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    const appId = clientId?.match(/^(\d+)-/)?.[1];
    if (!appId) throw new Error('Seletor do Google indisponível (configuração ausente).');

    setPicking(true);
    try {
      const token = await getAccessToken();
      return await pickSpreadsheet(token, apiKey, appId);
    } finally {
      setPicking(false);
    }
  }, [getAccessToken]);

  return { pick, picking };
}
