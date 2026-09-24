import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  FileText,
  FileUp,
  ListTodo,
  QrCode,
  TriangleAlert,
  Building2,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionCode } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible si el usuario tiene al menos uno de estos permisos (vacío = todos). */
  anyOf?: PermissionCode[];
  /** Aparece en la barra inferior del móvil. */
  mobile?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Navegación principal. Ocultar un enlace es solo cosmético: cada página y
 * cada acción verifican permisos en el servidor.
 */
export const NAVIGATION: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, mobile: true },
      { href: "/indicators", label: "Indicadores", icon: BarChart3, anyOf: ["dashboard.view"], mobile: true },
      {
        href: "/inspections",
        label: "Inspecciones",
        icon: ClipboardCheck,
        anyOf: ["inspections.perform", "inspections.read.all", "inspections.read.process", "inspections.read.own"],
        mobile: true,
      },
      {
        href: "/scan",
        label: "Escanear",
        icon: QrCode,
        anyOf: ["inspections.perform"],
        mobile: true,
      },
      {
        href: "/findings",
        label: "Hallazgos",
        icon: TriangleAlert,
        anyOf: ["findings.read.all", "findings.read.process", "findings.read.assigned"],
        mobile: true,
      },
      {
        href: "/action-plans",
        label: "Planes",
        icon: ListTodo,
        anyOf: ["actions.read.all", "actions.read.process", "actions.read.assigned"],
        mobile: true,
      },
      {
        href: "/reports",
        label: "Reportes",
        icon: FileText,
        anyOf: ["reports.view", "reports.export"],
      },
      {
        href: "/inventory",
        label: "Inventario",
        icon: Boxes,
        anyOf: ["elements.read.all", "elements.read.process"],
        mobile: true,
      },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/admin/element-types", label: "Tipos y preguntas", icon: ListChecks, anyOf: ["element_types.manage"] },
      { href: "/admin/import", label: "Carga masiva", icon: FileUp, anyOf: ["elements.manage"] },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/admin/users", label: "Usuarios", icon: Users, anyOf: ["users.read", "users.manage"] },
      { href: "/admin/roles", label: "Roles y permisos", icon: KeyRound, anyOf: ["roles.manage"] },
      { href: "/admin/processes", label: "Procesos", icon: Network, anyOf: ["processes.manage"] },
      { href: "/admin/sites", label: "Sedes y zonas", icon: Building2, anyOf: ["sites.manage"] },
    ],
  },
];

export function visibleNavigation(permissions: readonly string[]): NavSection[] {
  const set = new Set(permissions);
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.anyOf || item.anyOf.some((p) => set.has(p))),
  })).filter((section) => section.items.length > 0);
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
