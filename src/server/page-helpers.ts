import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/errors";

/** En páginas: convierte NotFoundError del servicio en la página 404 de Next. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
