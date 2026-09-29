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

## QM-4 — Series vivas

*Las series se guardaban como una foto. Ahora se enteran de lo que pasa.*

**Qué estaba mal**

Una serie se guardaba con sus temporadas del día en que se agregó, y
`isStale` solo vencía si cambiaba el país: nunca se volvía a pedir. No se
enteraba de una temporada nueva ni de que había terminado, y como TMDB carga
los episodios antes de que salgan, una serie en emisión vista al día nunca
llegaba al 100%. Para anotar el episodio de anoche había que buscar la serie,
abrir la ficha y encontrar el número en una grilla que no decía qué era cada
uno.

**Cómo quedó implementado**

- **Cada título vence según lo que es.** Una serie en emisión en tres días, una
  en producción en una semana, una terminada en tres meses, una película en un
  mes —por las plataformas—. Y una serie vence al día siguiente de que sale el
  episodio que su ficha anunciaba: así una semanal se entera de cada episodio
  sin preguntar todos los días. Un refresco en segundo plano los va poniendo al
  día de a ocho por visita, lo que estás viendo primero.
- **`/tv/changes` se evaluó y quedó afuera.** Son miles de ids por día, casi
  todos por cambios que no importan —un póster, una traducción—, y el próximo
  episodio guardado ya da la señal que sí importa, gratis.
- **Un refresco no es algo que hizo la persona.** Escribe sin tocar
  `updatedAt`, que es lo que ordena "Agregados hace poco": si no, la lista se
  reacomodaba sola en cada visita. Tampoco toca el progreso, que se guarda por
  número de temporada y sobrevive a que la serie sume una.
- **La región pedida se separó de la de las plataformas.** Comparar contra
  `providerRegion` dejaba vencido para siempre a todo título sin catálogo en tu
  país, y el refresco lo habría vuelto a pedir en cada visita.
- **Los episodios tienen ficha.** Una temporada se pide recién al desplegarla y
  muestra cada episodio con nombre, fecha, duración e imagen; la sinopsis de lo
  que no viste queda escondida, y lo que no salió aparece con su fecha. Sin
  conexión queda la grilla de números. De paso se guarda la duración real de la
  temporada, que las estadísticas prefieren a "primer episodio por cantidad".
- **"Al día" se calcula, no se guarda.** El porcentaje se cuenta contra lo
  emitido, "marcar toda" marca lo que salió, y una serie en emisión vista hasta
  el final dice "Estás al día" y cuándo sale el próximo, en vez de "La
  terminaste".
- **Las novedades son una marca, no un contador.** Cuando el refresco trae
  episodios en una serie terminada o al día, se anota desde cuál hay novedades;
  lo que falta ver se calcula contra el progreso, así que el aviso —"T3 nueva",
  "2 episodios nuevos"— se apaga solo a medida que se mira. El estado no cambia
  por su cuenta: la tarjeta ofrece volver a *Viendo*.
- **Continuar viendo y el calendario leen lo mismo.** La fila del inicio marca
  el siguiente episodio de un toque, con "Deshacer"; el calendario junta lo que
  sale en los próximos días y pide la temporada entera de lo que sale este mes,
  para que una que se estrena de una vez se vea como tal. En la barra inferior
  no entra otra pestaña sin descentrar el Picker, así que en el teléfono el
  calendario está en el header.

**Resultado:** la biblioteca se mueve con las series. Se sabe qué sale, qué
salió desde la última vez y por dónde retomar, sin abrir una sola ficha.

---

## QM-5 — Historial fino

*Qué viste, cuándo, qué tal y qué dejaste por el camino.*

**Qué estaba mal**

La biblioteca sabía si viste algo, pero no cuándo ni qué tal cada parte. Un
episodio marcado no tenía fecha, así que una serie que miraste todo agosto
aparecía en las estadísticas el día que la terminaste. Solo había tres
estados: lo que dejaste a la mitad quedaba para siempre en *Viendo*, contando
como pendiente en todos lados. No había forma de puntuar un episodio, ni de
proponerse algo para el año.

**Cómo quedó implementado**

- **Cada episodio sabe cuándo lo viste.** `progress.watchedAt` va aparte de
  `watched`, para que una PWA vieja siga leyendo la lista de números sin
  enterarse. Lo marcado antes no tiene fecha y no se inventa. Las horas por
  mes cuentan episodios en el día que se vieron y no suman dos veces lo que
  después se terminó, y un mapa de calor muestra los días que miraste algo.
