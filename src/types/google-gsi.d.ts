// Ambient type declarations for Google Identity Services (GIS) Token Client.
// This file has no imports so it is treated as a global script — declarations
// here extend the global scope without any module wrapper.

interface GISTokenClientConfig {
  client_id: string;
  scope: string;
  /**
   * Email address of the account the token is for. Lets Google resolve the
   * session without showing the account chooser when several Google accounts
   * are signed in, which is what makes `prompt: ''` actually silent.
   */
  hint?: string | undefined;
  callback: (response: GISTokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

interface GISTokenClient {
  requestAccessToken: (
    overrideConfig?: { prompt?: string; hint?: string | undefined },
  ) => void;
}

interface GISTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GISAccountsOAuth2 {
  initTokenClient: (config: GISTokenClientConfig) => GISTokenClient;
  revoke: (token: string, done: () => void) => void;
}

interface GISAccounts {
  oauth2: GISAccountsOAuth2;
}

interface GIS {
  accounts: GISAccounts;
}

// Augment the global Window interface so `window.google` is typed everywhere.
interface Window {
  google?: GIS;
}
