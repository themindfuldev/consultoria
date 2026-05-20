import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Language } from '../types';
import { createDriveFolder, createSpreadsheet, setSheetValues, GOOGLE_LOCALE } from './googleApi';
import { EXERCISES } from '../data/exercises';

/**
 * Runs after a trainer creates their account.
 * Creates:
 *   1. Root Google Drive folder (e.g. "Consultoria Training")
 *   2. Feedbacks sub-folder inside it
 *   3. Exercise Library Google Sheet, seeded with 77 exercises
 *
 * Runs fire-and-forget from createProfile — updates the workspace doc
 * in Firestore when done so the dashboard can detect completion.
 *
 * On failure: logs the error and leaves setupComplete = false.
 * The TrainerDashboard offers a "Retry Setup" button in that case.
 */
export async function setupTrainerWorkspace(
  workspaceId: string,
  language: Language,
  token: string,
): Promise<void> {
  try {
    const locale = GOOGLE_LOCALE[language];

    // 1. Root Drive folder
    const rootFolderId = await createDriveFolder(locale.rootFolderName, token);

    // 2. Feedbacks sub-folder
    const feedbackFolderId = await createDriveFolder(
      locale.feedbacksFolderName,
      token,
      rootFolderId,
    );

    // 3. Exercise Library spreadsheet
    const { id: sheetId } = await createSpreadsheet(locale.exerciseLibraryTitle, token);

    // 4. Seed header + 77 exercise rows
    const header: string[] = locale.exerciseLibraryHeaders;
    const rows = EXERCISES.map(ex => [ex.name, '', '', '', ex.videoUrl]);
    await setSheetValues(sheetId, 'A1', [header, ...rows], token);

    // 5. Persist IDs to Firestore workspace doc
    await updateDoc(doc(db, 'workspaces', workspaceId), {
      rootDriveFolderId: rootFolderId,
      feedbackFolderId,
      exerciseLibrarySheetId: sheetId,
      exerciseLibraryCreatedAt: Timestamp.now(),
      setupComplete: true,
    });
  } catch (err) {
    console.error('[workspaceSetup] Setup failed:', err);
    // Leave setupComplete = false; dashboard will offer a retry.
  }
}
