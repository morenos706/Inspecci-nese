import "server-only";
import { db } from "@/server/db";
import { idFromCode, nextIdNumber, typeCodePrefix, type CodeInfo } from "@/lib/element-code";
import { listElementTypeOptions } from "@/server/services/element-types.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";
import { listUserOptions } from "@/server/services/users.service";

/** Catálogos que necesita el formulario de elementos (crear y editar). */
export async function getElementFormData() {
  const [types, processes, sites, users, elements] = await Promise.all([
    listElementTypeOptions(),
    listProcessOptions(),
    listSiteOptions(),
    listUserOptions(),
    db.element.findMany({ select: { code: true, elementTypeId: true, deletedAt: true, site: { select: { name: true } } } }),
  ]);
  const codeInfo: CodeInfo = { typePrefix: {}, nextId: {}, usedIds: {} };
  const allCodes = elements.map((e) => e.code);
  for (const type of types) {
    const prefix = typeCodePrefix(type);
    codeInfo.typePrefix[type.id] = prefix;
    codeInfo.nextId[type.id] = nextIdNumber(
      allCodes.filter((c) => c.includes(`-${prefix}-`)),
      prefix,
    );
    const used: Record<string, string> = {};
    for (const e of elements) {
      if (e.elementTypeId !== type.id && !e.code.includes(`-${prefix}-`)) continue;
      const id = idFromCode(e.code, prefix);
      if (id) used[id] = e.deletedAt ? `${e.code} (eliminado)` : `${e.code} · ${e.site.name}`;
    }
    codeInfo.usedIds[type.id] = used;
  }
  return { types, processes, sites, users, codeInfo };
}
