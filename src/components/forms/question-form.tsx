"use client";

import { useMemo, useRef, useState } from "react";
import type { Priority, ResponseType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useActionForm } from "@/hooks/use-action-form";
import { EVALUABLE_TYPES, parseOptions, parseRule } from "@/lib/inspection-rules";
import { PRIORITIES, PRIORITY_LABELS, RESPONSE_TYPE_LABELS, RESPONSE_TYPES } from "@/lib/labels";
import { saveQuestionAction } from "@/server/actions/element-types.actions";

export interface QuestionValues {
  id: string;
  text: string;
  helpText: string | null;
  responseType: ResponseType;
  required: boolean;
  active: boolean;
  order: number;
  options: unknown;
  complianceRule: unknown;
  generatesFinding: boolean;
  defaultPriority: Priority;
  answerCount: number;
}

const TYPE_HINTS: Partial<Record<ResponseType, string>> = {
  YES_NO: "Botones grandes SÍ / NO.",
  COMPLIES: "Botones CUMPLE / NO CUMPLE.",
  YES_NO_NA: "Incluye la opción «No aplica» (no cuenta para el cumplimiento).",
  TEXT: "Respuesta libre. No se evalúa cumplimiento.",
  NUMBER: "Opcional: define un rango aceptable para evaluar cumplimiento.",
  DATE: "Opcional: exige que la fecha no esté vencida.",
  SELECT: "Una opción de una lista. Marca cuáles no cumplen.",
  MULTI_SELECT: "Varias opciones de una lista. Si marca alguna que no cumple, la respuesta no cumple.",
  PHOTO: "El inspector toma o adjunta una fotografía.",
};

/**
 * Formulario de pregunta. Muestra solo los campos que aplican al tipo de
 * respuesta elegido; el servidor vuelve a validar todo (questionSchema).
 */
export function QuestionForm({
  elementTypeId,
  question,
  onDone,
}: {
  elementTypeId: string;
  question?: QuestionValues;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const rule = parseRule(question?.complianceRule);
  const [type, setType] = useState<ResponseType>(question?.responseType ?? "YES_NO");
  const [optionsText, setOptionsText] = useState(
    parseOptions(question?.options)
      .map((o) => o.label)
      .join("\n"),
  );
  const options = useMemo(
    () => [...new Set(optionsText.split("\n").map((l) => l.trim()).filter(Boolean))],
    [optionsText],
  );
  const { onSubmit, pending, errors } = useActionForm(saveQuestionAction, {
    onSuccess: () => {
      if (!question) {
        formRef.current?.reset();
        setType("YES_NO");
        setOptionsText("");
      }
      onDone?.();
    },
  });

  const id = (field: string) => `${question?.id ?? "new"}-${field}`;
  const typeLocked = (question?.answerCount ?? 0) > 0;
  const evaluable = EVALUABLE_TYPES.includes(type);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="elementTypeId" value={elementTypeId} />
      {question && <input type="hidden" name="id" value={question.id} />}

      <FormField label="Pregunta" errors={errors("text")} required>
        <Input id={id("text")} name="text" defaultValue={question?.text} maxLength={300} placeholder="¿Está en el lugar asignado?" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Tipo de respuesta"
          errors={errors("responseType")}
          hint={typeLocked ? "Ya tiene respuestas: el tipo no se puede cambiar." : TYPE_HINTS[type]}
          required
        >
          <Select
            id={id("responseType")}
            name="responseType"
            value={type}
            onChange={(e) => setType(e.target.value as ResponseType)}
            disabled={typeLocked}
          >
            {RESPONSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RESPONSE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        {typeLocked && <input type="hidden" name="responseType" value={type} />}
        <FormField label="Ayuda para el inspector" errors={errors("helpText")}>
          <Input id={id("helpText")} name="helpText" defaultValue={question?.helpText ?? ""} maxLength={500} />
        </FormField>
      </div>

      {/* Configuración específica del tipo */}
      {(type === "YES_NO" || type === "YES_NO_NA") && (
        <FormField
          label="¿Qué respuesta NO cumple?"
          hint="Usa «Sí» para preguntas negativas, p.ej. «¿Tiene elementos faltantes?»"
        >
          <Select
            id={id("nonCompliantAnswer")}
            name="nonCompliantAnswer"
            defaultValue={parseRule(question?.complianceRule).nonCompliantValues?.includes("YES") ? "YES" : "NO"}
          >
            <option value="NO">No</option>
            <option value="YES">Sí</option>
          </Select>
        </FormField>
      )}

      {(type === "SELECT" || type === "MULTI_SELECT") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Opciones (una por línea)" errors={errors("optionsText")} required>
            <Textarea
              id={id("optionsText")}
              name="optionsText"
              rows={5}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={"Bueno\nRegular\nMalo"}
            />
          </FormField>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Opciones que NO cumplen</legend>
            {options.length === 0 ? (
              <p className="text-sm text-subtle">Escribe las opciones para poder marcarlas.</p>
            ) : (
              <div className="grid gap-1">
                {options.map((o) => (
                  <Checkbox
                    key={o}
                    id={id(`nc-${o}`)}
                    name="nonCompliantOptions"
                    value={o}
                    label={o}
                    defaultChecked={rule.nonCompliantValues?.includes(o)}
                  />
                ))}
              </div>
            )}
          </fieldset>
        </div>
      )}

      {type === "NUMBER" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Valor mínimo aceptable" errors={errors("min")}>
            <Input id={id("min")} name="min" type="number" step="any" inputMode="decimal" defaultValue={rule.min ?? ""} />
          </FormField>
          <FormField label="Valor máximo aceptable" errors={errors("max")}>
            <Input id={id("max")} name="max" type="number" step="any" inputMode="decimal" defaultValue={rule.max ?? ""} />
          </FormField>
        </div>
      )}

      {type === "DATE" && (
        <Checkbox
          id={id("dateNotPast")}
          name="dateNotPast"
          defaultChecked={rule.dateNotPast}
          label="No cumple si la fecha ya pasó"
          description="Útil para fechas de vencimiento o de próxima recarga."
        />
      )}

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Checkbox id={id("required")} name="required" defaultChecked={question?.required ?? true} label="Obligatoria" />
        <Checkbox
          id={id("active")}
          name="active"
          defaultChecked={question?.active ?? true}
          label="Activa"
          description="Las inactivas no aparecen en nuevas inspecciones."
        />
        {evaluable && (
          <Checkbox
            id={id("generatesFinding")}
            name="generatesFinding"
            defaultChecked={question?.generatesFinding ?? true}
            label="Proponer hallazgo si no cumple"
            description="Al responder «no cumple» se abre el registro de hallazgo."
          />
        )}
        {evaluable && (
          <FormField label="Prioridad sugerida del hallazgo" errors={errors("defaultPriority")}>
            <Select id={id("defaultPriority")} name="defaultPriority" defaultValue={question?.defaultPriority ?? "MEDIUM"}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onDone && question && (
          <Button variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={pending}>
          {question ? "Guardar pregunta" : "Agregar pregunta"}
        </Button>
      </div>
    </form>
  );
}