- **En pausa y abandonada, sin perder datos con versiones viejas.** Una PWA
  sin actualizar valida `status` contra los tres de siempre y cambia lo que no
  conoce por *Por Ver*; con la próxima escritura que incluya el estado lo
  guardaba así. Por eso en Firestore y en los backups `status` queda en
  `viendo` —lo que esa versión muestra bien— y el estado real va en el campo
  aditivo `archive`. Si una versión vieja mueve el título de lista, gana lo
  que hizo. En la app viven en *Archivadas*, una puerta dentro de Mis listas y
  no dos pestañas más.
- **Abandonar dice algo.** Pide confirmación, admite un motivo y un puntaje
  —marcado como de una vuelta abandonada, que no suma horas ni vistas aunque
  la retomes—, y sale de Continuar viendo, del calendario, del picker y de los
  avisos. En el gusto es señal en contra: no siembra "porque viste" y le baja
  el peso a lo muy parecido (misma saga, misma dirección, varios temas en
  común). Las estadísticas cuentan la tasa de abandono y después de cuántos
  episodios se suele dejar una serie. Una serie quieta hace dos meses pregunta
  si la ponés en pausa; nunca lo hace sola.
- **Puntaje por episodio.** Vive en `progress.episodeRatings` porque se
  puntúa mientras se mira, antes de que exista una reseña. En la fila de cada
  episodio visto es un botón chico que despliega las estrellas: cien estrellas
  de ocho píxeles por temporada no se pueden acertar con el dedo. La ficha
  muestra tu mejor episodio, tu peor y el promedio por temporada; el wrapped,
  el episodio del año.
- **Metas y rachas.** `profile/goals`, cubierto por la regla existente de
  `profile/{docId}`, con metas por año para que la de 2025 siga valiendo en el
  resumen de 2025. Se miden contra el ritmo —"vas 2 películas abajo del
  ritmo"—, y la racha cuenta semanas ISO en la zona del dispositivo, sin
  cortarse porque sea lunes.
- **De paso, un bug de sincronización.** `setDoc` con `merge: true` mezclaba
  los mapas de adentro: desmarcar una temporada entera no se borraba en
  Firestore y volvía con el próximo snapshot. Las escrituras de títulos pasaron
  a `mergeFields`, que reemplaza cada campo entero.
- **Un E2E intermitente que era un bug.** La grilla de Mis listas, con
  `AnimatePresence` en modo `wait`, quedaba mostrando las tarjetas de la
  pestaña anterior si la lista cambiaba durante la salida. Se sacó la
  animación de salida: 0 fallos en 30 corridas, contra 6 en 30.

**Resultado:** el historial deja de ser una lista de tildes. Dice cuándo, qué
tal y qué quedó en el camino, y todo sigue siendo aditivo: un documento viejo
se lee igual, y una versión vieja de la app no rompe nada nuevo.

---

## QM-6 — Plataformas y avisos

*Qué podés ver ya, qué llegó y qué sale hoy, sin tener que ir a buscarlo.*

**Qué estaba mal**

"Está en Prime Video" podía ser incluido o alquiler: el enriquecimiento
juntaba `flatrate`, `rent` y `buy` en una sola lista. La app no sabía qué
plataformas pagabas, así que no podía responder "¿qué puedo ver esta noche?".
Las plataformas se anotaban una vez, al guardar el título, y nadie se enteraba
cuando algo de *Por Ver* llegaba a una. Y para saber que salía un episodio
había que abrir la app: no había avisos ni forma de llevar el calendario a la
agenda.

**Cómo quedó implementado**

- **Tus plataformas.** `streaming` guarda lo incluido en una suscripción
  (`flatrate`, `free`, `ads`) y `providers` queda como estaba, para no romper
  filtros ni documentos viejos. Las suscripciones se eligen en Ajustes con sus
  logos (`/api/tmdb/providers`, cacheado un día) y son de la cuenta:
  `profile/subscriptions`. "Lo que puedo ver ya" filtra biblioteca y picker,
  Explorar usa lo declarado antes que lo deducido, y la ficha separa "Incluido
  en" de "Alquiler o compra".
- **Llegó a tu plataforma.** El refresco en segundo plano compara las
  plataformas nuevas con las guardadas —con los nombres normalizados: *HBO
  Max* y *Max* son la misma— y anota `availabilityNews`. Para las películas
  anotadas antes de salir, el servidor recorta de `release_dates` solo el
  estreno digital de cada país. Las novedades van en una fila del inicio y no
  arriba de *Por Ver*: la pregunta "¿qué puedo ver que antes no podía?" se
  hace al abrir la app. Se descartan con un toque y no vuelven. El servidor no
  se entera de nada: es el cliente cruzando lo que refrescó.
