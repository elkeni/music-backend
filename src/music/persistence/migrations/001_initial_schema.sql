-- ═══════════════════════════════════════════════════════════════════════════════
-- 🗃️ FASE 6: MIGRACIÓN INICIAL - ESQUEMA DE BASE DE DATOS
-- ═══════════════════════════════════════════════════════════════════════════════
-- 
-- Ejecutar con: psql -d music_search -f 001_initial_schema.sql
-- 
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: songs
-- Almacena todos los datos de las canciones (FASE 1)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS songs (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    artist_names JSONB NOT NULL DEFAULT '[]',
    album VARCHAR(500),
    release_date DATE,
    duration INTEGER NOT NULL,
    version_type VARCHAR(50) NOT NULL DEFAULT 'original',
    version_details VARCHAR(255),
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(255) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para songs
CREATE INDEX IF NOT EXISTS idx_songs_source_sourceid ON songs(source, source_id);
CREATE INDEX IF NOT EXISTS idx_songs_source ON songs(source);
CREATE INDEX IF NOT EXISTS idx_songs_version_type ON songs(version_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: song_identity
-- Almacena la identidad normalizada de cada canción (FASE 2)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS song_identity (
    song_id VARCHAR(255) PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    identity_key VARCHAR(500) NOT NULL,
    title_clean VARCHAR(500) NOT NULL,
    title_normalized VARCHAR(500) NOT NULL,
    title_identity VARCHAR(500),
    artist_normalized JSONB NOT NULL DEFAULT '[]',
    duration_bucket INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para song_identity
CREATE INDEX IF NOT EXISTS idx_song_identity_key ON song_identity(identity_key);
CREATE INDEX IF NOT EXISTS idx_song_identity_duration_bucket ON song_identity(duration_bucket);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: song_authority
-- Almacena la autoridad y estado no-oficial de cada canción (FASE 3)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS song_authority (
    song_id VARCHAR(255) PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 50,
    level VARCHAR(20) NOT NULL DEFAULT 'medium',
    reasons JSONB NOT NULL DEFAULT '[]',
    is_non_official BOOLEAN NOT NULL DEFAULT FALSE,
    non_official_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para song_authority
CREATE INDEX IF NOT EXISTS idx_song_authority_score ON song_authority(score DESC);
CREATE INDEX IF NOT EXISTS idx_song_authority_is_non_official ON song_authority(is_non_official);
CREATE INDEX IF NOT EXISTS idx_song_authority_level ON song_authority(level);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA: canonical_selections
-- Almacena las selecciones canónicas por identityKey (FASE 3)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canonical_selections (
    identity_key VARCHAR(500) PRIMARY KEY,
    canonical_song_id VARCHAR(255) NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    canonical_authority_score INTEGER NOT NULL,
    alternatives JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para canonical_selections
CREATE INDEX IF NOT EXISTS idx_canonical_selections_song_id ON canonical_selections(canonical_song_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCIÓN: Trigger para actualizar updated_at automáticamente
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para cada tabla
DROP TRIGGER IF EXISTS update_songs_updated_at ON songs;
CREATE TRIGGER update_songs_updated_at
    BEFORE UPDATE ON songs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_song_identity_updated_at ON song_identity;
CREATE TRIGGER update_song_identity_updated_at
    BEFORE UPDATE ON song_identity
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_song_authority_updated_at ON song_authority;
CREATE TRIGGER update_song_authority_updated_at
    BEFORE UPDATE ON song_authority
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_canonical_selections_updated_at ON canonical_selections;
CREATE TRIGGER update_canonical_selections_updated_at
    BEFORE UPDATE ON canonical_selections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMENTARIOS DE DOCUMENTACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE songs IS 'FASE 1: Tabla principal de canciones';
COMMENT ON TABLE song_identity IS 'FASE 2: Identidad normalizada y canonicalización';
COMMENT ON TABLE song_authority IS 'FASE 3: Score de autoridad y estado no-oficial';
COMMENT ON TABLE canonical_selections IS 'FASE 3: Selección canónica por identityKey';
