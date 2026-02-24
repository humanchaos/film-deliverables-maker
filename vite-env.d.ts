/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLOUD_STORAGE_BUCKET: string
    readonly VITE_GOOGLE_CLOUD_ACCESS_TOKEN: string
    readonly VITE_GOOGLE_CLOUD_PROJECT_ID: string
    readonly VITE_GOOGLE_CLIENT_ID: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
