/**
 * Etiquetas en español de los enums del modelo. Los tipos vienen del cliente
 * Prisma generado (solo tipos: este archivo se puede usar en el navegador).
 */
import type { BadgeTone } from "@/components/ui/badge";
import type {
  ElementStatus,
  InspectionResult,
  InspectionStatus,
  Priority,
  ResponseType,
  WorkflowStatus,
} from "@/generated/prisma/enums";

export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  YES_NO: "Sí / No",
  COMPLIES: "Cumple / No cumple",
  YES_NO_NA: "Sí / No / No aplica",
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Fecha",
  SELECT: "Selección",
  MULTI_SELECT: "Selección múltiple",
  PHOTO: "Fotografía",
};

export const RESPONSE_TYPES = Object.keys(RESPONSE_TYPE_LABELS) as ResponseType[];

export const ELEMENT_STATUS_LABELS: Record<ElementStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  MAINTENANCE: "En mantenimiento",
  RETIRED: "Retirado",
};

export const ELEMENT_STATUSES = Object.keys(ELEMENT_STATUS_LABELS) as ElementStatus[];

export const ELEMENT_STATUS_TONES: Record<ElementStatus, BadgeTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  MAINTENANCE: "warning",
  RETIRED: "neutral",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];

export const PRIORITY_TONES: Record<Priority, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  SOLVED: "Solucionado",
  VERIFIED: "Verificado",
  CLOSED: "Cerrado",
};

export const WORKFLOW_STATUS_TONES: Record<WorkflowStatus, BadgeTone> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  SOLVED: "primary",
  VERIFIED: "success",
  CLOSED: "neutral",
};

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  IN_PROGRESS: "En curso",
  COMPLETED: "Finalizada",
  CANCELLED: "Anulada",
};

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  COMPLIANT: "Cumple",
  NON_COMPLIANT: "No cumple",
};