- **Avisos push.** `vite-plugin-pwa` pasó a `injectManifest` con un
  `src/sw.ts` propio que conserva el precache y la caché de pósters, y suma
  `push` y `notificationclick`, que abre la ficha con `/?ficha=tv:ID`. El
  permiso se pide solo desde un toque ("Avisame de episodios nuevos", en la
  ficha o en Ajustes). Lo que ve el servidor es `push_subscriptions/{uid}`:
  tokens, país, idioma y los ids de las series con aviso, con las claves
  cerradas en las reglas. El cron diario (`api/cron/notify.ts`, con
  `CRON_SECRET`) lo lee con `firebase-admin`, pide cada serie una sola vez y
  manda un aviso por dispositivo —tres series el mismo día son un aviso, no
  tres—. Los tokens muertos se borran; cerrar sesión saca el del dispositivo.
  La lógica de a quién avisarle qué es pura y tiene tests. En iPhone y iPad
  con Safari se explica cómo instalar la app en vez de mostrar un botón que no
  anda.
- **Calendario en la agenda.** `calendar_feeds/{token}` es una instantánea con
  los episodios —serie, temporada, episodio, nombre y fecha— detrás de un
  token largo y al azar: `get` público, `list` prohibido, `uid` inmutable.
  `api/cal/[token].ts` la lee por la API REST y arma el `.ics`: eventos de
  día completo, UID estable por episodio, escape y plegado según RFC 5545. La
  app la republica con debounce cuando cambia el calendario, y conserva el
  último mes para que la agenda no borre lo que ya salió. Regenerar el token
  revoca el link anterior (el borde lo cachea cinco minutos, no más).

**Decisiones y hallazgos**

- *Una temporada que sale entera es un evento*, no diez apilados en el mismo
  día. Su UID es el del primer episodio, así que sigue siendo estable.
- *El pedido decía "con debounce, como `usePublishProfile`"*, pero ese hook no
  tenía debounce: publicaba a mano. El debounce se escribió acá, y la tanda
  QM-7 lo reusa para el perfil que se actualiza solo.
- *Dos dispositivos no se pelean.* La instantánea de avisos y la del
  calendario solo se reescriben cuando cambia lo que calcula ese dispositivo,
  no cuando otro publica algo distinto; si no, dos pestañas con otro país se
  corregirían entre sí para siempre.
- *Un test que pasaba sin probar nada.* El escape del punto y coma del `.ics`
  había quedado como `'\;'` —en JavaScript, un `;` a secas— en el código y en
  el test a la vez. Lo encontró pasar un feed de verdad por un parser externo
  (`icalendar`); los dos quedaron corregidos.
- *El plan de Vercel.* El proyecto está en Hobby. Ahí los cron jobs corren
  como mucho una vez por día y con precisión de hora (el de las 13:00 UTC
  puede dispararse hasta las 13:59), y la función tiene 60 segundos
  (`maxDuration`), holgados para pedir unas cientos de series con concurrencia
  acotada. Una corrida diaria alcanza. No se pudo abrir la página de límites de
  Vercel desde este entorno: conviene confirmarlo en *Settings → Cron Jobs*
  después del primer deploy.

**Resultado:** la app sabe qué pagás y qué llegó, avisa el día que sale un
episodio y lleva el calendario a la agenda. El servidor sigue sin leer la
biblioteca de nadie: todo lo que usa son instantáneas curadas, cada una con
sus reglas. **Hay que publicar las reglas de Firestore** (`push_subscriptions`
y `calendar_feeds` son nuevas) y cargar las variables de los avisos (ver el
README).

---

## QM-7 — Compartir

*Que lo publicado se mantenga solo, y que sirva para algo más que mirarlo.*

**Qué estaba mal**

El perfil público era una foto que había que volver a sacar a mano: si nadie
se acordaba de tocar "Actualizar", quedaba vieja. No se podía seguir a nadie,
ni compartir una lista propia, ni cruzar lo que uno quiere ver con lo que
quiere ver otra persona. Y había tres cosas que sobrevivían a borrar la
cuenta: el perfil publicado, las listas propias (la subcolección no se
borraba) y, con esta tanda, lo que se publicara de ellas.

**Cómo quedó implementado**

- **Perfil que se actualiza solo.** "Mantener actualizado" se guarda con el
  perfil y está prendido por defecto, también para los publicados antes. Un
  hook en el marco arma la instantánea, la compara con la publicada sin mirar
  la fecha y, si cambió, la programa en `lib/autoPublish.ts`: 30 segundos de
  debounce, un mínimo de 5 minutos entre publicaciones y, sin red, nada de
  reintentos: lo último pendiente sale cuando vuelve la conexión. Ajustes y la
  vista pública dicen "actualizado hace X".
