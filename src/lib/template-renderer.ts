/**
 * Mustache-style placeholder renderer for email templates.
 *
 * Supports nested keys like {{candidate.firstName}}, {{sender.email}}, {{job.title}}.
 * Unknown placeholders are replaced with an empty string (so a missing job
 * doesn't leave "{{job.title}}" in the rendered output).
 */
export type TemplateContext = Record<string, string | null | undefined>;

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = ctx[key];
    return value == null ? "" : String(value);
  });
}

export const TEMPLATE_PLACEHOLDERS = [
  "candidate.firstName",
  "candidate.lastName",
  "candidate.email",
  "candidate.phone",
  "sender.name",
  "sender.email",
  "job.title",
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];
