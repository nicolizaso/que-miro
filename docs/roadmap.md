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

| Feature | Estado |
|---|---|
| Progreso por temporada y episodio | ✅ |
| Historial y revisiones múltiples | ✅ |
| Reseñas con tags/ánimo | ✅ |
| Filtro por plataforma (guardar providers al agregar) | ✅ |
| Listas y colecciones propias | ✅ |

**Por qué van juntas:** las cinco tocan `src/types.ts`, `useMediaActions.ts`,
`SyncManager.tsx` y `firestore.rules`. Separarlas es pagar cuatro veces el mismo
peaje: migrar documentos existentes, re-testear la sincronización y revisar las
reglas de seguridad.

**Cómo quedó implementada**

- **Una sola puerta de entrada a la migración.** Todo lo que entra a la app —los
  documentos de Firestore, lo que había en `localStorage` y los backups
  importados— pasa por `parseMedia`. La conversión del `review` único de la v1
  al `history` de la v2 vive ahí y en ningún otro lado.
- **El enriquecimiento se cachea en el título.** Al agregar algo se pide su
  ficha una vez y se guardan plataformas, duración, temporadas y total de
  episodios. Lo necesitan el filtro por plataforma y el progreso, que trabajan
  sobre la biblioteca entera: pedir la ficha de cada título en cada cambio de
  filtro no es viable. `isStale` marca cuándo hay que refrescar, y la ficha
  completa lo que falte cuando se abre un título viejo.
- **La duración y el total de episodios ya están guardados**, que es lo que la
  tanda 3 necesita para el picker con filtro de duración.
- **La pertenencia a una colección vive en el título**, no en la colección:
  "agregar este título a esta lista" es la operación frecuente y así es una sola
  escritura. El precio se paga al borrar una lista, que es mucho más raro.

**Resultado:** deja de ser una lista de deseos y pasa a ser un tracker de verdad.

---

## Tanda 3 — Descubrir y decidir

*Todo lo que consume los datos ricos de la tanda 2, más los endpoints nuevos.*

| Feature | Estado |
|---|---|
| Tab Explorar (tendencias, populares) | ✅ |
| Recomendaciones personalizadas | ✅ |
| Smart Picker 2.0 | ✅ |
| Modo duelo / torneo | ✅ |
| Dashboard de estadísticas | ✅ |

**Base compartida:** dos endpoints serverless nuevos (`/api/tmdb/trending`,
`/api/tmdb/recommendations`) que estrenan la **capa de caché** — hoy
`api/_lib/tmdb.ts` no cachea nada y *trending* es idéntico para todos los
usuarios. Del otro lado, recomendaciones, picker, duelo y estadísticas son todas
**agregaciones sobre la biblioteca propia**: un único módulo de selectores
derivados, con sus tests, alimenta a las cuatro.

**Cómo quedó implementada**

- **La caché tiene dos capas.** Una en el proceso, que aprovecha las instancias
  tibias de Vercel, y los headers `s-maxage` que hacen que el borde sirva la
  respuesta sin llegar a la función. Los errores no se cachean: un TMDB caído no
  queda pegado durante toda la ventana del TTL.
- **El servidor no sabe qué vio nadie.** TMDB dice qué se parece a qué —eso es
  igual para todo el mundo, por eso se puede cachear— y el cliente arma sus
  recomendaciones cruzándolo con su propia biblioteca.
- **Un solo módulo de agregaciones** alimenta recomendaciones, dashboard, picker
  y duelo. La unidad es "una vez que viste algo", no "un título".
- **El ranking del duelo son dos campos opcionales** que se suman al schema v2
  sin migración: un documento viejo simplemente no los trae. El roadmap los
  había previsto para la tanda 2; al ser aditivos, llegar tarde no costó nada.

**Resultado:** la app entretiene. Es la tanda que genera los screenshots.

---

## Tanda 4 — Salir a producción

*Lo que mira hacia afuera, más el arnés de seguridad.*

| Feature | Estado |
|---|---|
| "Tu año en Qué Miro" (wrapped) | ✅ |
| Perfil público compartible | ✅ |
| Compartir título / resultado del picker | ✅ |
| Offline real (cola de escrituras + UI optimista) | ✅ |
| Tests E2E con Playwright + CI | ✅ |

**Por qué van juntas:** wrapped, perfil público y compartir usan **el mismo
renderizador de tarjetas** (en cliente para compartir, en servidor para la imagen
OG dinámica) y **las mismas rutas públicas + reglas de lectura anónima**.
Hacerlas por separado sería escribir tres veces el mismo generador de imágenes.

**Offline y E2E van al final a propósito:** offline reescribe el camino de
escritura que la tanda 2 acaba de estabilizar, y escribir tests E2E contra una UI
que todavía cambia es tirar el trabajo. Acá cubren flujos ya congelados: buscar →
agregar → puntuar → sincronizar → compartir.