- **Seguir perfiles.** `profile/following` guarda a quién seguís con el uid
  del dueño al momento de seguirlo: si el slug pasa a otra cuenta, no se
  muestra nada del dueño nuevo. *Siguiendo* mezcla las reseñas por fecha y
  deja guardar cada título en *Por Ver*. Abrir el feed cuesta una lectura por
  perfil seguido (hasta cien) y como mucho una vez cada 15 minutos: entre
  medio sale de una caché del dispositivo atada a la cuenta.
- **Listas compartibles.** `public_lists/{id}` con lo mínimo de cada título,
  publicada desde Mis listas y con la misma actualización sola. `/l/:id` la
  sirve una función con su vista previa, y lo que compartía con `/u/:slug`
  pasó a `api/_lib/og.ts`. Quien la abre guarda un título o la lista entera
  como colección propia, con un nombre libre.
- **¿Qué miramos juntos?** "Incluir mi Por Ver" y "Incluir mis plataformas"
  son opciones del perfil, apagadas por defecto. `/juntos/:slug` cruza los
  dos *Por Ver* —primero lo común, después lo que uno quiere ver y el otro no
  vio— con la ruleta y el duelo del picker en modo de a dos.

**Decisiones y hallazgos**

- *`list` prohibido en las listas.* El pedido era copiar las reglas de los
  perfiles, que permiten `read` entero. Se copió lo que importa —solo escribe
  el uid que declara el documento, sin poder cambiarlo— pero una lista se
  comparte por link: no hay por qué dejar que alguien las recorra todas.
- *"Ya vio", de la otra persona, es lo que publicó.* El cruce descarta lo que
  la otra persona reseñó o tiene entre sus favoritas, no su historial entero:
  la opción se llama "Incluir mi Por Ver", y publicar además todo lo visto
  sería más de lo que dice.
- *El duelo de a dos no toca tu lista.* El del picker guarda el puntaje en
  cada título; de a dos, el ranking es de esa noche y vive en la pantalla.
- *Instantáneas comparadas sin depender del orden.* Firestore no promete el
  orden de las claves: las comparaciones usan JSON con las claves ordenadas.
- *De paso:* `api/u/[slug].ts` tenía la base `(default)` fija y ahora usa la
  de la app, y valida el slug antes de pedir nada.

**Resultado:** lo que se publica se mantiene al día sin pensar en eso, y
publicar sirve para algo: seguir a alguien, guardarse su lista, elegir qué
ver juntos. El servidor sigue sin leer bibliotecas: todo son instantáneas
curadas que decide cada persona. **Hay que publicar las reglas de Firestore**
(`public_lists` es nueva).

---

## QM-8 — Puertas de entrada

*Que se pueda llegar con lo que ya se vio en otro lado, y que cada nombre lleve a algún lado.*

**Qué estaba mal**

Quien venía de Letterboxd, IMDb o Trakt arrancaba de cero: el único import
era el JSON propio. Y el reparto de la ficha era una fila de caras que no
llevaba a ningún lado; para ver qué más hizo alguien había que esperar a que
Explorar armara su fila, sin saber qué de eso ya habías visto.

**Cómo quedó implementado**

- **Importar desde otras apps.** Un parser por fuente en `lib/importers/`
  (el CSV de IMDb, el ZIP de Letterboxd —se descomprime en el navegador con
  `fflate`—, los JSON de Trakt) que devuelve registros intermedios con
  título, año, fechas, puntaje, estado e ids. IMDb se resuelve exacto por su
  `tt…`; Letterboxd, por búsqueda con año, y cuenta como dudoso lo que tiene
  más de un resultado posible; Trakt trae el id de TMDB y se pide la ficha
  para que entre completo. Los puntajes de 1 a 10 pasan a 0,5–5, y el diario
  de Letterboxd deja una entrada del historial por cada vez vista.
- **`/api/tmdb/find`**, con lista blanca: `imdb` (validado como `tt…`) o
  `type` + `query` + `year`; reenvía solo lo que usa la revisión y pasa por
  `withCache`. Montado también en `server.ts`.
- **Revisión antes de guardar**: cuántos entraron, los dudosos con sus
  opciones y los que no aparecieron con un buscador para corregirlos a mano.
  Las búsquedas van de a seis, con barra de avance y cancelar.
