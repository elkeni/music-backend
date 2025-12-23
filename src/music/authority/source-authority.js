/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚖️ SOURCE AUTHORITY - FASE 3: EVALUACIÓN DE AUTORIDAD DE FUENTE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Evalúa qué tan confiable es una fuente para una canción específica.
 * 
 * REGLAS DE AUTORIDAD:
 * 
 * 🎧 DEEZER (máxima autoridad):
 *   - score base: 95
 *   - +5 si tiene album Y releaseDate
 *   - Nunca bajar de 90
 * 
 * ▶️ YOUTUBE:
 *   - score base: 70
 *   - +10 si canal contiene "- topic" o "official"
 *   - +5 si metadata indica ISRC
 *   - -20 si detectado como NO OFICIAL
 *   - -15 si canal contiene fan/cover/karaoke/tribute
 *   - Score mínimo: 30
 * 
 * ⚠️ NO usar: views, likes, subscribers, heurísticas sociales
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { evaluateNonOfficial, detectNonOfficialChannel } from './detect-non-official.js';

/**
 * @typedef {Object} SourceAuthority
 * @property {string} songId - ID de la canción
 * @property {number} score - Score de autoridad (0-100)
 * @property {'high' | 'medium' | 'low'} level - Nivel de autoridad
 * @property {string[]} reasons - Razones que explican el score
 */

/**
 * Evalúa la autoridad de una canción de Deezer
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {SourceAuthority}
 */
function evaluateDeezerAuthority(song) {
    const reasons = [];
    let score = 95; // Base alta para Deezer

    reasons.push('Fuente: Deezer (base: 95)');

    // Bonus por metadatos completos
    if (song.album && song.releaseDate) {
        score += 5;
        reasons.push('+5: album y releaseDate presentes');
    } else if (song.album) {
        score += 2;
        reasons.push('+2: album presente');
    } else if (song.releaseDate) {
        score += 2;
        reasons.push('+2: releaseDate presente');
    }

    // Deezer nunca baja de 90
    score = Math.max(score, 90);

    // Cap en 100
    score = Math.min(score, 100);

    return {
        songId: song.id,
        score,
        level: 'high',
        reasons
    };
}

/**
 * Evalúa la autoridad de una canción de YouTube
 * 
 * @param {import('../song-model.js').Song} song
 * @returns {SourceAuthority}
 */
function evaluateYouTubeAuthority(song) {
    const reasons = [];
    let score = 70; // Base para YouTube

    reasons.push('Fuente: YouTube (base: 70)');

    const channelTitle = (song.metadata?.channelTitle || '').toLowerCase();

    // ═══════════════════════════════════════════════════════════════════════════
    // BONUS: Canales oficiales
    // ═══════════════════════════════════════════════════════════════════════════

    // YouTube Topic channels (generados automáticamente, alta autoridad)
    if (channelTitle.includes('- topic') || channelTitle.endsWith(' - topic')) {
        score += 10;
        reasons.push('+10: canal "- Topic" (auto-generated)');
    }
    // Canales oficiales
    else if (channelTitle.includes('official') || channelTitle.includes('vevo')) {
        score += 10;
        reasons.push('+10: canal oficial/VEVO');
    }

    // ISRC presente (indica catálogo oficial)
    if (song.metadata?.isrc) {
        score += 5;
        reasons.push('+5: ISRC presente');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PENALIZACIONES: Contenido no oficial
    // ═══════════════════════════════════════════════════════════════════════════

    // Detectar si es contenido no oficial
    const nonOfficialResult = evaluateNonOfficial(song);
    if (nonOfficialResult.isNonOfficial) {
        score -= 20;
        reasons.push(`-20: contenido no oficial (${nonOfficialResult.reason})`);
    }

    // Canal de fans/covers
    const channelResult = detectNonOfficialChannel(channelTitle);
    if (channelResult.isNonOfficial && !nonOfficialResult.isNonOfficial) {
        // Solo penalizar si no fue ya penalizado por título
        score -= 15;
        reasons.push(`-15: canal no oficial (${channelResult.reason})`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LÍMITES
    // ═══════════════════════════════════════════════════════════════════════════

    // Score mínimo 30
    score = Math.max(score, 30);

    // Cap en 100
    score = Math.min(score, 100);

    // Determinar nivel
    let level;
    if (score >= 80) {
        level = 'high';
    } else if (score >= 60) {
        level = 'medium';
    } else {
        level = 'low';
    }

    return {
        songId: song.id,
        score,
        level,
        reasons
    };
}

/**
 * Evalúa la autoridad de fuente de una canción
 * 
 * @param {import('../song-model.js').Song} song - Canción a evaluar
 * @returns {SourceAuthority}
 */
export function evaluateSourceAuthority(song) {
    if (!song) {
        return {
            songId: 'unknown',
            score: 0,
            level: 'low',
            reasons: ['Error: canción inválida']
        };
    }

    switch (song.source) {
        case 'deezer':
            return evaluateDeezerAuthority(song);

        case 'youtube':
            return evaluateYouTubeAuthority(song);

        case 'saavn':
            // Futuro: implementar autoridad de Saavn
            return {
                songId: song.id,
                score: 60,
                level: 'medium',
                reasons: ['Fuente: Saavn (score base: 60)']
            };

        default:
            return {
                songId: song.id,
                score: 50,
                level: 'low',
                reasons: [`Fuente desconocida: ${song.source}`]
            };
    }
}

/**
 * Compara autoridad de dos canciones
 * 
 * @param {SourceAuthority} a
 * @param {SourceAuthority} b
 * @returns {number} - Positivo si a > b, negativo si a < b, 0 si iguales
 */
export function compareAuthority(a, b) {
    return a.score - b.score;
}
