import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { ElementTypeForm } from "@/components/forms/element-type-form";
import { QuestionEditor } from "@/components/forms/question-editor";
import { requirePagePermission } from "@/server/auth/current-user";
import { orNotFound } from "@/server/page-helpers";
import { getElementType } from "@/server/services/element-types.service";

export const metadata = { title: "Tipo de elemento" };

export default async function ElementTypePage({ params }: PageProps<"/admin/element-types/[id]">) {
  await requirePagePermission("element_types.manage");
  const { id } = await params;
  const type = await orNotFound(getElementType(id));
  const activeQuestions = type.questions.filter((q) => q.active).length;

  return (
    <>
      <PageHeader
        title={type.name}
        description={`${type._count.elements} elemento(s) de este tipo`}
        back={{ href: "/admin/element-types", label: "Tipos de elemento" }}
      />
      <div className="space-y-6">
        {activeQuestions === 0 && (
          <Alert tone="warning" title="Este tipo aún no se puede inspeccionar">
            Agrega al menos una pregunta activa.
          </Alert>
        )}
        <QuestionEditor
          elementTypeId={type.id}
          templateVersion={type.template.version}
          questions={type.questions.map(({ _count, ...q }) => ({ ...q, answerCount: _count.answers }))}
        />
        <ElementTypeForm type={type} />
      </div>
    </>
  );
}
