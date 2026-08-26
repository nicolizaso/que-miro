# Roadmap

Plan de trabajo para llevar *Qué Miro?* de prototipo a MVP publicable.

Son 20 features repartidas en 4 tandas de 5. El criterio de agrupación no es
temático sino de **superficie de código**: cada tanda toca los mismos archivos y
deja construida una base que la siguiente reusa. El orden importa — hay tres
piezas (router, tokens de tema, migrador de schema) que si aparecen tarde
obligan a reescribir lo anterior.

Tres reglas sostienen el orden:

1. El tema va **antes** que las vistas nuevas, así nacen compatibles con ambos modos.
2. El schema completo va **antes** que las features que lo leen.
3. Los tests E2E van **después** de que la UI deje de moverse.

Cada tanda cierra con `npm run lint` y `npm test` en verde, y con la app en un
estado demostrable. No quedan tandas a medio camino.

---

## Tanda 1 — Cimientos y primera impresión

*Todo lo que atraviesa la app entera. Barato ahora, carísimo después.*

| Feature | Estado |
|---|---|
| Modo demo con datos precargados | ✅ |
| Tema claro/oscuro + pasada de accesibilidad | ✅ |
| Selector de región para plataformas | ✅ |
| Filtros, orden y búsqueda en tus listas | ✅ |
| Exportar / importar biblioteca + borrar cuenta | ✅ |

**Base compartida que se construye acá**

- **Router real.** Antes las tabs eran un `useState` en `App.tsx`. Lo necesitan
  los filtros en la URL y el perfil público de la tanda 4.
- **Store de preferencias** persistido — lo estrenan región y tema.
- **Tokens de diseño** claro/oscuro en `index.css`, para que las vistas nuevas
  de las tandas 2-4 no tengan que retocarse después.
- **Schema versionado + migrador**, que usan el importador y el seed del demo, y
  que la tanda 2 va a explotar a fondo.
- **Primitivas accesibles** (`Dialog` con focus trap) que reemplazan los modales
  sueltos y sirven para todo lo que viene.

**Resultado:** la app tiene tema, se navega por URL, se puede entrar en modo demo
y ver una biblioteca real con filtros. Ya es mostrable.

---

## Tanda 2 — Modelo de datos rico

*Las cinco features que cambian `SavedMedia` y el camino de escritura.*

| Feature |
|---|
| Progreso por temporada y episodio |
| Historial y revisiones múltiples |
| Reseñas con tags/ánimo |
| Filtro por plataforma (guardar providers al agregar) |
| Listas y colecciones propias |

**Por qué van juntas:** las cinco tocan `src/types.ts`, `useMediaActions.ts`,
`SyncManager.tsx` y `firestore.rules`. Separarlas es pagar cuatro veces el mismo
peaje: migrar documentos existentes, re-testear la sincronización y revisar las
reglas de seguridad.

**Detalle que importa para después:** al enriquecer el título en el momento de
guardarlo, capturar también **duración y cantidad total de episodios**. La tanda
3 los necesita para el picker con filtro de duración, y volver a pedirlos
implicaría re-tocar toda la biblioteca.

**Orden interno:** schema v3 completo de una → migrador → reglas → UI de cada
feature → colecciones al final, que es la que más superficie nueva agrega.

> Es la tanda más pesada de las cuatro. El progreso por episodio vale por dos.
> Si alguna hay que partir en dos sesiones, es esta.

**Resultado:** deja de ser una lista de deseos y pasa a ser un tracker de verdad.

---

## Tanda 3 — Descubrir y decidir

*Todo lo que consume los datos ricos de la tanda 2, más los endpoints nuevos.*

| Feature |
|---|
| Tab Explorar (tendencias, populares) |
| Recomendaciones personalizadas |
| Smart Picker 2.0 |
| Modo duelo / torneo |
| Dashboard de estadísticas |

**Base compartida:** dos endpoints serverless nuevos (`/api/tmdb/trending`,
`/api/tmdb/recommendations`) que estrenan la **capa de caché** — hoy
`api/_lib/tmdb.ts` no cachea nada y *trending* es idéntico para todos los
usuarios. Del otro lado, recomendaciones, picker, duelo y estadísticas son todas
**agregaciones sobre la biblioteca propia**: un único módulo de selectores
derivados, con sus tests, alimenta a las cuatro.

**Orden interno:** caché + endpoints → Explorar → Recomendaciones → selectores
derivados → Dashboard → Picker 2.0 → Duelo.

**Resultado:** la app entretiene. Es la tanda que genera los screenshots.

---

## Tanda 4 — Salir a producción

*Lo que mira hacia afuera, más el arnés de seguridad.*

| Feature |
|---|
| "Tu año en Qué Miro" (wrapped) |
| Perfil público compartible |
| Compartir título / resultado del picker |
| Offline real (cola de escrituras + UI optimista) |
| Tests E2E con Playwright + CI |

**Por qué van juntas:** wrapped, perfil público y compartir usan **el mismo
renderizador de tarjetas** (en cliente para compartir, en servidor para la imagen
OG dinámica) y **las mismas rutas públicas + reglas de lectura anónima**.
Hacerlas por separado sería escribir tres veces el mismo generador de imágenes.

**Offline y E2E van al final a propósito:** offline reescribe el camino de
escritura que la tanda 2 acaba de estabilizar, y escribir tests E2E contra una UI
que todavía cambia es tirar el trabajo. Acá cubren flujos ya congelados: buscar →
agregar → puntuar → sincronizar → compartir.

**Orden interno:** rutas públicas + reglas → renderizador de tarjetas → perfil
público → wrapped → compartir → offline → E2E.

**Resultado:** publicable, con link propio y CI que lo respalda.

---

## Resumen

```
T1  Cimientos      demo, tema+a11y, región, filtros, export/import
T2  Datos ricos    episodios, historial, tags, providers, colecciones
T3  Descubrir      explorar, recomendaciones, picker 2.0, duelo, stats
T4  Producción     wrapped, perfil público, compartir, offline, E2E
```
