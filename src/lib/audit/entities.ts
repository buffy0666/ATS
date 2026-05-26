/**
 * Per-entity audit metadata: the allowlist of Prisma models the extension
 * captures CREATE/UPDATE/DELETE for, plus a human-readable label
 * generator so the audit table reads as "Sarah Chen" instead of "c0xyz...".
 *
 * Intentionally NOT marked "server-only" — this module is pure metadata
 * (sets, label maps, a string function) and is imported by both server
 * code (the audit write extension) and client code (the AuditTable
 * component). The previous "server-only" import made the production
 * build fail with "'server-only' cannot be imported from a Client
 * Component module".
 *
 * If anything in here ever starts touching the DB or env vars, MOVE
 * that piece into a server-only file (lib/audit/write.ts is the right
 * home) and keep this module shared.
 */

export const AUDITED_MODELS = new Set<string>([
  "Candidate",
  "Job",
  "Client",
  "ClientContact",
  "Application",
  "Note",
  "Interview",
  "Task",
  "User",
  "Organization",
  "ApiToken",
  "AIConfig",
  "Tag",
  "KnowledgeItem",
]);

/**
 * Snake-case display labels — UI shows the same string the schema uses
 * (PascalCase models, friendlier in admin tables than DB names).
 */
export const ENTITY_LABELS: Record<string, string> = {
  Candidate: "Candidate",
  Job: "Job",
  Client: "Client",
  ClientContact: "Client contact",
  Application: "Application",
  Note: "Note",
  Interview: "Interview",
  Task: "Task",
  User: "User",
  Organization: "Organization",
  ApiToken: "API token",
  AIConfig: "AI config",
  Tag: "Tag",
  KnowledgeItem: "Knowledge item",
};

/**
 * Turns an entity row into a short, human-friendly label that survives
 * deletion — stored on the audit row so the UI doesn't need to dereference
 * a row that may no longer exist.
 *
 * Falls back to the entity's id if no recognizable name field is present.
 */
export function entityLabel(modelName: string, row: Record<string, unknown>): string {
  switch (modelName) {
    case "Candidate":
    case "ClientContact": {
      const first = stringOr(row.firstName, "");
      const last = stringOr(row.lastName, "");
      const combined = `${first} ${last}`.trim();
      return combined || stringOr(row.email, stringOr(row.id, ""));
    }
    case "Job":
      return stringOr(row.title, stringOr(row.id, ""));
    case "Client":
    case "Organization":
    case "Tag":
    case "KnowledgeItem":
    case "Task":
    case "ApiToken":
    case "Interview":
      return stringOr(row.name, stringOr(row.title, stringOr(row.id, "")));
    case "Application":
      return `Application ${stringOr(row.id, "")}`.trim();
    case "Note": {
      const body = stringOr(row.body, "");
      return body.length > 60 ? `${body.slice(0, 60)}…` : body || stringOr(row.id, "");
    }
    case "User": {
      const name = stringOr(row.name, "");
      return name || stringOr(row.email, stringOr(row.id, ""));
    }
    case "AIConfig":
      return "AI provider config";
    default:
      return stringOr(row.id, "");
  }
}

function stringOr(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}
