/**
 * Seed del sistema.
 *
 *  1. Catálogo (SIEMPRE, idempotente): permisos, roles del sistema y parámetros.
 *     Se puede ejecutar en producción para sincronizar permisos nuevos.
 *  2. Datos de demostración (solo si SEED_DEMO != "false" y la BD no tiene
 *     elementos): procesos, sedes, usuarios, tipos, preguntas, elementos,
 *     inspecciones, hallazgos y planes de acción para probar el flujo completo.
 *
 * Uso: npm run db:seed
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type InspectionFrequency,
  type Priority,
  type ResponseType,
  type WorkflowStatus,
} from "../src/generated/prisma/client";
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from "../src/lib/permissions";
import { scheduleFields } from "../src/lib/scheduling";
import { expiryLabelFromQuestion } from "../src/lib/expiry";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Cambiar123*";
const newQrToken = () => randomBytes(16).toString("base64url");
const d = (iso: string) => new Date(`${iso}T14:00:00.000Z`); // 09:00 hora Colombia

// ---------------------------------------------------------------------------
// 1. Catálogo
// ---------------------------------------------------------------------------

async function seedCatalog() {
  for (const code of ALL_PERMISSIONS) {
    const { module, description } = PERMISSIONS[code];
    await db.permission.upsert({
      where: { code },
      update: { module, description },
      create: { code, module, description },
    });
  }
  // Elimina permisos que ya no existen en el código.
  await db.permission.deleteMany({ where: { code: { notIn: [...ALL_PERMISSIONS] } } });

  const permissionIds = new Map((await db.permission.findMany()).map((p) => [p.code, p.id]));

  for (const [code, def] of Object.entries(SYSTEM_ROLES)) {
    const existing = await db.role.findUnique({ where: { code } });
    if (!existing) {
      await db.role.create({
        data: {
          code,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: { create: def.permissions.map((p) => ({ permissionId: permissionIds.get(p)! })) },
        },
      });
    } else if (code === "ADMIN") {
      // El administrador siempre queda con todos los permisos (incluye permisos nuevos).
      await db.role.update({
        where: { id: existing.id },
        data: {
          isSystem: true,
          permissions: {
            deleteMany: {},
            create: ALL_PERMISSIONS.map((p) => ({ permissionId: permissionIds.get(p)! })),
          },
        },
      });
    }
    // Los demás roles existentes no se tocan: el administrador pudo personalizarlos.
  }

  const settings: { key: string; value: unknown; description: string }[] = [
    { key: "organization.name", value: "Mi Empresa S.A.S.", description: "Nombre de la organización (reportes y correos)" },
    { key: "actionPlans.dueSoonDays", value: 2, description: "Días de anticipación para avisar vencimiento de planes" },
    { key: "inspections.reminderHour", value: 7, description: "Hora local del resumen diario de inspecciones pendientes" },
  ];
  for (const s of settings) {
    await db.systemSetting.upsert({
      where: { key: s.key },
      update: { description: s.description },
      create: { key: s.key, value: s.value as never, description: s.description },
    });
  }
  console.log(`✔ Catálogo: ${ALL_PERMISSIONS.length} permisos, ${Object.keys(SYSTEM_ROLES).length} roles, parámetros`);
}

// ---------------------------------------------------------------------------
// 2. Datos de demostración
// ---------------------------------------------------------------------------

interface QuestionDef {
  text: string;
  type: ResponseType;
  help?: string;
  nonCompliant?: string[];
  priority?: Priority;
  required?: boolean;
  tracksExpiry?: boolean;
}

const ELEMENT_TYPES: {
  code: string;
  name: string;
  prefix: string;
  icon: string;
  frequency: InspectionFrequency;
  questions: QuestionDef[];
}[] = [
  {
    code: "EXT",
    name: "Extintor",
    prefix: "EXT",
    icon: "fire-extinguisher",
    frequency: "MONTHLY",
    questions: [
      { text: "¿Está en el lugar asignado?", type: "YES_NO" },
      { text: "¿Tiene acceso libre?", type: "YES_NO", help: "Sin obstáculos a su alrededor ni delante.", priority: "HIGH" },
      { text: "¿El manómetro está en zona verde?", type: "YES_NO", priority: "CRITICAL" },
      { text: "¿Tiene sello de seguridad?", type: "YES_NO", priority: "HIGH" },
      { text: "¿La manguera está en buen estado?", type: "YES_NO" },
      { text: "¿Tiene señalización?", type: "YES_NO", priority: "LOW" },
      {
        text: "Fecha de vencimiento de la recarga",
        type: "DATE",
        help: "Según la etiqueta de la última recarga.",
        priority: "CRITICAL",
        tracksExpiry: true,
      },
      { text: "Fotografía general del extintor", type: "PHOTO", required: false },
    ],
  },
  {
    code: "BOT",
    name: "Botiquín",
    prefix: "BOT",
    icon: "briefcase-medical",
    frequency: "MONTHLY",
    questions: [
      { text: "¿Está ubicado correctamente?", type: "YES_NO" },
      { text: "¿Está completo?", type: "YES_NO", priority: "HIGH" },
      { text: "¿Los medicamentos/insumos están vigentes?", type: "YES_NO", priority: "HIGH" },
      { text: "¿Está señalizado?", type: "YES_NO", priority: "LOW" },
      {
        text: "¿Tiene elementos faltantes?",
        type: "YES_NO",
        help: "Responde SÍ si falta algún elemento del listado.",
        nonCompliant: ["YES"],
        priority: "MEDIUM",
      },
      { text: "Observaciones de insumos", type: "TEXT", required: false },
    ],
  },
  {
    code: "CAM",
    name: "Camilla",
    prefix: "CAM",
    icon: "bed",
    frequency: "QUARTERLY",
    questions: [
      { text: "¿Está en el lugar asignado?", type: "YES_NO" },
      { text: "¿La estructura está en buen estado?", type: "COMPLIES", priority: "HIGH" },
      { text: "¿Tiene inmovilizadores y correas completas?", type: "YES_NO_NA" },
      { text: "¿Está señalizada?", type: "YES_NO", priority: "LOW" },
    ],
  },
];

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE ?? "America/Bogota" }).format(new Date());

function isCompliant(q: QuestionDef, value: string | null): boolean | null {
  if (value === null || value === "NA") return null;
  if (q.type === "DATE") return q.tracksExpiry ? value >= TODAY : null;
  if (q.type === "YES_NO" || q.type === "YES_NO_NA") return !(q.nonCompliant ?? ["NO"]).includes(value);
  if (q.type === "COMPLIES") return value === "COMPLIES";
  return null;
}

async function seedDemo() {
  if (process.env.SEED_DEMO === "false") return console.log("• SEED_DEMO=false: se omiten datos de demostración");
  if ((await db.element.count()) > 0) return console.log("• Ya existen elementos: se omiten datos de demostración");

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const role = async (code: string) => (await db.role.findUniqueOrThrow({ where: { code } })).id;

  // Procesos
  const processes = Object.fromEntries(
    await Promise.all(
      [
        ["SEG", "Seguridad", "Seguridad y salud en el trabajo"],
        ["PROD", "Producción", "Operación de planta y bodegas"],
        ["MANT", "Mantenimiento", "Mantenimiento locativo y de equipos"],
        ["ADM", "Administrativa", "Procesos administrativos y oficinas"],
      ].map(async ([code, name, description]) => {
        const p = await db.process.upsert({ where: { code }, update: {}, create: { code, name, description } });
        return [code, p.id] as const;
      }),
    ),
  );

  // Sedes y zonas
  const principal = await db.site.upsert({
    where: { code: "PRINCIPAL" },
    update: {},
    create: { code: "PRINCIPAL", name: "Sede Principal", city: "Bogotá", address: "Calle 100 # 10-20" },
  });
  const norte = await db.site.upsert({
    where: { code: "NORTE" },
    update: {},
    create: { code: "NORTE", name: "Sede Norte", city: "Bogotá", address: "Autopista Norte # 170-50" },
  });
  const zoneDefs: [string, string, string][] = [
    [principal.id, "BOD", "Zona 1 – Bodega principal"],
    [principal.id, "OFI", "Zona 2 – Oficinas"],
    [principal.id, "PLA", "Zona 3 – Planta de producción"],
    [norte.id, "REC", "Zona 1 – Recepción"],
    [norte.id, "PAR", "Zona 2 – Parqueadero"],
  ];
  const zones: Record<string, string> = {};
  for (const [siteId, code, name] of zoneDefs) {
    const a = await db.zone.upsert({
      where: { siteId_code: { siteId, code } },
      update: {},
      create: { siteId, code, name },
    });
    zones[code] = a.id;
  }

  // Usuarios
  const userDefs = [
    { email: "admin@inspecciones.local", name: "Administrador del Sistema", jobTitle: "Coordinador SST", roles: ["ADMIN"], processes: [] },
    { email: "inspector@inspecciones.local", name: "Carlos Ramírez", jobTitle: "Brigadista", roles: ["INSPECTOR"], processes: ["SEG"] },
    {
      email: "responsable@inspecciones.local",
      name: "María Gómez",
      jobTitle: "Jefe de Bodega",
      roles: ["PROCESS_OWNER", "ACTION_OWNER"],
      processes: ["PROD"],
    },
    { email: "accion@inspecciones.local", name: "Juan Pérez", jobTitle: "Técnico de Mantenimiento", roles: ["ACTION_OWNER"], processes: ["MANT"] },
    { email: "gerencia@inspecciones.local", name: "Laura Torres", jobTitle: "Gerente de Operaciones", roles: ["VIEWER"], processes: [] },
  ];
  const users: Record<string, string> = {};
  for (const u of userDefs) {
    const roleIds = await Promise.all(u.roles.map(role));
    const created = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        jobTitle: u.jobTitle,
        passwordHash,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        processes: { create: u.processes.map((code) => ({ processId: processes[code]! })) },
      },
    });
    users[u.email.split("@")[0]!] = created.id;
  }

  // Tipos de elementos, plantillas y preguntas
  const types: Record<string, { id: string; templateId: string; questions: (QuestionDef & { id: string })[] }> = {};
  for (const t of ELEMENT_TYPES) {
    const type = await db.elementType.create({
      data: { code: t.code, name: t.name, codePrefix: t.prefix, icon: t.icon, defaultFrequency: t.frequency },
    });
    const template = await db.inspectionTemplate.create({
      data: {
        elementTypeId: type.id,
        name: `Inspección de ${t.name.toLowerCase()}`,
        version: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const questions: (QuestionDef & { id: string })[] = [];
    for (const [i, q] of t.questions.entries()) {
      const evaluable = ["YES_NO", "YES_NO_NA", "COMPLIES"].includes(q.type) || Boolean(q.tracksExpiry);
      const created = await db.inspectionQuestion.create({
        data: {
          templateId: template.id,
          text: q.text,
          helpText: q.help ?? null,
          responseType: q.type,
          required: q.required ?? true,
          order: i + 1,
          complianceRule: q.nonCompliant
            ? { nonCompliantValues: q.nonCompliant }
            : q.tracksExpiry
              ? { dateNotPast: true }
              : undefined,
          tracksExpiry: q.tracksExpiry ?? false,
          generatesFinding: evaluable,
          defaultPriority: q.priority ?? "MEDIUM",
        },
      });
      questions.push({ ...q, id: created.id });
    }
    types[t.code] = { id: type.id, templateId: template.id, questions };
  }

  // Elementos (fechas variadas para ver estados: al día, próximo a vencer, vencido, sin programar)
  const elementDefs: {
    code: string;
    type: string;
    name: string;
    process: string;
    site: string;
    zone: string;
    location: string;
    responsible: string;
    last: string | null;
    status?: "ACTIVE" | "MAINTENANCE";
  }[] = [
    { code: "EXT-023", type: "EXT", name: "Extintor ABC 20 lb", process: "PROD", site: principal.id, zone: "BOD", location: "Columna B4, junto a estantería 3", responsible: "responsable", last: "2026-09-01" },
    { code: "EXT-001", type: "EXT", name: "Extintor ABC 10 lb", process: "ADM", site: principal.id, zone: "OFI", location: "Pasillo principal piso 2", responsible: "admin", last: "2026-08-28" },
    { code: "EXT-002", type: "EXT", name: "Extintor CO2 15 lb", process: "PROD", site: principal.id, zone: "PLA", location: "Tablero eléctrico línea 1", responsible: "responsable", last: "2026-09-10" },
    { code: "EXT-003", type: "EXT", name: "Extintor ABC 20 lb", process: "MANT", site: principal.id, zone: "PLA", location: "Taller de mantenimiento", responsible: "accion", last: "2026-07-15" },
    { code: "EXT-004", type: "EXT", name: "Extintor Solkaflam 3700 g", process: "ADM", site: norte.id, zone: "REC", location: "Recepción, detrás del counter", responsible: "admin", last: "2026-09-20" },
    { code: "EXT-005", type: "EXT", name: "Extintor ABC 30 lb satelital", process: "SEG", site: norte.id, zone: "PAR", location: "Entrada parqueadero", responsible: "admin", last: null },
    { code: "BOT-001", type: "BOT", name: "Botiquín tipo A", process: "PROD", site: principal.id, zone: "BOD", location: "Oficina de bodega", responsible: "responsable", last: "2026-09-05" },
    { code: "BOT-002", type: "BOT", name: "Botiquín tipo B", process: "ADM", site: principal.id, zone: "OFI", location: "Cocineta piso 2", responsible: "admin", last: "2026-08-20" },
    { code: "BOT-003", type: "BOT", name: "Botiquín tipo A", process: "SEG", site: norte.id, zone: "REC", location: "Recepción", responsible: "admin", last: "2026-09-18" },
    { code: "CAM-001", type: "CAM", name: "Camilla rígida con inmovilizadores", process: "SEG", site: principal.id, zone: "PLA", location: "Punto de encuentro planta", responsible: "admin", last: "2026-07-01" },
    { code: "CAM-002", type: "CAM", name: "Camilla rígida", process: "SEG", site: norte.id, zone: "REC", location: "Cuarto de brigada", responsible: "admin", last: "2026-06-15", status: "MAINTENANCE" },
  ];
  const elements: Record<string, { id: string; processId: string; siteId: string; type: string }> = {};
  for (const e of elementDefs) {
    const typeDef = ELEMENT_TYPES.find((t) => t.code === e.type)!;
    const last = e.last ? d(e.last) : null;
    const created = await db.element.create({
      data: {
        code: e.code,
        qrToken: newQrToken(),
        elementTypeId: types[e.type]!.id,
        name: e.name,
        processId: processes[e.process]!,
        siteId: e.site,
        zoneId: zones[e.zone],
        location: e.location,
        responsibleId: users[e.responsible],
        frequency: typeDef.frequency,
        lastInspectionAt: last,
        ...scheduleFields({ lastInspectionAt: last, frequency: typeDef.frequency }),
        status: e.status ?? "ACTIVE",
        ...(e.code === "EXT-005"
          ? { expiresAt: new Date("2026-09-15T12:00:00.000Z"), expiryLabel: "Recarga" }
          : {}),
      },
    });
    elements[e.code] = { id: created.id, processId: created.processId, siteId: created.siteId, type: e.type };
  }

  // Inspecciones realizadas (con respuestas, hallazgos y planes)
  async function inspect(
    code: string,
    date: string,
    answers: Record<number, string | null>, // índice de pregunta → valor (por defecto "YES")
    findings: {
      question: number;
      description: string;
      action: string;
      priority: Priority;
      responsible: string;
      due: string;
      status: WorkflowStatus;
      planStatus: WorkflowStatus;
    }[] = [],
  ) {
    const el = elements[code]!;
    const type = types[el.type]!;
    const when = d(date);
    const rows = type.questions.map((q, i) => {
      const defaultValue =
        q.type === "COMPLIES"
          ? "COMPLIES"
          : ["YES_NO", "YES_NO_NA"].includes(q.type)
            ? q.nonCompliant
              ? "NO"
              : "YES"
            : q.tracksExpiry
              ? "2027-03-01"
              : null;
      const value = i in answers ? answers[i]! : defaultValue;
      return { q, value, compliant: isCompliant(q, value) };
    });
    const evaluated = rows.filter((r) => r.compliant !== null);
    const compliantCount = evaluated.filter((r) => r.compliant).length;
    const nonCompliantCount = evaluated.length - compliantCount;

    const inspection = await db.inspection.create({
      data: {
        elementId: el.id,
        templateId: type.templateId,
        inspectorId: users.inspector!,
        processId: el.processId,
        siteId: el.siteId,
        status: "COMPLETED",
        result: nonCompliantCount > 0 ? "NON_COMPLIANT" : "COMPLIANT",
        startedAt: new Date(when.getTime() - 15 * 60_000),
        completedAt: when,
        dueDate: when,
        totalQuestions: rows.length,
        answeredCount: rows.filter((r) => r.value !== null).length,
        compliantCount,
        nonCompliantCount,
        compliancePct: evaluated.length ? Math.round((compliantCount / evaluated.length) * 10_000) / 100 : null,
        answers: {
          create: rows.map((r, i) => ({
            questionId: r.q.id,
            questionText: r.q.text,
            responseType: r.q.type,
            questionOrder: i + 1,
            value: r.value === null ? undefined : r.value,
            isCompliant: r.compliant,
          })),
        },
      },
      include: { answers: true },
    });

    const expiryRow = rows.find((r) => r.q.tracksExpiry && typeof r.value === "string");
    if (expiryRow) {
      await db.element.update({
        where: { id: el.id },
        data: {
          expiresAt: new Date(`${expiryRow.value}T12:00:00.000Z`),
          expiryLabel: expiryLabelFromQuestion(expiryRow.q.text),
        },
      });
    }

    for (const f of findings) {
      const q = type.questions[f.question]!;
      const answer = inspection.answers.find((a) => a.questionId === q.id)!;
      const closedLike = ["SOLVED", "VERIFIED", "CLOSED"].includes(f.planStatus);
      const finding = await db.finding.create({
        data: {
          inspectionId: inspection.id,
          answerId: answer.id,
          questionId: q.id,
          elementId: el.id,
          processId: el.processId,
          siteId: el.siteId,
          description: f.description,
          priority: f.priority,
          requiredAction: f.action,
          responsibleId: users[f.responsible],
          dueDate: d(f.due),
          status: f.status,
          createdById: users.inspector!,
          createdAt: when,
        },
      });
      const plan = await db.actionPlan.create({
        data: {
          findingId: finding.id,
          action: f.action,
          responsibleId: users[f.responsible]!,
          dueDate: d(f.due),
          status: f.planStatus,
          createdById: users.responsable!,
          createdAt: when,
          solvedAt: closedLike ? new Date() : null,
        },
      });
      await db.actionPlanEvent.create({
        data: { actionPlanId: plan.id, userId: users.responsable!, toStatus: "PENDING", comment: "Plan de acción creado", createdAt: when },
      });
      if (f.planStatus !== "PENDING") {
        await db.actionPlanEvent.create({
          data: {
            actionPlanId: plan.id,
            userId: users[f.responsible]!,
            fromStatus: "PENDING",
            toStatus: f.planStatus,
            comment: "Se inició la gestión de la acción.",
          },
        });
      }
    }
  }

  await inspect("EXT-023", "2026-09-01", { 1: "NO" }, [
    {
      question: 1,
      description: "El extintor se encuentra bloqueado por cajas.",
      action: "Retirar las cajas y garantizar acceso permanente.",
      priority: "HIGH",
      responsible: "responsable",
      due: "2026-09-30",
      status: "PENDING",
      planStatus: "PENDING",
    },
  ]);
  await inspect("EXT-001", "2026-08-28", { 6: "2026-10-10" }); // recarga por vencer
  await inspect("EXT-002", "2026-09-10", { 2: "NO" }, [
    {
      question: 2,
      description: "El manómetro marca zona roja (despresurizado).",
      action: "Enviar a recarga y reemplazar temporalmente con extintor de respaldo.",
      priority: "CRITICAL",
      responsible: "accion",
      due: "2026-09-15",
      status: "IN_PROGRESS",
      planStatus: "IN_PROGRESS",
    },
  ]);
  await inspect("EXT-003", "2026-07-15", { 5: "NO" }, [
    {
      question: 5,
      description: "No tiene señal de ubicación visible.",
      action: "Instalar señalización fotoluminiscente.",
      priority: "LOW",
      responsible: "accion",
      due: "2026-10-15",
      status: "PENDING",
      planStatus: "PENDING",
    },
  ]);
  await inspect("EXT-004", "2026-09-20", {});
  await inspect("BOT-001", "2026-09-05", {});
  await inspect("BOT-002", "2026-08-20", { 2: "NO" }, [
    {
      question: 2,
      description: "Gasas y solución salina vencidas.",
      action: "Reponer insumos vencidos y actualizar la lista de chequeo.",
      priority: "HIGH",
      responsible: "responsable",
      due: "2026-09-05",
      status: "PENDING",
      planStatus: "PENDING",
    },
  ]);
  await inspect("BOT-003", "2026-09-18", {});
  await inspect("CAM-001", "2026-07-01", {});
  await inspect("CAM-002", "2026-06-15", { 1: "NOT_COMPLIES" }, [
    {
      question: 1,
      description: "Fisura en el borde lateral de la camilla.",
      action: "Enviar a reparación o reemplazar la camilla.",
      priority: "MEDIUM",
      responsible: "accion",
      due: "2026-10-30",
      status: "IN_PROGRESS",
      planStatus: "IN_PROGRESS",
    },
  ]);

  console.log(
    `✔ Demostración: ${Object.keys(processes).length} procesos, 2 sedes, ${zoneDefs.length} zonas, ${userDefs.length} usuarios, ` +
      `${ELEMENT_TYPES.length} tipos, ${elementDefs.length} elementos, inspecciones, hallazgos y planes`,
  );
  console.log(`  Usuarios de prueba (contraseña: ${DEFAULT_PASSWORD}):`);
  for (const u of userDefs) console.log(`   - ${u.email.padEnd(32)} ${u.roles.join(", ")}`);
}

async function ensureAdminExists() {
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const admins = await db.user.count({ where: { roles: { some: { roleId: adminRole.id } } } });
  if (admins > 0) return;
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@inspecciones.local").toLowerCase();
  await db.user.create({
    data: {
      email,
      name: "Administrador del Sistema",
      passwordHash: await bcrypt.hash(DEFAULT_PASSWORD, 12),
      mustChangePassword: true,
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });
  console.log(`✔ Administrador inicial creado: ${email} (debe cambiar la contraseña al ingresar)`);
}

async function main() {
  await seedCatalog();
  await seedDemo();
  await ensureAdminExists();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
