# Qué Miro? — convenciones del repo

## Antes de codear
- Leé los archivos que menciona el pedido y proponé un plan corto: archivos a tocar, cambios en los datos, tests. No escribas código hasta que lo apruebe.

## Idioma y estilo
- Identificadores en inglés. Comentarios, textos de UI y mensajes en español rioplatense, con voseo.
- Los comentarios explican el porqué, no el qué, como los que ya hay en el repo.

## Dónde va cada cosa
- Lógica pura en `src/lib/*.ts`, con su `*.test.ts` al lado. Los componentes no calculan: llaman a `lib/`.
- Las escrituras de la biblioteca pasan por `useMediaActions` (o el hook de acciones que corresponda). Sin conexión no se espera a Firestore: las escrituras se lanzan sin `await`.
- Los datos de la cuenta (se sincronizan, van al backup y se borran con la cuenta) viven en `users/{uid}/...`, con el mismo `ownerUid`. Las preferencias de este dispositivo van en `src/preferences.ts`.

## Datos
- Todo lo que entra a la biblioteca pasa por `parseMedia` (`src/lib/schema.ts`): Firestore, localStorage y backups. No hay migraciones en otro lado.
- Preferí campos opcionales y aditivos: puede haber una PWA vieja en otro dispositivo leyendo el mismo documento. Si un cambio no puede ser aditivo, subí `SCHEMA_VERSION`, migrá en `parseMedia` y explicá por qué.
- Cada campo nuevo se refleja en `src/types.ts`, `parseMedia`, `firebase-blueprint.json`, el backup y el CSV si corresponde, y la biblioteca de ejemplo de los tests (`src/test/fixtures/sampleLibrary.ts`) queda coherente.

## TMDB
- Solo `api/_lib/tmdb.ts` habla con TMDB. Cada endpoint nuevo lleva lista blanca de parámetros, reenvía solo los campos que la app usa, usa `withCache` + `cacheHeaders` y se monta también en `server.ts`.
- El servidor no sabe qué vio nadie. Si una feature necesita que el servidor lea datos de una persona, se publica una instantánea curada en su propia colección (el patrón de `public_profiles`), nunca una ventana a `saved_media`.
- Donde se muestren plataformas, se atribuye a JustWatch.

## Firestore
- Los cambios de acceso van en `firestore.rules`, con un comentario del porqué. Recordame que hay que publicarlas.

## UI
- Tokens `--qm-*`, utilidades `text-display` / `text-section` / `text-eyebrow`, radios `--radius-control` / `--radius-surface`, clase `surface`. Todo tiene que andar en tema claro y oscuro con contraste AA (`contrast.test.ts`).
- Modales con `ui/Dialog`. Respetar `prefers-reduced-motion`. Doble navegación: barra inferior hasta `md`, superior desde `md`.
- Nada de filas vacías con una excusa adentro: si no hay datos para armar algo, no se muestra.

## Cierre
- `npm run lint` y `npm test` en verde. Si cambió un flujo cubierto por E2E, también `npm run test:e2e`.
- Si la feature se ve, actualizá la lista de Features del README.
