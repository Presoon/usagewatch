/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" renders the UI from fixtures without any network. */
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
