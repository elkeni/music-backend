# Informe técnico integral del backend musical

> Análisis estático del repositorio `music-backend` realizado el 21 de agosto de 2026. Este documento describe el estado actual del código; no presupone que los servicios externos estén disponibles. Los valores secretos de `.env` no se reproducen.

## 1. Resumen ejecutivo

El proyecto es un backend Node.js ESM pensado principalmente para funciones serverless de Vercel. Contiene dos circuitos funcionales diferentes:

1. **Catálogo propio y buscador indexado**: ingesta canciones de YouTube/Deezer, normaliza identidad, calcula autoridad y canonicalidad, persiste en PostgreSQL, recupera candidatos con Meilisearch, rankea y cachea con Redis/memoria. Su entrada HTTP es `GET /api/search`.
2. **Búsqueda y reproducción inmediata**: consulta una API Saavn externa y `youtube-sr`, evalúa candidatos, obtiene enlaces de audio de la API Saavn, selecciona bitrate y precalienta una caché. Sus entradas son `/api/youtube-search`, `/api/youtube-streams`, `/api/prefetch` y `/api/instant-play`.

También existen un proxy de Deezer y una operación administrativa para reconstruir el índice. No hay autenticación de usuarios, sesiones, playlists, favoritos, historial, uploads ni pagos: el alcance presente es búsqueda, selección/canonicalización y resolución de streams externos.

## 2. Vista de arquitectura

```mermaid
flowchart LR
    App[App cliente] --> S1[GET /api/search]
    S1 --> SS[search-service]
    SS --> RC[(Redis)]
    SS --> MC[(Caché en memoria)]
    SS --> MI[(Meilisearch)]
    MI --> PG[(PostgreSQL)]
    SS --> RK[Ranking + intención + autoridad]

    App --> YS[GET /api/youtube-search]
    YS --> SA[API Saavn externa]
    YS --> YT[youtube-sr / YouTube]
    YS --> EX[Extractor y evaluador]
    YS -. prefetch .-> PF[Caché de prefetch en memoria]

    App --> ST[GET /api/youtube-streams]
    ST --> PF
    ST --> SC[Caché de streams en memoria]
    ST --> SA

    App --> IP[GET /api/instant-play]
    IP --> SA
    IP --> YT

    Admin[Cliente administrador] --> RI[/api/admin/rebuild-index]
    RI --> PG
    RI --> MI
```

La API externa definida por `SOURCE_API_URL` (por defecto `https://appmusic-phi.vercel.app`) se usa como proveedor Saavn para búsquedas (`/api/search/songs`) y detalles/descargas (`/api/songs/:id`). El backend no transmite bytes de audio: devuelve URLs de descarga proporcionadas por esa API.

## 3. Stack, ejecución y despliegue

- Runtime: Node.js `>=18`, módulos ES (`"type": "module"`).
- Hosting previsto: Vercel Functions; `vercel.json` configura CORS global y `NODE_OPTIONS=--no-deprecation`.
- Dependencias de producción: `pg`, `redis`, `meilisearch`, `youtube-sr` y `dotenv`.
- Scripts disponibles: `npm run dev` y `npm start`, ambos ejecutan `vercel dev`.
- El paquete no declara scripts estándar `test`, migración, lint, build o type-check.
- `local-server.js` sólo monta `/api/instant-play` en un servidor HTTP local sobre el puerto 3000; no representa todo el backend.

### Variables de entorno

