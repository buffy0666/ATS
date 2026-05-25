import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { TemplateForm } from "../TemplateForm";
import { updateTemplate, deleteTemplate } from "../actions";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireSessionWithOrg();
  const template = await prisma.emailTemplate.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!template) notFound();

  const update = updateTemplate.bind(null, template.id);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
      <div>
        <Link href="/templates" className="text-sm text-zinc-500 hover:underline">
          ← All templates
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Edit template</h1>
      </div>
      <TemplateForm
        action={update}
        defaults={template}
        submitLabel="Save changes"
      />
      <section className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-3">
          Danger zone
        </h2>
        <DeleteTemplateButton templateId={template.id} templateName={template.name} />
      </section>
    </main>
  );
}
