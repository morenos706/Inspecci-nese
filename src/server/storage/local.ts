import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageProvider } from "@/server/storage/types";

/**
 * Almacenamiento en disco para DESARROLLO sin Docker. No usar en producción
 * con varias réplicas (el disco no es compartido).
 */
export function createLocalStorage(rootDir: string): StorageProvider {
  const root = path.resolve(rootDir);

  // Las claves las genera el servidor, pero se valida igualmente que no escapen del directorio.
  function resolve(key: string) {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Clave de archivo inválida");
    return full;
  }

  return {
    async put(key, body) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      const file = resolve(key);
      try {
        const info = await stat(file);
        return {
          body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
          contentLength: info.size,
        };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}
