/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

/**
 * El service worker de la app.
 *
 * Hasta que llegaron los avisos lo generaba `vite-plugin-pwa` solo. Escribirlo
 * a mano es lo que permite sumar `push` y `notificationclick`, pero tiene que
 * seguir haciendo todo lo de antes: la app entera en caché, las pósters de TMDB
 * guardados para mirar sin conexión y la navegación que cae en `index.html`.
 */

// Con `registerType: 'autoUpdate'`, el service worker nuevo toma el control
// apenas se instala: es lo que hacía el generado, y sin esto una versión nueva
// esperaría a que se cierren todas las pestañas.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cualquier ruta de la app se sirve con `index.html`, igual con o sin red: el
// router de React se encarga del resto. `/api/` y `/cal/` quedan afuera: son
// del servidor, y abrir el link del calendario tiene que bajar el `.ics`, no
// la app.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/cal\//],
  }),
);

// Los pósters de TMDB, en caché mientras se usan: la app queda usable sin
// conexión mostrando las portadas que ya se vieron.
registerRoute(
  ({ url }) => url.origin === 'https://image.tmdb.org',
  new CacheFirst({
    cacheName: 'tmdb-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

/** Lo que manda `api/cron/notify.ts`, como mensaje de datos de FCM. */
interface EpisodePush {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Lee el aviso tal como lo entrega FCM: un JSON con los datos en `data`.
 *
 * Se mandan solo datos, sin `notification`, a propósito: así la
 * notificación la arma este service worker —con su ícono y su enlace— en vez
 * del SDK de Firebase, que habría que cargar entero acá para eso.
 */
function readPush(event: PushEvent): EpisodePush {
  try {
    const payload = event.data?.json() as { data?: EpisodePush } & EpisodePush;
    return payload?.data ?? payload ?? {};
  } catch {
    return { body: event.data?.text() };
  }
}

self.addEventListener('push', (event) => {
  const push = readPush(event);
  event.waitUntil(
    self.registration.showNotification(push.title || 'Qué Miro?', {
      body: push.body || 'Salió un episodio de una serie que seguís.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // Una por serie: si llegan dos avisos de la misma, el segundo reemplaza
      // al primero en vez de apilarse.
      tag: push.tag,
      data: { url: push.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data as { url?: string } | null)?.url || '/',
    self.location.origin,
  );
  // Solo se abren direcciones de la app: el enlace viene de afuera.
  const url = target.origin === self.location.origin ? target.href : self.location.origin;

  event.waitUntil(
    (async () => {
      // Si la app ya está abierta, se usa esa pestaña en vez de abrir otra.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) {
        try {
          const focused = await open.focus();
          await focused.navigate(url);
          return;
        } catch {
          // Una pestaña que este service worker todavía no controla no se
          // deja llevar a otra dirección: se abre una nueva.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
