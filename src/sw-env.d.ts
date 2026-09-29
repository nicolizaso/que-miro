// Lo que inyecta vite-plugin-pwa al compilar el service worker: la lista de
// archivos a precachear, con su revisión.
declare interface ServiceWorkerGlobalScope {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
}
