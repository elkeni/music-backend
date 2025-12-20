/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 👑 SELECT CANONICAL - FASE 3: SELECCIÓN DE CANCIÓN CANÓNICA
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Selecciona la canción canónica (más autorizada) de un grupo.
 * 
 * REGLAS:
 * - Elegir la de MAYOR authority score
 * - Empate → Deezer > YouTube > otros
 * - Covers NO pueden ser canónicos si hay alternativa oficial
 * - NO eliminar alternatives, solo ordenar determinísticamente
 * 
 * REPARACIÓN:
 * - Autoridad se recibe pre-calculada (no recalcular)
 * - authorityMap es fuente única de scores
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} CanonicalSelection
 * @property {import('../song-model.js').Song} canonicalSong - Canción seleccionada como canónica
 * @property {import('../song-model.js').Song[]} alternatives - Alternativas (frozen, ordenadas por id)
 * @property {import('./source-authority.js').SourceAuthority} canonicalAuthority - Autoridad de la seleccionada
 */

/**
 * @typedef {Object} SongWithAuthority
 * @property {import('../song-model.js').Song} song
 * @property {import('./source-authority.js').SourceAuthority} authority
 * @property {boolean} isNonOfficial
 */

/**
 * Orden de prioridad de fuentes (para desempate)
 */
const SOURCE_PRIORITY = {
    'deezer': 1,
    'saavn': 2,
    'youtube': 3
};

/**
 * Selecciona la canción canónica de un grupo usando autoridad pre-calculada
 * 
 * REPARACIÓN: No recalcula autoridad, la recibe del authorityMap
 * 
 * @param {import('./canonical-groups.js').CanonicalGroup} group - Grupo canónico
 * @param {Map<string, import('./source-authority.js').SourceAuthority>} authorityMap - Autoridades pre-calculadas
 * @param {Map<string, import('./detect-non-official.js').NonOfficialResult>} nonOfficialMap - Estados no oficial pre-calculados
 * @returns {CanonicalSelection}
 */
export function selectCanonicalSong(group, authorityMap, nonOfficialMap) {
    if (!group || !group.songs || group.songs.length === 0) {
        throw new Error('selectCanonicalSong requiere un grupo con canciones');
    }

    if (!authorityMap) {
        throw new Error('selectCanonicalSong requiere authorityMap pre-calculado');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Obtener autoridad y estado no oficial de cada canción
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {SongWithAuthority[]} */
    const songsWithData = group.songs.map(song => {
        const authority = authorityMap.get(song.id);
        const nonOfficialStatus = nonOfficialMap?.get(song.id);

        if (!authority) {
            console.warn(`[select-canonical] Canción sin autoridad: ${song.id}`);
        }

        return {
            song,
            authority: authority || { songId: song.id, score: 0, level: 'low', reasons: ['Sin autoridad calculada'] },
            isNonOfficial: nonOfficialStatus?.isNonOfficial || false
        };
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Separar oficiales de no oficiales
    // ═══════════════════════════════════════════════════════════════════════════

    const officialSongs = songsWithData.filter(s => !s.isNonOfficial);
    const nonOfficialSongs = songsWithData.filter(s => s.isNonOfficial);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: Determinar pool de candidatos para canónico
    // REGLA: Si hay oficiales, el canónico DEBE ser oficial
    // ═══════════════════════════════════════════════════════════════════════════

    let candidatePool;

    if (officialSongs.length > 0) {
        // Hay oficiales → canónico debe ser oficial
        candidatePool = officialSongs;
    } else {
        // Solo hay no oficiales → elegir el mejor de ellos
        candidatePool = nonOfficialSongs;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4: Ordenar candidatos por autoridad
    // ═══════════════════════════════════════════════════════════════════════════

    candidatePool.sort((a, b) => {
        // Primero por score (descendente)
        const scoreDiff = b.authority.score - a.authority.score;
        if (scoreDiff !== 0) {
            return scoreDiff;
        }

        // Desempate por prioridad de fuente
        const priorityA = SOURCE_PRIORITY[a.song.source] || 99;
        const priorityB = SOURCE_PRIORITY[b.song.source] || 99;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // Desempate final por ID (determinismo)
        return a.song.id.localeCompare(b.song.id);
    });

    // El primero es el canónico
    const canonical = candidatePool[0];

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 5: Construir lista de alternatives (todas excepto canónico)
    // ═══════════════════════════════════════════════════════════════════════════

    const alternatives = songsWithData
        .filter(item => item.song.id !== canonical.song.id)
        .map(item => item.song);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 6: Ordenar alternatives determinísticamente y congelar
    // ═══════════════════════════════════════════════════════════════════════════

    alternatives.sort((a, b) => a.id.localeCompare(b.id));
    Object.freeze(alternatives);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 7: Construir y congelar resultado
    // ═══════════════════════════════════════════════════════════════════════════

    /** @type {CanonicalSelection} */
    const selection = {
        canonicalSong: canonical.song,
        alternatives,
        canonicalAuthority: canonical.authority
    };

    return Object.freeze(selection);
}

/**
 * Procesa todos los grupos y selecciona canónicos
 * 
 * @param {Map<string, import('./canonical-groups.js').CanonicalGroup>} groups
 * @param {Map<string, import('./source-authority.js').SourceAuthority>} authorityMap
 * @param {Map<string, import('./detect-non-official.js').NonOfficialResult>} nonOfficialMap
 * @returns {Map<string, CanonicalSelection>}
 */
export function selectAllCanonicals(groups, authorityMap, nonOfficialMap) {
    console.log('[select-canonical] ══════════════════════════════════════════════');
    console.log('[select-canonical] SELECCIONANDO CANCIONES CANÓNICAS');
    console.log('[select-canonical] ══════════════════════════════════════════════');

    const selections = new Map();

    for (const [identityKey, group] of groups) {
        const selection = selectCanonicalSong(group, authorityMap, nonOfficialMap);
        selections.set(identityKey, selection);
    }

    // Estadísticas
    const totalGroups = selections.size;
    const deezerWins = Array.from(selections.values())
        .filter(s => s.canonicalSong.source === 'deezer').length;
    const youtubeWins = Array.from(selections.values())
        .filter(s => s.canonicalSong.source === 'youtube').length;
    const withAlternatives = Array.from(selections.values())
        .filter(s => s.alternatives.length > 0).length;

    console.log('[select-canonical] ══════════════════════════════════════════════');
    console.log('[select-canonical] SELECCIÓN COMPLETADA');
    console.log(`[select-canonical] Total grupos: ${totalGroups}`);
    console.log(`[select-canonical] Deezer ganó: ${deezerWins}`);
    console.log(`[select-canonical] YouTube ganó: ${youtubeWins}`);
    console.log(`[select-canonical] Con alternativas: ${withAlternatives}`);
    console.log('[select-canonical] ══════════════════════════════════════════════');

    return selections;
}
