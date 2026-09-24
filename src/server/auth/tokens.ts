import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Token aleatorio de 256 bits, apto para URL y cookies. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * En BD solo se guarda el hash del token: si la base se filtra, los tokens
 * no se pueden usar para suplantar sesiones.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
