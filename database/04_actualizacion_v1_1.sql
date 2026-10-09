-- =====================================================================
-- DIGITAL PLATFORM · SCRIPT 04 · Actualización v1.0 → v1.1 (OPCIONAL)
-- ---------------------------------------------------------------------
-- Para bases creadas con la versión 1.0. Conectado a "digital_platform" con postgres.
-- NO hace falta ejecutarlo: al iniciar, la API v1.1 aplica estos mismos cambios
-- sola y los registra en platform.schema_migrations. Es para revisión del DBA
-- o para aplicar el cambio antes de publicar la nueva versión.
-- Es repetible y NO borra datos.
--
-- Cambios:
--   1. Tabla de control de migraciones (platform.schema_migrations).
--   2. Línea base en las etapas (planned_start / planned_end), copiada del plan actual.
--   3. Tabla de dependencias entre etapas (platform.portfolio_stage_deps).
--   4. Encadena las etapas de los proyectos existentes (cada una depende de la anterior).
--   5. Menús nuevos: Cronograma y Riesgos.
-- =====================================================================

BEGIN;

-- 1. Control de migraciones
CREATE TABLE IF NOT EXISTS platform.schema_migrations (
    module_code VARCHAR(60) NOT NULL, 
    migration_id VARCHAR(80) NOT NULL, 
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    PRIMARY KEY (module_code, migration_id)
);

-- 3. Dependencias entre etapas (se crea antes porque la migración 002 la usa)
CREATE TABLE IF NOT EXISTS platform.portfolio_stage_deps (
    id SERIAL NOT NULL, 
    project_id INTEGER NOT NULL, 
    stage_id INTEGER NOT NULL, 
    depends_on_id INTEGER NOT NULL, 
    dep_type VARCHAR(2) NOT NULL, 
    lag_days INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_portfolio_stage_dep UNIQUE (stage_id, depends_on_id), 
    FOREIGN KEY(project_id) REFERENCES platform.portfolio_projects (id) ON DELETE CASCADE, 
    FOREIGN KEY(stage_id) REFERENCES platform.portfolio_stages (id) ON DELETE CASCADE, 
    FOREIGN KEY(depends_on_id) REFERENCES platform.portfolio_stages (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_platform_portfolio_stage_deps_project_id ON platform.portfolio_stage_deps (project_id);
CREATE INDEX IF NOT EXISTS ix_platform_portfolio_stage_deps_stage_id ON platform.portfolio_stage_deps (stage_id);

-- 2 y 4. Migraciones del módulo Portfolio
ALTER TABLE platform.portfolio_stages ADD COLUMN IF NOT EXISTS planned_start DATE;
ALTER TABLE platform.portfolio_stages ADD COLUMN IF NOT EXISTS planned_end DATE;
UPDATE platform.portfolio_stages SET planned_start = start_date WHERE planned_start IS NULL;
UPDATE platform.portfolio_stages SET planned_end = end_date WHERE planned_end IS NULL;
INSERT INTO platform.portfolio_stage_deps (project_id, stage_id, depends_on_id, dep_type, lag_days)
           SELECT a.project_id, b.id, a.id, 'FS', 0
           FROM platform.portfolio_stages a
           JOIN platform.portfolio_stages b ON b.project_id = a.project_id AND b.position = a.position + 1
           WHERE NOT EXISTS (SELECT 1 FROM platform.portfolio_stage_deps d WHERE d.project_id = a.project_id);

INSERT INTO platform.schema_migrations (module_code, migration_id) VALUES
    ('portfolio', '001_linea_base_etapas'),
    ('portfolio', '002_encadenar_etapas_existentes')
ON CONFLICT DO NOTHING;

-- 5. Menús nuevos
INSERT INTO platform.menu_items (code, module_code, label, path, icon, group_name, permission_code, sort_order, is_active) VALUES
    ('portfolio.cronograma', 'portfolio', 'Cronograma', '/portfolio/cronograma', '▥', 'Portfolio', 'portfolio.ver', 15, true),
    ('portfolio.riesgos', 'portfolio', 'Riesgos', '/portfolio/riesgos', '⚠', 'Portfolio', 'portfolio.ver', 17, true)
ON CONFLICT (code) DO NOTHING;

UPDATE platform.modules SET version = '1.1.0' WHERE code = 'portfolio';

COMMIT;

-- Verificación: columnas nuevas y dependencias creadas
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'platform' AND table_name = 'portfolio_stages'
        AND column_name IN ('planned_start', 'planned_end'))  AS columnas_linea_base,  -- esperado 2
    (SELECT count(*) FROM platform.portfolio_stage_deps)      AS dependencias,
    (SELECT count(*) FROM platform.schema_migrations)         AS migraciones;           -- esperado 2
