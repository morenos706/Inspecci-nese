import "server-only";
import { listElementTypeOptions } from "@/server/services/element-types.service";
import { suggestCodes } from "@/server/services/elements.service";
import { listProcessOptions } from "@/server/services/processes.service";
import { listSiteOptions } from "@/server/services/sites.service";
import { listUserOptions } from "@/server/services/users.service";

/** Catálogos que necesita el formulario de elementos (crear y editar). */
export async function getElementFormData() {
  const [types, processes, sites, users] = await Promise.all([
    listElementTypeOptions(),
    listProcessOptions(),
    listSiteOptions(),
    listUserOptions(),
  ]);
  const codeSuggestions = await suggestCodes(types);
  return { types, processes, sites, users, codeSuggestions };
}
