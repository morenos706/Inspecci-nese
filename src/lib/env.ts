import "server-only";
import { z } from "zod";

/**
 * Variables de entorno validadas al arrancar. Si falta algo crítico, la app
 * falla rápido con un mensaje claro en lugar de fallar en tiempo de ejecución.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MAIL_FROM: z.string().default("Inspecciones <no-reply@inspecciones.local>"),

  // local: disco / volumen del servidor (una instancia) · s3: AWS S3 / Cloudflare R2 / otro S3-compatible
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("inspecciones"),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(10),
  APP_TIMEZONE: z.string().default("America/Bogota"),
  // Secreto para /api/cron/run (cron externo). Vacío = endpoint deshabilitado.
  CRON_SECRET: z.string().min(24, "CRON_SECRET debe tener al menos 24 caracteres").optional().or(z.literal("")),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }
  if (parsed.data.APP_ENV === "production" && parsed.data.AUTH_SECRET.startsWith("change-me")) {
    throw new Error("AUTH_SECRET no puede usar el valor de ejemplo en producción");
  }
  // Con S3 las llaves son opcionales: sin ellas se usa la cadena de credenciales
  // de AWS (p.ej. el rol IAM de la instancia EC2). Si se da una, se exigen ambas.
  if (parsed.data.STORAGE_DRIVER === "s3" && Boolean(parsed.data.S3_ACCESS_KEY_ID) !== Boolean(parsed.data.S3_SECRET_ACCESS_KEY)) {
    throw new Error("S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY deben definirse juntas (o ninguna para usar el rol IAM)");
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