**Cómo quedó implementada**

- **El perfil público es una instantánea, no una ventana.** Abrir `saved_media`
  a lectura anónima expondría también lo que no se quiso publicar, así que lo
  que se comparte es una copia curada en `public_profiles/{slug}`, con su fecha
  a la vista y un botón para volver a publicarla.
- **Los meta tags los resuelve el servidor.** Los scrapers de redes no ejecutan
  JavaScript, así que `/u/:slug` lo sirve una función que inyecta título y
  descripción en el HTML antes de mandarlo. Lee el perfil por la API REST de
  Firestore: la colección es de lectura anónima por diseño, así que no hacen
  falta credenciales de servidor ni el SDK de admin.
- **La tarjeta que se comparte se dibuja como SVG y se pasa a PNG en el
  navegador.** No lleva el póster a propósito: las imágenes de TMDB son de otro
  origen y contaminarían el canvas, con lo cual `toBlob` fallaría.
- **Offline dejó de esperar al servidor.** `setDoc` resuelve recién cuando el
  cambio llegó a Firestore: sin conexión no resuelve nunca, y esperarlo dejaba
  la app con el spinner girando. Ahora las escrituras sueltas se lanzan sin
  esperar —la caché local ya disparó el `onSnapshot`— y quedan encoladas hasta
  que vuelva la red.

**Resultado:** publicable, con link propio y CI que lo respalda.

---

## Rediseño de UI y UX ✅

Las cuatro tandas dejaron la app completa en función, no en forma. Esta pasada
no agrega ninguna funcionalidad: acomoda lo que ya existe para que se pueda
usar cómodo y se pueda mostrar.

Es un **rediseño de preservación**: la marca —Playfair, el rojo, el doble
tema— se queda. El problema no era la marca sino cómo estaba aplicada.

**Qué estaba mal**

| Síntoma | Por qué importaba |
| --- | --- |
| Barra de navegación inferior también en escritorio | Un patrón de teléfono a 1440 px, tapando contenido |
| Playfair itálica en absolutamente todo | Un display serif a 18 px repetido cien veces no jerarquiza: cansa |
| El perfil, una columna de 3700 px | Ocho bloques iguales apilados; nadie llega al final |
| "Tu año" pintado con un negro fijo | En tema claro era un agujero negro en medio de una página crema |
| Los `select` con el estilo del sistema operativo | El único control que no pertenecía al resto |
| 350 px de filtros antes del primer póster en el teléfono | La app abría mostrando controles, no biblioteca |
| Ni la home ni el perfil tenían `h1` | La navegación por encabezados no llevaba a ninguna parte |

**Cómo quedó implementado**

- **Dos navegaciones, una sola a la vez.** Barra inferior hasta `md`, barra
  superior de ahí en adelante. La que no corresponde queda en `display: none`,
  así que ni el teclado ni el lector de pantalla ven enlaces duplicados.
- **El perfil se partió en dos pestañas con URL propia**, `/perfil` y
  `/perfil/ajustes`. Son enlaces y no botones justamente porque cambian de
  dirección: "atrás" y "recargar" hacen lo que se espera.
- **La Playfair itálica quedó reservada** para el título de una vista y las
  cifras protagonistas. El resto pasó a la sans del sistema. Tres utilidades
  nuevas lo hacen explícito: `text-display`, `text-section`, `text-eyebrow`.
- **Un radio por rol.** `--radius-control` y `--radius-surface` reemplazan los
  `rounded-xl` y `rounded-2xl` sueltos, y `surface` es la tarjeta estándar.
- **El borde de un control se separó del de una tarjeta.** Son dos trabajos
  distintos: el de la tarjeta es decorativo y puede ser sutil, el del campo es
  lo único que dice dónde empieza el campo y WCAG le pide 3:1. Con un solo
  token, el borde de los inputs en tema claro daba 1,24:1 —invisible.
- **La paleta se corrigió contra WCAG AA y quedó bajo test.** El texto sutil
  en tema claro no llegaba a 4,5:1; el blanco sobre el rojo del tema oscuro,
  tampoco (4,17:1), así que ahí la etiqueta del botón pasó a ser tinta sobre el
  acento brillante. `src/lib/contrast.test.ts` lee `index.css`, saca los tokens
  y verifica los 15 pares de cada tema; además compara las dos copias del tema
  claro, que se editan a mano y se pueden desincronizar.
- **"Tu año en Qué Miro?" sigue el tema.** La imagen que se comparte se dibuja
  aparte en `shareCard`, con su propia paleta fija, así que en pantalla no
  había nada que igualar y sí un tema que respetar.

