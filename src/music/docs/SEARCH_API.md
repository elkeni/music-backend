# 🔍 Search API - FASE 5

API de búsqueda musical pública, rápida y cacheada.

## Endpoint

```
GET /api/search
```

## Query Parameters

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `q` | string | **obligatorio** | Query de búsqueda (mínimo 2 caracteres) |
| `limit` | number | 20 | Máximo de resultados (max: 50) |
| `offset` | number | 0 | Offset para paginación |
| `grouped` | boolean | true | Agrupar resultados por canción |
| `debug` | boolean | false | Incluir información de debug |

---

## ⚠️ CONTRATO DE DATOS (CRÍTICO)

### Semántica de `totalResults`, `totalGroups` y `totalSongs`

| Campo | grouped=true | grouped=false |
|-------|--------------|---------------|
| `totalGroups` | ✅ Número de grupos canónicos | ❌ No aplica |
| `totalSongs` | ✅ Número de canciones individuales | ❌ No aplica |
| `totalResults` | ❌ No aplica | ✅ Número de canciones |
| `results.length` | Grupos en esta página | Canciones en esta página |

### Semántica de `limit` y `offset`

| Modo | `limit` aplica a | `offset` aplica a |
|------|------------------|-------------------|
| `grouped=true` | **GRUPOS** | **GRUPOS** |
| `grouped=false` | **CANCIONES** | **CANCIONES** |

> **Ejemplo grouped=true**: Con `offset=5, limit=10` obtienes los grupos 6-15, no las canciones 6-15.

---

## Respuesta (grouped=true)

```json
{
  "query": "Bohemian Rhapsody",
  "totalGroups": 3,
  "totalSongs": 8,
  "results": [
    {
      "identityKey": "bohemian rhapsody|queen|4",
      "canonical": {
        "song": {
          "id": "dz_123",
          "title": "Bohemian Rhapsody",
          "artistNames": ["Queen"],
          "source": "deezer"
        },
        "score": 95.5
      },
      "alternatives": [
        {
          "song": { "id": "yt_456", ... },
          "score": 82.3
        }
      ]
    }
  ],
  "meta": {
    "cached": false,
    "executionTimeMs": 45,
    "pagination": {
      "limit": 20,
      "offset": 0,
      "appliesTo": "groups"
    }
  }
}
```

## Respuesta (grouped=false)

```json
{
  "query": "Bohemian Rhapsody",
  "totalResults": 8,
  "results": [
    {
      "song": { ... },
      "score": 95.5,
      "rank": 1
    },
    {
      "song": { ... },
      "score": 82.3,
      "rank": 2
    }
  ],
  "meta": {
    "cached": true,
    "executionTimeMs": 2,
    "pagination": {
      "limit": 20,
      "offset": 0,
      "appliesTo": "songs"
    }
  }
}
```

---

## Modo Debug

Con `debug=true` se incluye información adicional:

```json
{
  "results": [
    {
      "song": { ... },
      "score": 95.5,
      "breakdown": {
        "matchingScore": 80,
        "intentAdjustment": 0,
        "authorityAdjustment": 15,
        "authorityApplied": true,
        "rawScore": 95,
        "finalScore": 95
      },
      "isCanonical": true,
      "isNonOfficial": false
    }
  ],
  "debug": {
    "intent": {
      "wantsLive": false,
      "wantsRemix": false,
      "wantsInstrumental": false,
      "wantsCover": false
    },
    "tokens": ["bohemian", "rhapsody"],
    "cacheStats": {
      "hits": 5,
      "misses": 2,
      "size": 3,
      "hitRate": "71.43%"
    }
  }
}
```

**⚠️ Nota:** Modo debug NO usa cache.

---

## Cache

| Configuración | Valor |
|---------------|-------|
| TTL | 30 segundos |
| Max entries | 500 |
| Key format | `normalize(query):JSON({limit,offset,grouped,debug})` |
| Debug mode | NO cachea |

### Cache Key

La cache key incluye TODAS las opciones, incluyendo `debug`:

```
"bohemian rhapsody:{"limit":20,"offset":0,"grouped":true,"debug":false}"
```

Esto garantiza que cada combinación de opciones tiene su propia entrada de cache.

---

## Errores

### Query muy corta

```json
{
  "error": "Query must be at least 2 characters",
  "query": "a"
}
```

### Método no permitido

```json
{
  "error": "Method not allowed",
  "allowed": ["GET"]
}
```

---

## Ejemplos

```bash
# Búsqueda simple (agrupada por defecto)
GET /api/search?q=Bohemian%20Rhapsody

# Con paginación de GRUPOS
GET /api/search?q=Queen&limit=10&offset=20

# Resultados planos (sin agrupar)
GET /api/search?q=Shape%20of%20You&grouped=false

# Modo debug
GET /api/search?q=Blinding%20Lights&debug=true

# Búsqueda con intención
GET /api/search?q=Bohemian%20Rhapsody%20live
```

---

## Performance

- Queries que toman más de 200ms generan warning en logs
- Cache reduce tiempo de respuesta en hits a ~2ms
- Límite máximo de 50 resultados por request

---

## Uso Programático

```javascript
import { searchSongs } from './src/music/index.js';

// Búsqueda agrupada
const result = searchSongs('Bohemian Rhapsody', {
  limit: 10,
  grouped: true
});

console.log(`${result.totalGroups} grupos`);
console.log(`${result.totalSongs} canciones totales`);
console.log(`Tiempo: ${result.meta.executionTimeMs}ms`);
console.log(`Cached: ${result.meta.cached}`);
console.log(`Paginación aplica a: ${result.meta.pagination.appliesTo}`);

// Búsqueda plana
const flat = searchSongs('Queen', {
  grouped: false,
  limit: 20
});

console.log(`${flat.totalResults} canciones`);
```

---

## ⚠️ EXPERIMENTAL: Suggestions

Las funciones de sugerencias están marcadas como **experimentales** y no deben usarse en producción hasta FASE 6:

```javascript
import { getSearchSuggestions, getArtistSuggestions } from './src/music/index.js';

// ⚠️ EXPERIMENTAL - No usar en producción
const titles = getSearchSuggestions('Bohem', 5);
const artists = getArtistSuggestions('Qu', 5);
```

Limitaciones actuales:
- Solo matchea por inicio de texto
- No usa cache
- No prioriza por popularidad
