-- =============================================================================
-- Borra los DATOS DE OPERACIÓN y conserva USUARIOS, roles, permisos, sedes,
-- procesos (con sus usuarios asignados) y la auditoría.
--
-- Se borran: inventario (elementos), zonas, tipos de elemento con sus
-- preguntas, inspecciones, respuestas, hallazgos, planes de acción, evidencias
-- (registros) y notificaciones. La numeración (#000001) vuelve a empezar.
--
-- Uso (en el servidor, desde la carpeta del proyecto; NO se puede deshacer):
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U inspecciones -d inspecciones -v ON_ERROR_STOP=1 < scripts/reset-datos.sql
-- Las fotos se borran aparte (ver docs/DESPLIEGUE.md, "Borrar solo los datos").
-- =============================================================================
BEGIN;

TRUNCATE TABLE
  notification_deliveries,
  notifications,
  evidences,
  action_plan_events,
  action_plans,
  findings,
  inspection_answers,
  inspections,
  elements,
  zones,
  inspection_questions,
  inspection_templates,
  element_types
RESTART IDENTITY CASCADE;

INSERT INTO audit_logs ("action", "entityType", "after")
VALUES ('system.reset_data', 'System', '{"kept": ["users", "roles", "sites", "processes", "audit_logs"]}');

COMMIT;

SELECT 'usuarios' AS dato, count(*) FROM users
UNION ALL SELECT 'sedes', count(*) FROM sites
UNION ALL SELECT 'procesos', count(*) FROM processes
UNION ALL SELECT 'elementos', count(*) FROM elements
UNION ALL SELECT 'inspecciones', count(*) FROM inspections
UNION ALL SELECT 'hallazgos', count(*) FROM findings;
