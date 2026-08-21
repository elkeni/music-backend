/**
 * Métricas determinísticas para comparar metadatos musicales.
 *
 * Combina distancia de Levenshtein con similitud de tokens. Levenshtein
 * tolera errores tipográficos; los tokens evitan que una palabra compartida
 * haga pasar títulos distintos y permiten cambios razonables de orden.
 */

export function levenshteinDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');

    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let i = 1; i <= left.length; i++) {
        const current = [i];
        for (let j = 1; j <= right.length; j++) {
            const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + substitutionCost
            );
        }
        previous = current;
    }

    return previous[right.length];
}

export function normalizedLevenshtein(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    const longest = Math.max(left.length, right.length);
    if (longest === 0) return 1;
    return 1 - (levenshteinDistance(left, right) / longest);
}

function tokensOf(value) {
    return String(value || '').split(/\s+/).filter(Boolean);
}

function bestTokenSimilarity(token, candidates) {
    let best = 0;
    for (const candidate of candidates) {
        best = Math.max(best, normalizedLevenshtein(token, candidate));
    }
    return best;
}

/**
 * Cobertura difusa en ambas direcciones. Un typo dentro de una palabra sigue
 * contando, pero las palabras extra reducen precision.
 */
export function fuzzyTokenMetrics(a, b) {
    const left = tokensOf(a);
    const right = tokensOf(b);
    if (!left.length || !right.length) {
        return { precision: 0, recall: 0, f1: 0 };
    }

    const recall = right.reduce((sum, token) => sum + bestTokenSimilarity(token, left), 0) / right.length;
    const precision = left.reduce((sum, token) => sum + bestTokenSimilarity(token, right), 0) / left.length;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1 };
}

/**
 * Devuelve score 0..1 y métricas explicables.
 */
export function calculateStringSimilarity(candidate, target) {
    const left = String(candidate || '').trim();
    const right = String(target || '').trim();

    if (!left || !right) {
        return { score: 0, levenshtein: 0, tokenPrecision: 0, tokenRecall: 0, tokenF1: 0 };
    }

    if (left === right) {
        return { score: 1, levenshtein: 1, tokenPrecision: 1, tokenRecall: 1, tokenF1: 1 };
    }

    const levenshtein = normalizedLevenshtein(left, right);
    const tokenMetrics = fuzzyTokenMetrics(left, right);
    const leftTokens = tokensOf(left);
    const rightTokens = tokensOf(right);

    // En nombres de una sola palabra el orden/tokens no aportan suficiente
    // evidencia: la distancia de caracteres debe dominar para evitar que
    // "Hello" coincida con "Hello Goodbye".
    let score;
    if (leftTokens.length === 1 || rightTokens.length === 1) {
        const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
        score = (levenshtein * 0.8) + (lengthRatio * tokenMetrics.f1 * 0.2);
    } else {
        const sortedLeft = [...leftTokens].sort().join(' ');
        const sortedRight = [...rightTokens].sort().join(' ');
        const sortedSimilarity = normalizedLevenshtein(sortedLeft, sortedRight);

        const characterBlend = (levenshtein * 0.5) + (sortedSimilarity * 0.2) +
            (tokenMetrics.f1 * 0.2) + (tokenMetrics.recall * 0.1);
        const tokenBlend = (tokenMetrics.f1 * 0.55) + (sortedSimilarity * 0.3) +
            (tokenMetrics.recall * 0.15);

        score = Math.max(characterBlend, tokenBlend);
    }

    return {
        score: Math.max(0, Math.min(1, score)),
        levenshtein,
        tokenPrecision: tokenMetrics.precision,
        tokenRecall: tokenMetrics.recall,
        tokenF1: tokenMetrics.f1
    };
}

