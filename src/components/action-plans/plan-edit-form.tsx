"use client";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useActionForm } from "@/hooks/use-action-form";
import { createActionPlanAction, updateActionPlanAction } from "@/server/actions/action-plans.actions";

/** Crear un plan adicional para un hallazgo, o reasignar/editar uno existente (actions.manage). */
export function PlanEditForm({
  mode,
  planId,
  findingId,
  defaults,
  users,
  today,
}: {
  mode: "create" | "edit";
  planId?: string;
  findingId?: string;
  defaults?: { action: string; responsibleId: string; dueDate: string };
  users: { id: string; name: string; jobTitle: string | null }[];
  today: string;
}) {
  const { onSubmit, pending, errors } = useActionForm(mode === "create" ? createActionPlanAction : updateActionPlanAction);
  const prefix = mode === "create" ? "new-plan" : "edit-plan";
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {planId && <input type="hidden" name="planId" value={planId} />}
      {findingId && <input type="hidden" name="findingId" value={findingId} />}
      <FormField label="Acción" errors={errors("action")} required>
        <Textarea id={`${prefix}-action`} name="action" rows={2} maxLength={1000} defaultValue={defaults?.action} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Responsable" errors={errors("responsibleId")} required>
          <Select id={`${prefix}-responsible`} name="responsibleId" defaultValue={defaults?.responsibleId ?? ""}>
            <option value="">Selecciona…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.jobTitle ? ` — ${u.jobTitle}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Fecha límite" errors={errors("dueDate")} required>
          <Input id={`${prefix}-due`} name="dueDate" type="date" min={mode === "create" ? today : undefined} defaultValue={defaults?.dueDate} />
        </FormField>
      </div>
      <Button type="submit" loading={pending}>
        {mode === "create" ? "Crear y asignar plan" : "Guardar cambios"}
      </Button>
    </form>
  );
}