| Variable | Función | Fallback |
|---|---|---|
| `DATABASE_URL` | Conexión PostgreSQL | Configuración `PG*` local |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Conexión PostgreSQL desglosada | localhost:5432, usuario/clave `postgres`, DB `music_search` |
| `MEILI_URL` | Host de Meilisearch | `http://localhost:7700` en el cliente, pero la búsqueda escalable sólo se activa si la variable existe |
| `MEILI_MASTER_KEY` | Clave de Meilisearch | Sin clave |
| `REDIS_URL` | Caché Redis | `redis://localhost:6379` |
| `ADMIN_TOKEN` | Protege `/api/admin/rebuild-index` | Ninguno; sin valor, el endpoint responde error de configuración |
| `SOURCE_API_URL` | Proveedor Saavn externo | `https://appmusic-phi.vercel.app` |
| `VERCEL_URL` | URL de esta instancia para llamadas internas | Construcción automática o localhost |
| `VERCEL_ENV`, `NODE_ENV` | Diagnóstico/errores | development implícito |

El archivo `.env` actual contiene las cinco primeras variables principales. Sus valores deben mantenerse fuera de documentación, logs y control de versiones.

## 4. Inventario de endpoints

### `GET /api/search`

Buscador del catálogo propio. Parámetros:

- `q` obligatorio, mínimo 2 caracteres.
- `limit`: 20 por defecto, limitado internamente a 1–50.
- `offset`: 0 por defecto.
- `grouped`: `true` por defecto; agrupa versiones por `identityKey`.
- `debug`: `false` por defecto; añade desglose y evita la caché.

Pipeline: validar → cargar conectores → consultar caché Redis/memoria → construir intención → recuperar hasta 200 IDs en Meilisearch → cargar canciones desde PostgreSQL → ranking → agrupación/paginación → cachear 30 segundos. Si Meilisearch no está disponible, recorre el `song-store` en memoria.

En modo agrupado devuelve `totalGroups`, `totalSongs` y grupos con `canonical`/`alternatives`; en modo plano devuelve `totalResults` y canciones con `score`/`rank`.

### `GET /api/youtube-search`

Parámetros: `q` o `query`; opcionalmente `limit`, `track`/`title`, `artist`, `album`, `duration`.

Lanza en paralelo una búsqueda Saavn y una búsqueda mediante `youtube-sr`; `Promise.any` conserva la primera fuente que devuelva resultados, no fusiona ambas listas. Cada candidato pasa por `evaluateCandidate`, se ordena por confianza y se devuelve con título, artista, álbum, duración, año, `videoId`, miniatura, scores, versión y feats. El mejor resultado con confianza `>= 0.7` dispara un prefetch asíncrono. La respuesta se marca cacheable en CDN por una hora.

Observación importante: el campo `source` de la respuesta se fija en `youtube` incluso cuando el ganador fue Saavn.

### `GET /api/youtube-streams`

Parámetros: `videoId` obligatorio y `confidence` opcional (0.7 por defecto). Respeta `Save-Data: on`.

Consulta `${SOURCE_API_URL}/api/songs/:videoId`, extrae `downloadUrl`, exige al menos 96 kbps y aplica una política de calidad basada en confianza. En ahorro de datos prefiere 96–128 kbps. Devuelve `audioStreams` y `qualityInfo`; utiliza caché de prefetch y caché de streams en memoria. Timeout externo: 3 segundos. CDN: una hora.

Aunque el nombre dice YouTube, el proveedor de streams sólo entiende IDs Saavn según los propios comentarios del código.

### `GET /api/prefetch`

Recibe `title`, `artist` y `duration`. Reutiliza `executeSearch`, requiere una confianza mínima y precarga streams en el `Map` exportado por `youtube-streams.js`. La respuesta confirma el calentamiento, pero no devuelve los streams. La función `internalPrefetch()` permite calentamiento fire-and-forget desde el buscador.

### `GET /api/instant-play`

Recibe `artist` y `track`/`title`. Busca primero en Saavn (timeout 2.5 s), cae a `youtube-sr`, evalúa candidatos y solicita el detalle Saavn (timeout 2 s). Elige el stream válido de menor bitrate desde 96 kbps y devuelve `audioUrl`, calidad y metadatos. Si el fallback selecciona un ID real de YouTube, la posterior llamada al endpoint Saavn normalmente no puede resolverlo.