**Resultado:** una app que se puede mostrar en un portfolio sin pedir disculpas
por cómo se ve en escritorio.

---

## QM-2 — Explorar que cambia con vos

*La pestaña mostraba siempre lo mismo. Ahora se arma con la biblioteca.*

**Qué estaba mal**

Explorar tenía tres filas fijas y una sola idea de recomendación: "porque viste
X", sembrada con los tres títulos mejor puntuados. Por más que la biblioteca
creciera, la pestaña se veía igual todos los días, y todo lo que la app ya sabía
—quién dirigió lo que te gustó, con qué actriz te cruzaste tres veces, qué
género venís mirando, qué serie dejaste a medias— no aparecía en ninguna parte.

**Cómo quedó implementado**

- **Tres capas, cada una con un solo trabajo.** `taste.ts` mira la biblioteca y
  saca señales (favoritos, directores, actores, géneros, décadas, idiomas,
  plataformas, temas, sagas, pendientes olvidados, series a medias).
  `recipes.ts` tiene las 25 formas de convertir una señal en una fila.
  `feed.ts` las baraja y reparte los títulos. Agregar una receta nueva es tocar
  un solo archivo, y ninguna de las tres habla con la red.
- **La biblioteca aprendió quién es quién.** `SavedMedia` guarda ahora el
  reparto principal, la dirección, los temas, la saga y el idioma original. Sale
  de la misma ficha que ya se pedía al agregar un título, así que no cuesta ni
  una llamada más; los títulos guardados antes se completan de a seis por visita,
  empezando por los mejor puntuados.
- **Una fila que no tiene con qué armarse no existe.** Sin director puntuado
  arriba de 4 no hay fila de director. Sin plataformas guardadas no hay fila de
  plataformas. Preferimos una pestaña más corta que una fila vacía con una
  excusa adentro — y con biblioteca vacía siguen estando las de todos.
- **El azar tiene semilla.** Se estrena en cada visita, así que el orden cambia;
  dentro de una visita no se mueve, que es lo que el scroll infinito necesita
  para no reacomodar las filas abajo del dedo. El peso manda sobre el azar: una
  fila armada con tu biblioteca nunca queda detrás de "películas populares".
- **Ningún título aparece dos veces.** Las filas piden sus datos en paralelo y
  varias pueden traer la misma película: la primera que la reclama se la queda.
  El registro es idempotente por fila, porque en desarrollo React monta todo dos
  veces.
- **Tres endpoints nuevos, con lista blanca.** `/discover`, `/person` y `/saga`
  validan cada parámetro contra valores permitidos en vez de reenviarlos a TMDB:
  la ruta es pública, y sin eso sería una API key prestada. El nombre de la
  plataforma se resuelve contra la lista real de TMDB, que se renombra sola cada
  tanto.

**Resultado:** dos visitas seguidas a Explorar no se parecen, y lo que se ve sale
de lo que esa persona vio y puntuó.

---

## QM-3 — Contanos de vos

*Explorar deducía todo. Ahora también pregunta.*

**Qué estaba mal**

Todo lo que Explorar sabía de alguien salía de su biblioteca, y eso tiene dos
límites. El primero es el tiempo: hasta que no hay una docena de títulos
puntuados no hay con qué armar una fila personal, así que quien recién se
instala la app ve la misma pestaña que todo el mundo justo el día en que más
falta le hace una recomendación. El segundo es que hay cosas que la biblioteca
no va a saber nunca. *La* película favorita —esa que se vio cinco veces antes de
instalar esto— no está en *Por Ver* ni tiene una reseña: no se anota lo que ya
se sabe de memoria. Lo mismo con la actriz que se sigue a cualquier lado o con
la productora cuyo sello alcanza para decidir.

**Cómo quedó implementado**

- **Siete preguntas y ningún botón de guardar.** Película, serie, géneros,
  actores, directores, productoras y década. Cada respuesta se guarda sola
  cuando se elige, porque son independientes entre sí: un formulario con un
  botón al final invita a contestarlo entero o nada, y con una sola respuesta
  Explorar ya cambia. La pantalla lleva la cuenta —"3 de 7"— y ofrece ir a ver
  cómo quedó.
- **Lo declarado y lo deducido no se mezclan.** `taste.ts` sigue leyendo la
  biblioteca y `picks.ts` guarda lo que la persona contestó. Cada receta lee una
  sola de las dos fuentes, y las nueve que leen lo declarado pesan más que sus
  equivalentes deducidas: lo que alguien dice de sí mismo no hay que
  interpretarlo. Son 34 recetas en total.
