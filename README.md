<div align="center">
  <img src="docs/screenshots/og-image.png" alt="Qué Miro?" width="640" />
  <p><em>Tu biblioteca personal de películas y series.</em></p>
</div>

# Qué Miro?

Webapp para llevar el registro de lo que querés ver, lo que estás viendo y lo que
ya terminaste — con reseñas propias y un selector aleatorio para las noches en
las que no sabés qué mirar.

Funciona como PWA instalable, sincroniza entre dispositivos si iniciás sesión, y
se puede usar sin cuenta: en modo invitado todo queda guardado en el navegador.

---

## Features

- **Tres listas** — *Por Ver*, *Viendo* y *Completadas*, con transiciones animadas.
- **Búsqueda en TMDB** — películas y series, con atajo `⌘K` / `Ctrl+K`.
- **Ficha del título** — sinopsis, reparto, tráiler y en qué plataformas está disponible.
- **Reseñas propias** — puntaje de 0,5 a 5 estrellas (con medias estrellas) y comentario opcional.
- **Smart Picker** — elige al azar algo de tu lista *Por Ver*, con filtro por género.
- **Estadísticas** — cantidad de títulos vistos, promedio de puntaje e historial de reseñas.
- **Modo invitado** — usala sin cuenta; si después iniciás sesión, tu biblioteca se migra sola.
- **PWA** — instalable en el celular, con los pósters cacheados para uso offline.

<div align="center">
  <img src="docs/screenshots/login.png" alt="Pantalla de inicio de sesión" width="440" />
  <img src="docs/screenshots/picker.png" alt="Smart Picker" width="200" />
</div>

---

## Stack

| Capa | Herramientas |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS 4, Motion, lucide-react |
| Estado | Zustand (con persistencia en `localStorage`) |
| Datos | [TMDB API](https://www.themoviedb.org/documentation/api) vía funciones serverless |
| Auth y sync | Firebase Auth + Cloud Firestore |
| Build | Vite 6, vite-plugin-pwa (Workbox) |
| Tests | Vitest + Testing Library |
| Deploy | Vercel |

---

## Cómo correrlo

**Requisitos:** Node.js 20 o superior.

```bash
git clone https://github.com/nicolizaso/que-miro.git
cd que-miro
npm install
cp .env.example .env.local   # completá las claves (ver abajo)
npm run dev                  # http://localhost:3000
```

### Variables de entorno

Solo **TMDB** es obligatoria. Sin Firebase la app arranca igual, directamente en
modo invitado.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `TMDB_API_KEY` | Sí | Buscar títulos y traer sus fichas. Se pide [acá](https://www.themoviedb.org/settings/api). |
| `VITE_FIREBASE_*` | No | Login y sincronización entre dispositivos. |

> **Sobre las claves:** `TMDB_API_KEY` no lleva prefijo `VITE_` a propósito — la
> usa únicamente el servidor, así nunca termina en el bundle que se descarga el
> navegador. Las `VITE_FIREBASE_*` sí son públicas por diseño: en Firebase la
> seguridad real la dan las reglas de Firestore ([`firestore.rules`](firestore.rules))
> y la lista de dominios autorizados en la consola.

### Configurar Firebase (opcional)

1. Creá un proyecto en la [consola de Firebase](https://console.firebase.google.com/).
2. En **Authentication**, habilitá los proveedores *Email/Password* y *Google*.
3. En **Firestore**, creá la base y publicá las reglas de [`firestore.rules`](firestore.rules).
4. En **Authentication → Settings → Authorized domains**, agregá tu dominio de
   producción (si no, el login con Google falla con `auth/unauthorized-domain`).
5. Copiá las credenciales del proyecto a tu `.env.local`.

El modelo de datos está documentado en [`firebase-blueprint.json`](firebase-blueprint.json).

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Server de desarrollo con HMR y las rutas `/api` (puerto 3000). |
| `npm run build` | Build de producción en `dist/`. |
| `npm run preview` | Sirve el build ya generado. |
| `npm test` | Corre la suite de tests. |
| `npm run test:watch` | Tests en modo watch. |
| `npm run lint` | Chequeo de tipos con TypeScript. |

---

## Arquitectura

```
api/                  Funciones serverless (Vercel)
  _lib/tmdb.ts        Cliente de TMDB — el único lugar con la API key
  tmdb/search.ts      GET /api/tmdb/search?query=
  tmdb/detail.ts      GET /api/tmdb/detail?type=&id=
src/
  components/         MediaCard, SearchModal, TitleDetailModal, ReviewDrawer, SyncManager
  contexts/           AuthContext (sesión), ToastContext (avisos)
  hooks/              useMediaActions — punto único de escritura de la biblioteca
  lib/                Cliente HTTP del front, init de Firebase, mensajes de error
  views/              ListView, SmartPickerView, ProfileView, LoginView
  store.ts            Estado global (Zustand)
server.ts             Server de desarrollo: Vite + las mismas rutas /api
```

Dos decisiones que explican la forma del código:

**La API key de TMDB nunca llega al cliente.** El front pega contra
`/api/tmdb/*` y son las funciones de `api/` las que hablan con TMDB. El server de
desarrollo (`server.ts`) monta esas mismas rutas reusando el módulo compartido de
`api/_lib/tmdb.ts`, así local y producción se comportan igual.

**Los datos tienen dueño explícito.** El store guarda un `ownerUid` junto a la
biblioteca. Al iniciar sesión, si los datos locales eran de invitado se migran a
la cuenta; si eran de *otra* cuenta, se descartan antes de sincronizar. Sin eso,
la biblioteca de quien usó el dispositivo antes se le filtraría al siguiente.

---

## Deploy

El proyecto está configurado para Vercel ([`vercel.json`](vercel.json)):

1. Importá el repo en Vercel — detecta Vite y las funciones de `api/` solo.
2. Cargá las variables de entorno en **Settings → Environment Variables**.
3. Agregá el dominio de Vercel a los dominios autorizados de Firebase.

Para que la vista previa en redes sociales funcione, cambiá `og:image` y
`twitter:image` en [`index.html`](index.html) por la URL absoluta de tu deploy
(`https://tu-dominio.vercel.app/og-image.png`): varios scrapers no resuelven
rutas relativas.

---

## Créditos

Los datos de películas y series vienen de [TMDB](https://www.themoviedb.org/).
Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.