### `GET /api/deezer-proxy`

Recibe `endpoint` y lo concatena a `https://api.deezer.com`. Funciona como proxy público de lectura, con timeout de 5 segundos y sin lista permitida de rutas. Devuelve la carga de Deezer sin transformar.

### `/api/admin/rebuild-index`

Todas las variantes exigen el header `x-admin-token` igual a `ADMIN_TOKEN`.

- `GET`: estadísticas de PostgreSQL y Meilisearch.
- `GET ?mode=debug-search&q=...`: búsqueda directa en Meilisearch, incluidos todos los atributos.
- `POST`: lee lotes de PostgreSQL, recupera o reconstruye identidades, indexa en Meilisearch y limpia la caché local. Body: `batchSize` (máximo 500), `offset`, `limit`, `resetIndex`.

La paginación es responsabilidad del cliente administrativo mediante `nextOffset`.

## 5. Modelo y persistencia

### Objeto `Song`

Campos requeridos: `id`, `title`, `artistNames[]`, `duration`, `versionType`, `source`, `sourceId`, `metadata`. Opcionales: `groupName`, `album`, `releaseDate`, `versionDetails`.

- Versiones: `original`, `remix`, `remaster`, `radio_edit`, `extended`, `album_version`, `live`.
- Fuentes: `youtube`, `deezer`, `saavn`.
- `song-loader.js` transforma cargas YouTube y Deezer al modelo común, y puede cargarlas individualmente o por lotes.

### PostgreSQL

La migración `001_initial_schema.sql` crea:

| Tabla | Responsabilidad | Relación clave |
|---|---|---|
| `songs` | Datos originales y metadata JSONB | PK `id` |
| `song_identity` | Título/artista normalizados, bucket de duración, `identity_key` | 1:1 con `songs`, cascade delete |
| `song_authority` | Score, nivel, razones y marca no oficial | 1:1 con `songs`, cascade delete |
| `canonical_selections` | Canción canónica y alternativas por identidad | referencia `songs` |

Hay índices para fuente, versión, identidad, duración, autoridad y canonicalidad; triggers mantienen `updated_at`. `song-repository.js` implementa upserts, lecturas individuales/por IDs/paginadas, borrado y persistencia conjunta. Las escrituras intentan invalidar las cachés de búsqueda.

### Estado en memoria

Existen cuatro stores por proceso:

- `song-store`: catálogo validado.
- `identity-store`: identidad calculada por canción.
- `authority-store`: autoridad, no-oficialidad, grupos y selecciones canónicas.
- cachés de búsqueda, streams y prefetch.

`rebuild-from-db.js` rehidrata estos stores desde PostgreSQL. En serverless, cada instancia puede tener contenido y vida útil diferentes.

## 6. Normalización, identidad y canonicalización

1. `normalize-text.js` pasa a minúsculas, elimina diacríticos/puntuación, colapsa espacios y normaliza artistas.
2. `clean-title.js` quita adornos, indicadores de calidad, paréntesis/contextos y ruido frecuente.
3. `build-identity.js` genera título limpio/normalizado, artistas normalizados, bucket de duración e `identityKey` estable. También elimina contexto geográfico para reducir falsos negativos.
4. `detect-non-official.js` identifica contenido no oficial por título, metadata y canal.
5. `source-authority.js` puntúa autoridad por fuente: Deezer usa señales editoriales; YouTube usa canal, metadata y penalizaciones no oficiales.
6. `canonical-groups.js` reúne canciones con la misma identidad.
7. `select-canonical.js` elige representante por autoridad y reglas deterministas; `authority-store.js` conserva la selección y alternativas.

El extractor de YouTube es la pieza heurística más grande (906 líneas). Detecta versiones prohibidas/permitidas, basura, artista principal, colaboradores, similitud título-artista y contexto musical (duración/álbum); produce una confianza final y una razón de rechazo explicable.

