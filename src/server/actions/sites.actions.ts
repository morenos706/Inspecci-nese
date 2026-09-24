"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { areaSchema, siteSchema } from "@/lib/validation/admin";
import { parseForm, runAction } from "@/server/actions/run-action";
import { requirePermission } from "@/server/auth/current-user";
import { serviceContext } from "@/server/services/context";
import * as sitesService from "@/server/services/sites.service";

export async function saveSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("sites.manage"));
    const input = parseForm(siteSchema, formData);
    if (input.id) {
      await sitesService.updateSite({ ...input, id: input.id }, ctx);
      revalidatePath("/admin/sites");
      return { ok: true, message: "Sede actualizada.", redirectTo: "/admin/sites" };
    }
    const site = await sitesService.createSite(input, ctx);
    revalidatePath("/admin/sites");
    // Tras crear la sede se abre su ficha para registrar las áreas.
    return { ok: true, message: "Sede creada. Ahora puedes agregar sus áreas.", redirectTo: `/admin/sites/${site.id}` };
  });
}

export async function saveAreaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await serviceContext(await requirePermission("sites.manage"));
    const input = parseForm(areaSchema, formData);
    await sitesService.saveArea(input, ctx);
    revalidatePath(`/admin/sites/${input.siteId}`);
    return { ok: true, message: input.id ? "Área actualizada." : "Área creada." };
  });
}
