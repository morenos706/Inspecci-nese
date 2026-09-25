import "server-only";
import { db } from "@/server/db";
import { nextSequentialCode, typeCodePrefix } from "@/lib/element-code";
import { listElementTypeOptions } from "@/server/services/element-types.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";
import { listUserOptions } from "@/server/services/users.service";

/** Catálogos que necesita el formulario de elementos (crear y editar). */
export async function getElementFormData() {
  const [types, processes, sites, users, codes] = await Promise.all([
    listElementTypeOptions(),
    listProcessOptions(),
    listSiteOptions(),
    listUserOptions(),
    db.element.findMany({ select: { code: true } }),
  ]);
  // Vista previa del código que asignará el sistema para cada sede + tipo (el definitivo se calcula al guardar).
  const all = codes.map((c) => c.code);
  const codePreview: Record<string, string> = {};
  for (const site of sites) {
    for (const type of types) codePreview[`${site.id}:${type.id}`] = nextSequentialCode(site.code, typeCodePrefix(type), all);
  }
  return { types, processes, sites, users, codePreview };
}