## 7. Ranking del catálogo propio

```text
score final = matching(título, artista)
            + ajuste por intención (live, remix, instrumental, cover...)
            + ajuste de autoridad
```

- Matching aporta 0–80.
- La intención puede premiar o penalizar hasta aproximadamente 20 por señal.
- Autoridad sólo se aplica si matching `>= 20`, para no rescatar resultados irrelevantes.
- Fórmula de autoridad: `((authority.score - 50) / 50) * 15`, rango -15 a +15.
- El resultado se limita a un mínimo de 0.
- Desempates: canónica primero, oficial antes que no oficial, fuente Deezer → Saavn → YouTube, finalmente ID lexicográfico.

La intención se obtiene de tokens de la consulta y patrones como live, remix, instrumental o cover. El modo `debug` expone el breakdown completo.

## 8. Meilisearch y cachés

### Meilisearch

El índice se llama `songs`. `indexer.js` convierte canción + identidad en documentos buscables; `candidate-retriever.js` pide IDs y puede añadir filtros por intención. Meilisearch sólo genera candidatos: el orden definitivo sigue siendo responsabilidad del ranking propio.

Hay dos rebuilds:

- `src/music/bootstrap/rebuild-index.js`: utilidad CLI para reconstrucción total y verificación.
- `/api/admin/rebuild-index`: rebuild serverless paginado y protegido.

### Caché

- Búsqueda local: TTL 30 s, máximo 500 entradas, estadísticas hit/miss.
- Redis: serializa JSON, TTL predeterminado 30 s y prefijo de búsqueda; fallback tolerante a fallos.
- Streams y prefetch: `Map` por proceso con TTL propio; además se usan headers CDN.

Las cachés en memoria no son compartidas entre instancias de Vercel. Redis sí puede ser compartido, pero sólo cubre el buscador del catálogo, no streams/prefetch.

## 9. Mapa de módulos

| Área | Archivos principales | Responsabilidad |
|---|---|---|
| HTTP | `api/*.js` | Contratos públicos, CORS, timeouts y orquestación |
| Modelo | `song-model.js`, `song-loader.js`, `song-store.js` | Modelo común, transformación e inventario en memoria |
| Extracción | `extraction/youtube-extractor.js` | Validar candidatos musicales externos |
| Normalización | `normalization/*` | Texto y títulos comparables |
| Identidad | `identity/*` | Identidad estable y agrupación lógica |
| Autoridad | `authority/*` | Oficialidad, score y selección canónica |
| Ranking | `ranking/*` | Intención, matching, autoridad y orden final |
| Persistencia | `persistence/*` | PostgreSQL y esquema SQL |
| Índice | `search-index/*` | Meilisearch, documentos y candidatos |
| Caché | `cache/*` | Redis y memoria |
| Servicio | `api/search-service.js`, `api/suggestions.js` | Buscador público y sugerencias experimentales |
| Bootstrap | `bootstrap/*` | Rehidratar stores y reconstruir índice |
| Fachada | `src/music/index.js` | Reexporta la API interna de todos los subsistemas |

## 10. Pruebas y documentación existentes

- `phase2-tests.js`: normalización e identidad.
- `phase3-tests.js`: autoridad, contenido no oficial y canonicalidad.
- `phase4-tests.js`: intención y ranking.
- `phase5-tests.js`: API, agrupación, paginación y caché.
- `phase6-tests.js`: PostgreSQL, Redis, Meilisearch y compatibilidad del output; omite pruebas cuando la infraestructura no está disponible.
- Pruebas raíz: extractor peruano/latino, búsquedas reales y flujo search → streams/save-data.
- `SEARCH_API.md`: contrato del buscador propio.
- `PHASE6_SETUP.md`: preparación de infraestructura.
- `DEPRECATION_FIX.md`: contexto de compatibilidad/deprecaciones.