- **Página de persona.** `/persona/:id`, con enlace real desde el reparto de
  la ficha, las filas de Explorar que hablan de alguien y lo elegido en
  "Contanos de vos". `/api/tmdb/person-page` trae datos y `combined_credits`
  en una llamada; `lib/person.ts` arma la filmografía sin repetidos, la marca
  según la biblioteca y calcula "Viste 7 de 23" y las mejor puntuadas que te
  faltan.

**Decisiones y hallazgos**

- *Los fixtures no son exports reales.* El pedido era confirmar las columnas
  contra exports de verdad; desde acá no había ninguno a mano (ni red a esas
  apps, ni una cuenta con datos). Están reconstruidos del formato documentado
  de cada uno y lo dice `__fixtures__/README.md`. **Falta pasarle un export
  real de cada app** —anonimizado— y volver a correr los tests.
- *`mergeLibraries` solo no alcanzaba.* Decide por `updatedAt`, y lo
  importado siempre es "más nuevo" porque se arma en el momento: usado tal
  cual, un export ajeno pisaría las reseñas de acá. Antes pasa por
  `mergeIntoLibrary`, que suma historial y episodios sin pisar lo que había
  (y respeta *En pausa* y *Abandonada*, salvo que el export diga que la
  terminaste); lo que no cambia nada no se escribe.
- *Una vez vista sin puntaje pierde su fecha.* Cada entrada del historial
  lleva puntaje, y anotar una sin inventarlo no se puede: esos títulos entran
  en *Completadas*, pero sin la fecha. Resolverlo es un cambio de schema
  (puntaje opcional en el historial) que queda para otra tanda.
- *Una serie de Trakt se da por terminada solo con la ficha.* Si la viste
  entera y no le falta nada por salir, es completada con su puntaje; si no,
  queda en *Viendo* con sus episodios, y el puntaje de la serie no entra como
  vista.
- *La biblioteca se indexa por id, sin el tipo.* Una serie con el mismo
  número que una película que ya tenés no puede entrar sin pisarla: se
  saltea. Es una limitación de antes, que ahora se nota.
- *"Bien puntuada" tiene piso.* Además del mínimo de 300 votos que pedía el
  pedido, un 7 de TMDB: sin él, a quien hizo pocas cosas buenas se le
  recomendaría lo mejor de lo flojo. Lo que ya está en tu biblioteca —*Por
  Ver* incluido— no aparece en "Te faltan": ya lo tenés anotado.
- *Afuera lo que no es obra.* Talk shows, noticieros, reality y las veces que
  alguien aparece haciendo de sí mismo son, en alguien famoso, cientos de
  créditos que taparían los de verdad: los saca el servidor. De dirección
  quedan lo dirigido y lo creado.
- *Un endpoint nuevo y no ampliar `/api/tmdb/person`.* Ese devuelve títulos
  con la forma de las filas de Explorar; la página necesita la persona y su
  filmografía entera, y mezclarlas eran dos respuestas en una.
- *El idioma, igual que el resto.* Los nombres no se traducen, pero los
  títulos de la filmografía y la biografía sí; si en latino no hay
  biografía, se completa con la de España.
- *De paso:* el buscador se cierra al cambiar de página y la ficha al irse a
  una persona, para no quedar encima de la página nueva.
- *Quince funciones no entran en el plan Hobby.* Vercel admite 12 por deploy
  y cada archivo de `api/` es una; con los endpoints de estas tandas eran
  quince y el deploy se rechazaba entero (desde las listas compartibles, que
  hicieron la número trece). Todo `/api/tmdb/*` pasó a ser una sola función,
  `api/tmdb/[endpoint].ts`, que despacha a los handlers de siempre, ahora en
  `api/_tmdb/`; las URLs no cambiaron. Un test cuenta las funciones y falla
  si se pasa del tope.

**Resultado:** se puede llegar con años de historial de otra app y revisarlo
antes de que toque la biblioteca, y cada nombre del reparto es una puerta
a todo lo que esa persona hizo, marcado con lo que ya viste. No hay
colecciones ni reglas de Firestore nuevas en esta tanda.

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
QM4 Series vivas   refresco, fichas de episodio, al día, continuar, calendario
QM5 Historial fino fecha por episodio, en pausa y abandonada, puntajes, metas
QM6 Plataformas    suscripciones, llegó a tu plataforma, avisos push, calendario .ics
QM7 Compartir      perfil que se actualiza solo, seguir perfiles, listas, ver juntos
QM8 Puertas        importar de Letterboxd, IMDb y Trakt, página de persona
```
