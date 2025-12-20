/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🗄️ DATABASE CONNECTION - FASE 6: CONEXIÓN A POSTGRESQL
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Configuración de conexión a PostgreSQL usando pg.
 * Soporta modo local y producción.
 * 
 * Variables de entorno requeridas:
 * - DATABASE_URL (para producción)
 * - o PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT (para desarrollo)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import pg from 'pg';
const { Pool } = pg;

/**
 * @typedef {Object} DBConfig
 * @property {string} [connectionString]
 * @property {string} [host]
 * @property {number} [port]
 * @property {string} [user]
 * @property {string} [password]
 * @property {string} [database]
 * @property {boolean} [ssl]
 * @property {number} [max]
 * @property {number} [idleTimeoutMillis]
 */

/**
 * Configuración por defecto
 */
const DEFAULT_CONFIG = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
};

/**
 * Pool de conexiones
 * @type {pg.Pool | null}
 */
let pool = null;

/**
 * Flag para saber si DB está habilitada
 */
let dbEnabled = false;

/**
 * Error de inicialización
 * @type {Error | null}
 */
let initError = null;

/**
 * Obtiene la configuración de la base de datos
 * 
 * @returns {DBConfig}
 */
function getConfig() {
    // Producción: usar DATABASE_URL
    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            // Supabase y la mayoría de DBs en la nube requieren SSL
            ssl: { rejectUnauthorized: false },
            ...DEFAULT_CONFIG
        };
    }

    // Desarrollo: usar variables individuales
    return {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'music_search',
        ssl: false,
        ...DEFAULT_CONFIG
    };
}

/**
 * Obtiene el error de inicialización si hubo
 */
export function getInitError() {
    return initError;
}

/**
 * Inicializa el pool de conexiones
 * 
 * @returns {Promise<boolean>} - True si se conectó exitosamente
 */
export async function initDB() {
    if (pool) {
        return true;
    }

    try {
        const config = getConfig();
        pool = new Pool(config);

        // Test de conexión
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        dbEnabled = true;
        initError = null;
        console.log('[db] PostgreSQL conectado exitosamente');
        return true;
    } catch (error) {
        console.warn('[db] PostgreSQL no disponible, usando modo in-memory:', error.message);
        pool = null;
        dbEnabled = false;
        initError = error;
        return false;
    }
}

/**
 * Ejecuta una query con parámetros
 * 
 * @param {string} text - Query SQL
 * @param {any[]} [params] - Parámetros
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
    if (!pool) {
        throw new Error('Database not initialized. Call initDB() first.');
    }

    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;

        if (duration > 100) {
            console.warn(`[db] Slow query (${duration}ms):`, text.substring(0, 100));
        }

        return result;
    } catch (error) {
        console.error('[db] Query error:', error.message);
        console.error('[db] Query:', text.substring(0, 200));
        throw error;
    }
}

/**
 * Obtiene un cliente del pool para transacciones
 * 
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
    if (!pool) {
        throw new Error('Database not initialized. Call initDB() first.');
    }
    return pool.connect();
}

/**
 * Cierra el pool de conexiones
 */
export async function closeDB() {
    if (pool) {
        await pool.end();
        pool = null;
        dbEnabled = false;
        console.log('[db] PostgreSQL desconectado');
    }
}

/**
 * Verifica si la DB está habilitada
 * 
 * @returns {boolean}
 */
export function isDBEnabled() {
    return dbEnabled;
}

/**
 * Obtiene el pool (para testing)
 * 
 * @returns {pg.Pool | null}
 */
export function getPool() {
    return pool;
}