Limitaciones: no hay test runner integrado en `package.json`, cobertura, CI, mocks consistentes de proveedores ni pruebas HTTP automáticas de todos los endpoints.

## 11. Conexiones y flujos completos

### A. Preparar catálogo propio

```text
YouTube/Deezer payload
 → song-loader → Song
 → song-store / PostgreSQL
 → buildSongIdentity → song_identity
 → evaluateSourceAuthority + evaluateNonOfficial → song_authority
 → canonical groups/selections
 → indexer → Meilisearch
```

### B. Buscar en catálogo propio

```text
GET /api/search
 → cache
 → SearchContext
 → Meilisearch devuelve IDs
 → PostgreSQL devuelve Songs
 → identity/authority stores alimentan ranking
 → agrupación + paginación
 → Redis/memoria → respuesta
```

### C. Buscar y preparar reproducción

```text
GET /api/youtube-search
 → carrera Saavn vs youtube-sr
 → extractor filtra y puntúa
 → top result
 → internalPrefetch
 → SOURCE_API /api/songs/:id
 → caché prefetch
```

### D. Resolver audio

```text
GET /api/youtube-streams?videoId=...&confidence=...
 → caché prefetch → caché streams → SOURCE_API
 → filtrar >=96 kbps
 → política por confianza/Save-Data
 → devolver URLs de audio
```

## 12. Hallazgos y riesgos prioritarios

### Críticos/altos

1. **Posible ruptura entre DB y ranking**. `search-service` carga canciones por ID desde PostgreSQL, pero `rankResults` toma identidad y autoridad exclusivamente de los stores en memoria. El servicio no llama a `rebuildStoresFromDB` ni rehidrata esos datos al cargar candidatos. Si una instancia serverless inicia con stores vacíos, `computeMatchingScore` puede recibir identidad indefinida o el ranking pierde autoridad/canonicalidad. Debe verificarse en producción y unificarse la lectura de canción + identidad + autoridad.
2. **IDs de fuentes incompatibles**. El flujo puede seleccionar YouTube, pero los streams se consultan en un endpoint Saavn. El propio buscador interno elimina temporalmente IDs de 11 caracteres para evitarlo; `youtube-search` e `instant-play` no garantizan esa compatibilidad.
3. **Dos motores parcialmente desconectados**. `/api/search` usa catálogo/Meilisearch; el reproductor usa Saavn/YouTube directamente. Un resultado del catálogo no necesariamente es reproducible y un resultado reproducible no necesariamente existe en el catálogo.

### Medios

4. **Caché serverless local no confiable entre solicitudes**. Prefetch y stream cache sólo benefician solicitudes que caen en la misma instancia caliente. No deben tratarse como garantía funcional.
5. **CORS inconsistente**. `vercel.json` combina `Access-Control-Allow-Credentials: true` con origen `*`, combinación inválida para solicitudes con credenciales. Cada endpoint además escribe sus propios headers, con listas diferentes.
6. **Validación y rate limiting insuficientes**. Los endpoints públicos no tienen límites por IP/token. Algunos `limit` y strings se convierten sin tope estricto fuera de `/api/search`, lo que permite carga excesiva y consumo de proveedores.
7. **Fuente mal etiquetada**. `/api/youtube-search` responde `source: youtube` para candidatos Saavn; afecta observabilidad y decisiones del cliente.
8. **Errores externos expuestos**. Varios endpoints devuelven `err.message`; pueden revelar detalles operativos. Conviene usar códigos públicos estables y logs internos.
9. **Proxy Deezer demasiado abierto**. Aunque el host es fijo, cualquier ruta de Deezer queda expuesta a consumo desde este dominio. Una allowlist, límites y caché reducirían abuso/coste.
10. **URLs de audio efímeras**. El backend cachea enlaces externos, no el contenido; pueden caducar antes que el TTL/CDN y no se valida su vigencia.

