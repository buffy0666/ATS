/**
 * Shared (client-safe) custom-field types and constants.
 *
 * Anything in this file may be imported from client components. Server-only
 * code (DB queries) lives in `./custom-fields.ts` which guards itself with
 * `import "server-only"`.
 *
 * Splitting these two avoids a Next.js build error where Client Component
 * modules cannot transitively import "server-only", even via type-only
 * imports — the bundler still pulls in the file for module side effects.
 */

import { CustomFieldEntity, CustomFieldType, type CustomField } from "@/generated/prisma";

export const CUSTOM_FIELD_ENTITY_LABEL: Record<CustomFieldEntity, string> = {
  CLIENT: "Clients",
  CLIENT_CONTACT: "Client contacts",
  CANDIDATE: "Candidates",
  INTERVIEW: "Interviews",
  TASK: "Tasks",
  JOB: "Jobs",
  USER: "Users",
};

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / no",
  SELECT: "Single select",
  MULTI_SELECT: "Multi select",
  URL: "URL",
  EMAIL: "Email",
};

export type CustomFieldRow = Pick<
  CustomField,
  | "id"
  | "entity"
  | "key"
  | "label"
  | "type"
  | "helpText"
  | "required"
  | "options"
  | "sortOrder"
  | "active"
>;
