/**
 * Catálogo central de permisos y roles del sistema.
 *
 * Es código puro (sin dependencias de servidor) para que lo puedan usar:
 *  - el seed (crear permisos/roles en BD),
 *  - el servidor (autorización real),
 *  - la UI (mostrar/ocultar navegación; nunca como única barrera).
 *
 * Convención de alcance ("scope") en permisos de lectura:
 *   *.read.all      → todo
 *   *.read.process  → solo registros de los procesos del usuario
 *   *.read.own      → solo registros propios (p.ej. inspecciones que realizó)
 *   *.read.assigned → solo registros asignados al usuario (responsable)
 */

export const PERMISSIONS = {
  // Administración
  "users.read": { module: "Administración", description: "Consultar usuarios" },
  "users.manage": { module: "Administración", description: "Crear, editar y desactivar usuarios" },
  "roles.manage": { module: "Administración", description: "Gestionar roles y permisos" },
  "processes.manage": { module: "Administración", description: "Gestionar procesos" },
  "sites.manage": { module: "Administración", description: "Gestionar sedes y zonas" },
  "settings.manage": { module: "Administración", description: "Configurar parámetros del sistema" },
  "audit.read": { module: "Administración", description: "Consultar auditoría" },

  // Configuración de inspecciones
  "element_types.manage": {
    module: "Configuración",
    description: "Gestionar tipos de elementos, plantillas y preguntas",
  },

  // Inventario
  "elements.read.all": { module: "Inventario", description: "Consultar todos los elementos" },
  "elements.read.process": { module: "Inventario", description: "Consultar elementos de sus procesos" },
  "elements.manage": { module: "Inventario", description: "Crear y editar elementos" },

  // Inspecciones
  "inspections.read.all": { module: "Inspecciones", description: "Consultar todas las inspecciones" },
  "inspections.read.process": { module: "Inspecciones", description: "Consultar inspecciones de sus procesos" },
  "inspections.read.own": { module: "Inspecciones", description: "Consultar inspecciones propias" },
  "inspections.perform": { module: "Inspecciones", description: "Realizar inspecciones" },

  // Hallazgos
  "findings.read.all": { module: "Hallazgos", description: "Consultar todos los hallazgos" },
  "findings.read.process": { module: "Hallazgos", description: "Consultar hallazgos de sus procesos" },
  "findings.read.assigned": { module: "Hallazgos", description: "Consultar hallazgos asignados o creados" },
  "findings.create": { module: "Hallazgos", description: "Registrar hallazgos" },
  "findings.manage": { module: "Hallazgos", description: "Editar, priorizar y asignar hallazgos" },
  "findings.verify": { module: "Hallazgos", description: "Verificar hallazgos" },
  "findings.close": { module: "Hallazgos", description: "Cerrar hallazgos" },

  // Planes de acción
  "actions.read.all": { module: "Planes de acción", description: "Consultar todos los planes" },
  "actions.read.process": { module: "Planes de acción", description: "Consultar planes de sus procesos" },
  "actions.read.assigned": { module: "Planes de acción", description: "Consultar planes asignados" },
  "actions.manage": { module: "Planes de acción", description: "Crear y reasignar planes de acción" },
  "actions.update": { module: "Planes de acción", description: "Actualizar avance de planes asignados" },
  "actions.verify": { module: "Planes de acción", description: "Verificar planes de acción" },
  "actions.close": { module: "Planes de acción", description: "Cerrar planes de acción" },

  // Evidencias
  "evidences.upload": { module: "Evidencias", description: "Cargar fotografías y documentos" },

  // Indicadores
  "dashboard.view": { module: "Indicadores", description: "Consultar dashboard" },
  "reports.view": { module: "Indicadores", description: "Consultar reportes" },
  "reports.export": { module: "Indicadores", description: "Exportar reportes (PDF / Excel)" },
} as const satisfies Record<string, { module: string; description: string }>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

export const SYSTEM_ROLES = {
  ADMIN: {
    name: "Administrador",
    description: "Acceso total al sistema",
    permissions: ALL_PERMISSIONS,
  },
  INSPECTOR: {
    name: "Brigadista",
    description: "Realiza inspecciones por zonas y registra hallazgos",
    permissions: [
      "elements.read.all",
      "inspections.read.own",
      "inspections.perform",
      "findings.read.assigned",
      "findings.create",
      "evidences.upload",
    ],
  },
  PROCESS_OWNER: {
    name: "Responsable de proceso",
    description: "Gestiona elementos, hallazgos y planes de sus procesos",
    permissions: [
      "elements.read.process",
      "inspections.read.process",
      "findings.read.process",
      "findings.manage",
      "findings.verify",
      "actions.read.process",
      "actions.manage",
      "actions.update",
      "actions.verify",
      "evidences.upload",
      "dashboard.view",
      "reports.view",
    ],
  },
  ACTION_OWNER: {
    name: "Responsable de acción",
    description: "Ejecuta y reporta avance de planes de acción asignados",
    permissions: ["findings.read.assigned", "actions.read.assigned", "actions.update", "evidences.upload"],
  },
  VIEWER: {
    name: "Consulta / Gerencia",
    description: "Consulta indicadores, inspecciones, hallazgos y reportes",
    permissions: [
      "elements.read.all",
      "inspections.read.all",
      "findings.read.all",
      "actions.read.all",
      "dashboard.view",
      "reports.view",
      "reports.export",
    ],
  },
} as const satisfies Record<
  string,
  { name: string; description: string; permissions: readonly PermissionCode[] }
>;

export type SystemRoleCode = keyof typeof SYSTEM_ROLES;

/** El rol ADMIN siempre conserva todos los permisos (evita bloquear el sistema). */
export const LOCKED_ROLE_CODE: SystemRoleCode = "ADMIN";

export type ReadScope = "all" | "process" | "own" | "assigned";

type ScopedResource = "elements" | "inspections" | "findings" | "actions";

/**
 * Devuelve el alcance de lectura más amplio que tiene el usuario sobre un
 * recurso, o null si no puede leerlo. Los servicios traducen el alcance a
 * filtros de consulta (WHERE), por lo que la restricción se aplica en BD.
 */
export function readScope(permissions: ReadonlySet<string>, resource: ScopedResource): ReadScope | null {
  const order: ReadScope[] = ["all", "process", "own", "assigned"];
  for (const scope of order) {
    if (permissions.has(`${resource}.read.${scope}`)) return scope;
  }
  return null;
}

export function groupPermissionsByModule() {
  const groups = new Map<string, { code: PermissionCode; description: string }[]>();
  for (const code of ALL_PERMISSIONS) {
    const { module, description } = PERMISSIONS[code];
    const list = groups.get(module) ?? [];
    list.push({ code, description });
    groups.set(module, list);
  }
  return Array.from(groups, ([module, permissions]) => ({ module, permissions }));
}
