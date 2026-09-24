import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { getRequestMeta, type RequestMeta } from "@/server/request-context";
import type { AuditContext } from "@/server/audit";

/** Contexto que reciben los servicios: quién actúa y desde dónde. */
export interface ServiceContext {
  user: CurrentUser;
  meta: RequestMeta;
}

export async function serviceContext(user: CurrentUser): Promise<ServiceContext> {
  return { user, meta: await getRequestMeta() };
}

export function auditCtx(ctx: ServiceContext): AuditContext {
  return { userId: ctx.user.id, meta: ctx.meta };
}