### Mantenibilidad

11. README casi vacío y documentación de Fase 5 parcialmente desactualizada respecto de Fase 6.
12. Comentarios/nombres dicen “YouTube” donde la reproducción real es Saavn; esto dificulta razonar sobre IDs.
13. No hay capa central de configuración, cliente HTTP, errores, CORS, logging estructurado ni métricas.
14. No existe un comando único para migrar, sembrar, reconstruir, probar y verificar salud.
15. La invalidación de `clearSearchCache()` en el endpoint admin sólo limpia memoria local; no garantiza borrar Redis ni las demás instancias.

## 13. Recomendaciones por orden

1. Crear un `CatalogCandidate` o repositorio que devuelva en una sola operación `song + identity + authority + canonical`, y hacer que el ranking no dependa de stores vacíos.
2. Definir un identificador tipado `{ source, sourceId }` y un resolver de streams por fuente. Nunca enviar un ID YouTube a Saavn.
3. Elegir una arquitectura explícita: integrar el catálogo propio con reproducción, o documentar ambos motores como productos separados y traducir entre ellos.
4. Mover prefetch/stream cache a Redis sólo si el prefetch debe ser fiable; en caso contrario tratarlo como optimización oportunista.
5. Centralizar CORS, validación, límites, timeouts, errores y logs. Añadir rate limiting a búsquedas, streams y proxy.
6. Corregir `source`, limitar `limit` en todos los endpoints y validar longitud/formato de IDs, queries, endpoints y confidence.
7. Añadir scripts `test`, `test:integration`, `migrate`, `reindex`, `lint` y una verificación CI.
8. Añadir health checks separados para DB, Redis, Meilisearch y proveedor Saavn, sin filtrar secretos.
9. Actualizar README con instalación, arquitectura, comandos, contratos y una tabla de compatibilidad de fuentes.

## 14. Punto de entrada recomendado para futuras tareas

- Cambios en búsqueda del catálogo: comenzar en `api/search.js` → `src/music/api/search-service.js` → `ranking/*`.
- Cambios en matching externo: `api/youtube-search.js` → `extraction/youtube-extractor.js`.
- Cambios en reproducción/calidad: `api/youtube-streams.js` y `api/prefetch.js`.
- Cambios de datos: `song-model.js`, `song-loader.js`, `song-repository.js` y migraciones.
- Problemas de resultados duplicados/oficialidad: `identity/*` y `authority/*`.
- Problemas de rendimiento: `candidate-retriever.js`, Meilisearch, Redis y lifecycle serverless.

Este archivo puede mantenerse como contexto vivo del backend; conviene actualizar las secciones de endpoints, esquema y riesgos cada vez que cambie el contrato público o la estrategia de fuentes.

## 15. Actualización: matching de búsqueda y reproducción

El evaluador externo fue refactorizado para evitar que un porcentaje agregado esconda un campo incorrecto:

- La similitud combina Levenshtein normalizado y métricas difusas de tokens.
- Artista y título tienen umbrales independientes y ambos deben aprobar cuando fueron solicitados.
- El score combinado pondera título 58% y artista 42%, pero sólo ordena candidatos; no puede saltarse los gates.
- Los umbrales se adaptan a la longitud: los nombres cortos son más estrictos para reducir colisiones.
- Se limpian simétricamente ruido editorial, canales `Topic`/`VEVO`, años, formatos latinos y etiquetas de versión.
- Remix, remaster y live se comprueban por separado antes del matching base.
- Se bloquean mixes multi-track y diferencias extremas de duración cuando existe duración objetivo.
- Los rechazos ahora distinguen `same_artist_different_track`, `artist_mismatch`, `version_mismatch`, `duration_mismatch` y contenido prohibido.

La regresión se ejecuta con `npm run test:matching` y cubre tanto falsos negativos conocidos como falsos positivos de alto riesgo.
