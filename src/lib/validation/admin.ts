import { z } from "zod";
import { zCheckbox, zCode, zEmail, zId, zOptionalText, zRequiredText } from "@/lib/validation/form";
import { passwordSchema } from "@/lib/validation/password";
import { isPermissionCode } from "@/lib/permissions";

// ---------------------------------------------------------------- Usuarios
const userBase = {
  name: zRequiredText("El nombre", 120),
  email: zEmail,
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\s-]*$/, "Teléfono inválido")
    .optional(),
  jobTitle: zOptionalText(120),
  roleIds: z.array(zId).min(1, "Asigna al menos un rol"),
  processIds: z.array(zId).default([]),
  active: zCheckbox,
};

export const userCreateSchema = z.object({
  ...userBase,
  // Opcional: si se omite, se envía un correo de invitación para definirla.
  password: passwordSchema.optional(),
});

export const userUpdateSchema = z.object({ id: zId, ...userBase });

export const USER_FORM_ARRAYS = ["roleIds", "processIds"] as const;

// ------------------------------------------------------------------- Roles
export const roleSchema = z.object({
  id: zId.optional(),
  code: zCode(),
  name: zRequiredText("El nombre", 80),
  description: zOptionalText(300),
  active: zCheckbox,
  permissions: z.array(z.string().refine(isPermissionCode, "Permiso desconocido")),
});

export const ROLE_FORM_ARRAYS = ["permissions"] as const;

// --------------------------------------------------------------- Procesos
export const processSchema = z.object({
  id: zId.optional(),
  code: zCode(),
  name: zRequiredText("El nombre", 120),
  description: zOptionalText(500),
  active: zCheckbox,
});

// ------------------------------------------------------------ Sedes / áreas
export const siteSchema = z.object({
  id: zId.optional(),
  code: zCode(),
  name: zRequiredText("El nombre", 120),
  address: zOptionalText(200),
  city: zOptionalText(80),
  active: zCheckbox,
});

export const areaSchema = z.object({
  id: zId.optional(),
  siteId: zId,
  code: zCode(),
  name: zRequiredText("El nombre", 120),
  description: zOptionalText(300),
  active: zCheckbox,
});

// ------------------------------------------------------------ Listados
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  status: z.enum(["active", "inactive", "all"]).catch("all").default("all"),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const PAGE_SIZE = 20;
