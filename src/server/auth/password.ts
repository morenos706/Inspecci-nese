import "server-only";
import bcrypt from "bcryptjs";

// Coste 12 ≈ 250 ms por hash: balance razonable entre seguridad y latencia.
const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Hash válido de una contraseña aleatoria: se compara contra él cuando el
// usuario no existe, para que el tiempo de respuesta no revele si el correo
// está registrado (mitiga enumeración de usuarios por timing).
const DUMMY_HASH = "$2b$12$X7.GEnk12kQgYC6aNK4OCO2CpYYX9ABm5lmudihcJRlT0oL.Qb9kO";

export async function verifyPasswordTimingSafe(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/**
 * Hash de una contraseña aleatoria que nadie conoce (usuarios invitados que
 * definirán la suya con el enlace del correo). Coste bajo: el secreto es de
 * 256 bits, no se puede adivinar, y así una carga masiva no tarda minutos.
 */
export function unusablePasswordHash(randomSecret: string): Promise<string> {
  return bcrypt.hash(randomSecret, 4);
}
