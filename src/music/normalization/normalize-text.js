/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔤 NORMALIZE TEXT - FASE 2: NORMALIZACIÓN DE TEXTO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Función pura y determinística para normalizar texto.
 * 
 * REGLAS OBLIGATORIAS:
 * 1. Convertir a minúsculas
 * 2. Eliminar acentos (á → a, ñ → n, etc.)
 * 3. Eliminar leetspeak (0→o, 1→i, 3→e, 4→a, 5→s, 7→t)
 * 4. Reemplazar & y / por espacio
 * 5. Eliminar puntuación y símbolos (NO letras ni números)
 * 6. Colapsar múltiples espacios en uno
 * 7. trim()
 * 
 * PROHIBIDO:
 * - eliminar palabras
 * - traducir
 * - usar stemming
 * - usar NLP
 * - inferir semántica
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Mapa de leetspeak a caracteres normales
 */
const LEET_MAP = {
    // Eliminamos números para evitar romper nombres como "Grupo 5", "Maroon 5", "Blink 182"
    // '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't'
};

/**
 * Normaliza texto de forma pura y determinística
 * 
 * @param {string} input - Texto a normalizar
 * @returns {string} Texto normalizado
 */
export function normalizeText(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    let result = input;

    // 0. Normalizar apóstrofes y comillas especiales (Unicode → ASCII)
    result = result.replace(/['']/g, "'").replace(/[""]/g, '"');

    // 1. Convertir a minúsculas
    result = result.toLowerCase();

    // 2. Eliminar acentos (normalización Unicode NFD + eliminar diacríticos)
    result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 3. Eliminar leetspeak
    result = result.split('').map(char => LEET_MAP[char] || char).join('');

    // 4. Reemplazar & y / por espacio
    result = result.replace(/[&\/]/g, ' ');

    // 5. Eliminar puntuación y símbolos (mantener solo letras, números y espacios)
    result = result.replace(/[^a-z0-9\s]/g, ' ');

    // 6. Colapsar múltiples espacios en uno
    result = result.replace(/\s+/g, ' ');

    // 7. trim()
    result = result.trim();

    return result;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎤 NORMALIZE ARTIST - Normalización especial para nombres de artistas
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Los artistas NO se normalizan igual que los títulos.
 * 
 * PRESERVAR:
 * - Puntos (.) → "Fred again.." NO es igual a "Fred again"
 * - Números → "CA7RIEL" debe mantenerse
 * - Guiones bajos en algunos casos
 * 
 * ELIMINAR:
 * - Acentos
 * - Símbolos especiales (excepto .)
 * - & se convierte en espacio (para colaboraciones)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Normaliza nombre de artista preservando identidad
 * 
 * @param {string} input - Nombre del artista
 * @returns {string} Nombre normalizado preservando puntos
 */
export function normalizeArtist(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    let result = input;

    // 1. Convertir a minúsculas
    result = result.toLowerCase();

    // 2. Eliminar acentos
    result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 3. NO eliminar leetspeak para artistas (CA7RIEL debe ser ca7riel)

    // 4. PRESERVAR signos especiales solicitados (@, &, $)
    // El usuario quiere encontrar "nombres raros" con estos signos.

    // 5. Eliminar símbolos EXCEPTO puntos (.), guiones (-), @, &
    // Fred again.. → fred again..
    // CA7RIEL → ca7riel
    // Joey Bada$$ → joey bada$$ (si permitimos $) -> Vamos a permitir $ también
    result = result.replace(/[^a-z0-9.\-\@\&\$\!\s]/g, ' ');

    // 6. Colapsar múltiples espacios
    result = result.replace(/\s+/g, ' ');

    // 7. trim
    result = result.trim();

    return result;
}
