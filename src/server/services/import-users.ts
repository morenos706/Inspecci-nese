import "server-only";
import type ExcelJS from "exceljs";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { cellText, findByCodeOrName } from "@/lib/import-parsing";
import { parseYesNo, splitOptions } from "@/lib/import-questions";
import { LOCKED_ROLE_CODE } from "@/lib/permissions";
import { zEmail } from "@/lib/validation/form";
import { generateToken } from "@/server/auth/tokens";
import { unusablePasswordHash } from "@/server/auth/password";
import { sendMail } from "@/server/mail/mailer";
import { welcomeEmail } from "@/emails/welcome";
import { env } from "@/lib/env";
import { createPasswordResetLink, INVITE_TOKEN_MINUTES } from "@/server/services/auth.service";
import type { CatalogRef } from "@/server/services/import-catalog";
import { isExampleRow, readSheet, type RowIssue, type SheetColumn } from "@/server/services/import-sheets";

/**
 * Hoja «Usuarios» de la carga masiva: crea o actualiza usuarios por correo.
 * Los nuevos reciben un correo de bienvenida para definir su contraseña.
 */
export const USER_COLUMNS = [
  { key: "nombre", header: "Nombre*", width: 28 },
  { key: "correo", header: "Correo*", width: 32 },
  { key: "roles", header: "Roles* (separados por /)", width: 34 },
  { key: "procesos", header: "Procesos (separados por /)", width: 34 },
  { key: "cargo", header: "Cargo", width: 24 },
  { key: "telefono", header: "Teléfono", width: 16 },
  { key: "activo", header: "Activo", width: 10 },
] as const satisfies readonly SheetColumn[];

export interface UserPlan {
  existingId: string | null;
  email: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  active: boolean;
  roleIds: string[];
  processRefs: string[]; // IDs reales o virtuales
}

const text = (v: unknown) => cellText(v);
export const userVirtualId = (email: string) => `new:user:${email}`;

export async function analyzeUsers(wb: ExcelJS.Workbook, processes: CatalogRef[], currentUserId: string | null) {
  const rows = readSheet(wb, "Usuarios", USER_COLUMNS).filter((r) => !isExampleRow(r.values.cargo));
  const issues: RowIssue[] = [];
  const plans: UserPlan[] = [];
  if (rows.length === 0) return { issues, plans, refs: [] as { id: string; email: string; name: string }[] };

  const [roles, existing] = await Promise.all([
    db.role.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
    db.user.findMany({
      where: { deletedAt: null, email: { in: rows.map((r) => text(r.values.correo).toLowerCase()) } },
      select: { id: true, email: true, roles: { select: { role: { select: { id: true, code: true } } } } },
    }),
  ]);
  const adminRole = roles.find((r) => r.code === LOCKED_ROLE_CODE);
  const seen = new Set<string>();

  for (const { row, values } of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const email = text(values.correo).toLowerCase();
    if (!zEmail.safeParse(email).success) errors.push(`Correo «${text(values.correo)}» no válido`);
    if (email && seen.has(email)) errors.push("Correo repetido en el archivo");
    seen.add(email);
    const name = text(values.nombre);
    if (name.length < 2) errors.push("Falta el nombre");

    const roleNames = splitOptions(text(values.roles));
    if (roleNames.length === 0) errors.push("Indica al menos un rol (p. ej. Brigadista)");
    const roleIds: string[] = [];
    for (const r of roleNames) {
      const role = findByCodeOrName(roles, r);
      if (!role) errors.push(`Rol «${r}» no existe (roles: ${roles.map((x) => x.name).join(", ")})`);
      else roleIds.push(role.id);
    }
    const processRefs: string[] = [];
    for (const p of splitOptions(text(values.procesos))) {
      const process = findByCodeOrName(processes, p);
      if (!process) errors.push(`Proceso «${p}» no existe`);
      else processRefs.push(process.id);
    }
    const active = parseYesNo(text(values.activo), true);
    if (active === null) errors.push("Activo: escribe Sí o No");
    const phone = text(values.telefono);
    if (phone && !/^[0-9+()\s-]{0,30}$/.test(phone)) errors.push("Teléfono inválido");

    const current = existing.find((u) => u.email === email);
    // Protección: la carga masiva nunca quita el rol Administrador ni desactiva a quien importa.
    if (current && adminRole && current.roles.some((r) => r.role.id === adminRole.id) && !roleIds.includes(adminRole.id)) {
      roleIds.push(adminRole.id);
      warnings.push("Conserva el rol Administrador (no se quita por carga masiva)");
    }
    if (current && current.id === currentUserId && active === false) errors.push("No puedes desactivarte a ti mismo");

    issues.push({ row, code: email, action: errors.length ? "error" : current ? "update" : "create", errors, warnings });
    if (!errors.length) {
      plans.push({
        existingId: current?.id ?? null,
        email,
        name: name.slice(0, 120),
        jobTitle: text(values.cargo).slice(0, 120) || null,
        phone: phone || null,
        active: active ?? true,
        roleIds: [...new Set(roleIds)],
        processRefs: [...new Set(processRefs)],
      });
    }
  }
  const refs = plans.filter((p) => !p.existingId).map((p) => ({ id: userVirtualId(p.email), email: p.email, name: p.name }));
  return { issues, plans, refs };
}

/** Crea / actualiza usuarios dentro de la transacción. Devuelve los IDs creados (para invitarlos después). */
export async function applyUsers(tx: Prisma.TransactionClient, plans: UserPlan[], real: (id: string) => string, ids: Map<string, string>) {
  const created: string[] = [];
  for (const u of plans) {
    const processIds = u.processRefs.map(real);
    const data = {
      name: u.name,
      jobTitle: u.jobTitle,
      phone: u.phone,
      active: u.active,
      roles: { deleteMany: {}, create: u.roleIds.map((roleId) => ({ roleId })) },
      processes: { deleteMany: {}, create: processIds.map((processId) => ({ processId })) },
    };
    if (u.existingId) {
      await tx.user.update({ where: { id: u.existingId }, data });
      if (!u.active) await tx.session.deleteMany({ where: { userId: u.existingId } });
      continue;
    }
    const user = await tx.user.create({
      data: {
        ...data,
        roles: { create: u.roleIds.map((roleId) => ({ roleId })) },
        processes: { create: processIds.map((processId) => ({ processId })) },
        email: u.email,
        passwordHash: await unusablePasswordHash(generateToken()),
      },
      select: { id: true },
    });
    ids.set(userVirtualId(u.email), user.id);
    if (u.active) created.push(user.id);
  }
  return created;
}

/** Correos de bienvenida (fuera de la transacción). Un fallo no detiene a los demás. */
export async function sendWelcomeEmails(userIds: string[]) {
  let sent = 0;
  for (const id of userIds) {
    try {
      const user = await db.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, email: true } });
      const resetUrl = await createPasswordResetLink(user.id, INVITE_TOKEN_MINUTES);
      await sendMail(await welcomeEmail({ to: user.email, name: user.name, resetUrl, loginUrl: `${env.APP_URL}/login` }));
      sent++;
    } catch (error) {
      console.error(`[import] No se pudo enviar la bienvenida al usuario ${id}:`, error instanceof Error ? error.message : error);
    }
  }
  if (userIds.length) console.info(`[import] Invitaciones enviadas: ${sent}/${userIds.length}`);
  return sent;
}