- **Las respuestas son datos de la cuenta, no del dispositivo.** Viven al lado
  de la biblioteca, con el mismo dueño: se sincronizan como un documento
  (`users/{uid}/profile/taste`, gana el más nuevo), se van en el backup, se
  restauran al importarlo y se borran con la cuenta. Sin ese `ownerUid`
  compartido, el cuestionario de quien usó el celular antes se le aparecería al
  siguiente que inicie sesión.
- **Dos búsquedas nuevas, con la misma lista blanca.** `/api/tmdb/search` acepta
  ahora `kind=person` y `kind=company` —hace falta poder nombrar a una directora
  que no aparece en ninguna película guardada— y `/discover` aprendió a filtrar
  por productora. De la respuesta de TMDB se reenvían cuatro campos y no la
  ficha entera: `known_for` trae la sinopsis de tres títulos por persona, que
  acá no mira nadie.
- **El demo viene contestado.** Sus respuestas son coherentes con su biblioteca,
  así que quien entra a mirar la app ve también las filas que salen de acá; al
  salir del demo se devuelve el cuestionario que hubiera antes, igual que la
  biblioteca.

**Resultado:** Explorar tiene filas tuyas desde el primer día, y lo que la
biblioteca nunca iba a poder deducir ahora se puede decir en dos minutos.

---

## Previa — Atribución y castellano latino

*Dos arreglos chicos que tocan todas las respuestas de TMDB.*

**Qué estaba mal**

Todas las plataformas de la app —la ficha, el filtro, el picker, la fila de
Explorar— salen de `watch/providers` de TMDB, que se alimenta de JustWatch, y
"JustWatch" no aparecía en ningún lado. TMDB avisa que revoca el acceso a la
API si esos datos se usan sin atribuirlos, y pide que su propio aviso y su logo
estén visibles en la aplicación: estaban solo en el README.

El otro arreglo es de idioma. `TMDB_LANGUAGE` estaba fijo en `es-ES`, así que
desde Argentina se veía *La jungla de cristal* en vez de *Duro de matar*: el
título correcto, en el castellano equivocado.

**Cómo quedó implementado**

- **La atribución va donde está el dato.** La ficha dice "Datos de plataformas:
  JustWatch" al lado de las plataformas y suma "Ver dónde verlo", que lleva a la
  página de TMDB con los enlaces directos a cada servicio —la API da nombres y
  logos, pero no esos enlaces—. Los filtros por plataforma y la fila de Explorar
  nombran la fuente. Ajustes termina con *Acerca de*: el logo de TMDB, chico y
  al fondo para que no compita con la marca propia, su aviso y el crédito a
  JustWatch. El perfil público, que ve gente sin cuenta, lleva el aviso en el pie.
- **El idioma sale de la región.** La app ya sabía de dónde es cada persona —el
  país de las plataformas—, así que no hizo falta una preferencia más: España
  lee en `es-ES` y el resto en `es-MX`. Todos los endpoints aceptan `lang` con
  lista blanca, y el idioma entra en cada clave de caché; si no, la respuesta en
  un idioma se serviría a quien pidió el otro.
- **La sinopsis que falta se completa, el título no.** Las traducciones las
  carga la comunidad de TMDB y a veces solo existe la de España: en ese caso el
  servidor pide la sinopsis en `es-ES`, en una segunda llamada liviana y solo
  cuando hace falta. El título, en cambio, se deja: si la ficha latina no lo
  traduce es porque en Latinoamérica suele estrenarse con el original.
- **Lo guardado se corrige solo.** Cada título anota en qué idioma se enriqueció
  (`enrichedLanguage`), el enriquecimiento ahora trae el título y `isStale`
  compara el idioma con el de la región. Lo que se guardó en castellano de
  España pasa al latino la próxima vez que se refresca, sin migrar nada de golpe.
- **Un solo nombre por género.** TMDB nombra distinto los géneros en cada
  castellano —"Suspense" y "Suspenso"— y la biblioteca los compara como texto:
  el filtro, las filas de Explorar, el cuestionario. Ahora se guardan traducidos
  por id, con el nombre de la app, sin importar en qué idioma llegó la ficha.

**Resultado:** la app cumple con lo que TMDB exige para seguir usando su API, y
cada persona lee los títulos como se conocen en su país.

---

## Resumen

```
T1  Cimientos      demo, tema+a11y, región, filtros, export/import
T2  Datos ricos    episodios, historial, tags, providers, colecciones
T3  Descubrir      explorar, recomendaciones, picker 2.0, duelo, stats
T4  Producción     wrapped, perfil público, compartir, offline, E2E
UI  Rediseño       navegación, tipografía, formas, contraste AA
QM2 Explorar       señales de gusto, 25 recetas, feed barajado e infinito
QM3 Contanos       cuestionario de favoritos, 9 recetas declaradas
Pre Previa         atribución a JustWatch y TMDB, castellano latino
```
