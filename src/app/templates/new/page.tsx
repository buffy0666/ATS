import { createTemplate } from "../actions";
import { TemplateForm } from "../TemplateForm";

export default function NewTemplatePage() {
  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New template</h1>
      <TemplateForm action={createTemplate} submitLabel="Create template" />
    </main>
  );
}
