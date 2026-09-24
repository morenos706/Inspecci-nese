import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runScheduledJobs } from "@/server/jobs/scheduled";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  if (!env.CRON_SECRET) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Ejecución de tareas programadas desde un cron externo:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/run
 * Sin CRON_SECRET configurado, el endpoint no existe (404).
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: env.CRON_SECRET ? 401 : 404 });
  const result = await runScheduledJobs();
  return NextResponse.json({ ok: true, ...result });
}
