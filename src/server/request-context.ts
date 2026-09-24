import "server-only";
import { headers } from "next/headers";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * IP y user-agent de la petición actual. Detrás de un proxy inverso confiable
 * (Nginx, Traefik, ALB) se toma el primer valor de X-Forwarded-For.
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const userAgent = h.get("user-agent");
  return { ipAddress: ip, userAgent: userAgent ? userAgent.slice(0, 500) : null };
}
