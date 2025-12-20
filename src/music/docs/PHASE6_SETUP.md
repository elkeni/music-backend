# 🏗️ FASE 6: Setup Local

Guía de configuración de PostgreSQL, Redis y Meilisearch para desarrollo local.

## Requisitos

- Node.js >= 18
- Docker (recomendado) o instalaciones locales

## 1. PostgreSQL

### Con Docker

```bash
docker run -d \
  --name music-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=music_search \
  -p 5432:5432 \
  postgres:15
```

### Crear base de datos

```bash
# Conectar a PostgreSQL
docker exec -it music-postgres psql -U postgres

# Crear base de datos (si no existe)
CREATE DATABASE music_search;
\q
```

### Ejecutar migración

```bash
docker exec -i music-postgres psql -U postgres -d music_search < src/music/persistence/migrations/001_initial_schema.sql
```

### Variables de entorno

```bash
# Desarrollo
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=postgres
export PGDATABASE=music_search

# O usar DATABASE_URL (producción)
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/music_search
```

---

## 2. Redis

### Con Docker

```bash
docker run -d \
  --name music-redis \
  -p 6379:6379 \
  redis:7
```

### Variables de entorno

```bash
export REDIS_URL=redis://localhost:6379
```

---

## 3. Meilisearch

### Con Docker

```bash
docker run -d \
  --name music-meili \
  -e MEILI_ENV=development \
  -p 7700:7700 \
  -v /tmp/meili:/meili_data \
  getmeili/meilisearch:v1.6
```

### Variables de entorno

```bash
export MEILI_URL=http://localhost:7700
# MEILI_MASTER_KEY solo si está configurado en Meili
```

---

## 4. Verificar Conexiones

```bash
# PostgreSQL
docker exec -it music-postgres psql -U postgres -d music_search -c "SELECT 1"

# Redis
docker exec -it music-redis redis-cli ping
# Debe devolver PONG

# Meilisearch
curl http://localhost:7700/health
# Debe devolver {"status":"available"}
```

---

## 5. Scripts de Bootstrap

### Reconstruir stores desde DB

```bash
node src/music/bootstrap/rebuild-from-db.js
```

### Reindexar en Meilisearch

```bash
node src/music/bootstrap/rebuild-index.js
```

---

## 6. Ejecutar Tests FASE 6

```bash
node src/music/tests/phase6-tests.js
```

Los tests saltarán automáticamente si los servicios no están disponibles.

---

## 7. Uso Programático

```javascript
import * as music from './src/music/index.js';

// Inicializar conexiones
await music.initDB();
await music.initMeili();
await music.initRedis();

// Buscar (usa Meilisearch + Redis automáticamente)
const results = await music.searchSongs('Bohemian Rhapsody');
console.log(results);

// Persistir una canción
const song = music.createSong({ ... });
await music.upsertSong(song);

// Rebuild (si es necesario)
await music.rebuildMeiliIndex();

// Cerrar conexiones
await music.closeDB();
music.closeMeili();
await music.closeRedis();
```

---

## 8. Docker Compose (Opcional)

Para levantar todo de una vez:

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: music_search
    ports:
      - "5432:5432"
    volumes:
      - ./src/music/persistence/migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  meilisearch:
    image: getmeili/meilisearch:v1.6
    environment:
      MEILI_ENV: development
    ports:
      - "7700:7700"
```

```bash
docker-compose up -d
```

---

## 9. Fallback Mode

El sistema funciona **sin** PostgreSQL, Redis o Meilisearch:

- Sin PostgreSQL: usa `song-store` en memoria
- Sin Redis: usa cache in-memory
- Sin Meilisearch: usa `getAllSongs()` (O(N) scan)

El output es **idéntico**, solo cambia el performance.

---

## 10. Producción / Vercel

En entornos serverless como Vercel, los scripts de bootstrap (`node ...`) no se ejecutan automáticamente. Se debe usar el endpoint de administración.

### Variables de entorno (Vercel)
Asegúrate de configurar:
- `DATABASE_URL`: URL de conexión a PostgreSQL (ej: Supabase)
- `MEILI_URL`: URL de Meilisearch
- `MEILI_MASTER_KEY`: Key maestra de Meilisearch
- `ADMIN_TOKEN`: Token secreto para proteger endpoints administrativos (generar uno largo y seguro)

### Reindexación Manual (Admin API)

El endpoint `/api/admin/rebuild-index` permite poblar el índice de Meilisearch desde PostgreSQL sin downtime.

#### 1. Verificar estado
```bash
curl "https://tu-app.vercel.app/api/admin/rebuild-index?mode=stats" \
  -H "x-admin-token: TU_TOKEN_SECRETO"
```
Respuesta esperada: `{"meilisearch": {"stats": {"numberOfDocuments": 0, ...}}}` si está vacío, o el número real de documentos.

#### 2. Poblar índice (Batch)
Ejecutar esto localmente o en un script para enviar lotes de canciones.
```bash
# Ejemplo: Resetear e indexar primeras 500 canciones
curl -X POST "https://tu-app.vercel.app/api/admin/rebuild-index" \
  -H "x-admin-token: TU_TOKEN_SECRETO" \
  -H "Content-Type: application/json" \
  -d '{"resetIndex": true, "batchSize": 500, "offset": 0}'

# Siguientes batches (incrementar offset)
curl -X POST "https://tu-app.vercel.app/api/admin/rebuild-index" \
  -H "x-admin-token: TU_TOKEN_SECRETO" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 500, "offset": 500}'
```

#### 3. Verificar búsqueda
Una vez indexado, `/api/search` debería devolver candidatos y el debug info mostrará `candidateCount > 0`.
