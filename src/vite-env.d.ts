/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEBMCP_BASE_URL: string;
  readonly VITE_CLAUDE_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
