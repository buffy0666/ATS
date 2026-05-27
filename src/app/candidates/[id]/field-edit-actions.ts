"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";

export type FieldEditResult = { ok: true } | { ok: false; error: string };

// The serializable shape the inline editor sends. Coercion below turns each
// of these into the right Prisma column type.
export type FieldEditValue = string | string[] | boolean | null;

type FieldKind =
  | { kind: "string"; max: number; required?: boolean; email?: boolean; defaultIfEmpty?: string }
  | { kind: "url"; max: number }
  | { kind: "int"; min?: number; max?: number }
  | { kind: "date" }
  | { kind: "bool" }
  | { kind: "enum"; values: readonly string[]; required?: boolean }
  | { kind: "enumArray"; values: readonly string[] }
  | { kind: "stringArray"; maxItemLen: number; url?: boolean };

// Allowlist. Anything not here is rejected — action-driven/system fields
// (createdAt, sourcedBy, referredBy, lastContactedAt, unsubscribedAt, resume)
// are intentionally absent and stay read-only.
const FIELDS: Record<string, FieldKind> = {
  firstName: { kind: "string", max: 120, required: true },
  lastName: { kind: "string", max: 120, required: true },
  preferredName: { kind: "string", max: 120 },
  pronouns: { kind: "string", max: 60 },
  email: { kind: "string", max: 200, required: true, email: true },
  alternateEmail: { kind: "string", max: 200, email: true },
  phone: { kind: "string", max: 60 },
  alternatePhone: { kind: "string", max: 60 },
  locationCity: { kind: "string", max: 120 },
  locationState: { kind: "string", max: 120 },
  locationCountry: { kind: "string", max: 120 },
  timezone: { kind: "string", max: 60 },
  willingToRelocate: { kind: "bool" },
  workAuthorization: { kind: "enum", values: Object.values(WorkAuth) },
  requiresSponsorship: { kind: "bool" },
  currentTitle: { kind: "string", max: 200 },
  currentCompany: { kind: "string", max: 200 },
  yearsExperience: { kind: "int", min: 0, max: 80 },
  seniority: { kind: "string", max: 80 },
  desiredSalaryMin: { kind: "int", min: 0 },
  desiredSalaryMax: { kind: "int", min: 0 },
  currentSalary: { kind: "int", min: 0 },
  salaryCurrency: { kind: "string", max: 8, defaultIfEmpty: "USD" },
  availableFrom: { kind: "date" },
  noticePeriodDays: { kind: "int", min: 0, max: 365 },
  employmentTypePref: { kind: "enumArray", values: Object.values(EmploymentType) },
  remotePref: { kind: "enumArray", values: Object.values(RemotePref) },
  industries: { kind: "stringArray", maxItemLen: 60 },
  specialties: { kind: "stringArray", maxItemLen: 60 },
  linkedinUrl: { kind: "url", max: 300 },
  githubUrl: { kind: "url", max: 300 },
  portfolioUrl: { kind: "url", max: 300 },
  otherUrls: { kind: "stringArray", maxItemLen: 300, url: true },
  source: { kind: "string", max: 80 },
  sourceDetail: { kind: "string", max: 200 },
  status: { kind: "enum", values: Object.values(CandidateStatus), required: true },
  rating: { kind: "int", min: 0, max: 5 },
  nextFollowUpAt: { kind: "date" },
  skills: { kind: "stringArray", maxItemLen: 60 },
};

class FieldError extends Error {}

function normalizeUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function assertUrl(raw: string, max: number, label: string): string {
  const url = normalizeUrl(raw);
  if (url.length > max) throw new FieldError(`${label} is too long.`);
  try {
    new URL(url);
  } catch {
    throw new FieldError(`"${raw}" isn't a valid URL.`);
  }
  return url;
}

function coerce(cfg: FieldKind, raw: FieldEditValue): unknown {
  switch (cfg.kind) {
    case "string": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) {
        if (cfg.required) throw new FieldError("This field can't be empty.");
        if (cfg.defaultIfEmpty) return cfg.defaultIfEmpty;
        return null;
      }
      if (s.length > cfg.max) throw new FieldError(`Too long (max ${cfg.max} characters).`);
      if (cfg.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new FieldError(`"${s}" isn't a valid email address.`);
      }
      return s;
    }
    case "url": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return null;
      return assertUrl(s, cfg.max, "URL");
    }
    case "int": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new FieldError("Enter a whole number.");
      }
      if (cfg.min != null && n < cfg.min) throw new FieldError(`Must be at least ${cfg.min}.`);
      if (cfg.max != null && n > cfg.max) throw new FieldError(`Must be at most ${cfg.max}.`);
      return n;
    }
    case "date": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) return null;
      const d = new Date(`${s}T00:00:00`);
      if (Number.isNaN(d.getTime())) throw new FieldError("Enter a valid date.");
      return d;
    }
    case "bool":
      return raw === true || raw === "true";
    case "enum": {
      const s = typeof raw === "string" ? raw.trim() : "";
      if (!s) {
        if (cfg.required) throw new FieldError("Pick a value.");
        return null;
      }
      if (!cfg.values.includes(s)) throw new FieldError("Pick a valid option.");
      return s;
    }
    case "enumArray": {
      const arr = Array.isArray(raw) ? raw : [];
      return arr.filter((x) => typeof x === "string" && cfg.values.includes(x));
    }
    case "stringArray": {
      const arr = Array.isArray(raw) ? raw : [];
      const out: string[] = [];
      for (const item of arr) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (!t) continue;
        if (cfg.url) {
          out.push(assertUrl(t, cfg.maxItemLen, "URL"));
        } else {
          if (t.length > cfg.maxItemLen) throw new FieldError(`"${t}" is too long.`);
          out.push(t);
        }
      }
      return Array.from(new Set(out));
    }
  }
}

/**
 * Inline single-field edit from the candidate detail page. Org-scoped via
 * updateMany so a guessed id from another tenant updates nothing. Each
 * field is validated against the FIELDS allowlist — fields driven by other
 * actions (sourcedBy, lastContactedAt, createdAt, unsubscribe) aren't listed
 * and therefore can't be set here.
 */
export async function updateCandidateField(
  candidateId: string,
  field: string,
  value: FieldEditValue,
): Promise<FieldEditResult> {
  const { orgId } = await requireSessionWithOrg();

  const cfg = FIELDS[field];
  if (!cfg) return { ok: false, error: "That field can't be edited here." };

  let data: Record<string, unknown>;
  try {
    data = { [field]: coerce(cfg, value) };
  } catch (e) {
    return { ok: false, error: e instanceof FieldError ? e.message : "Invalid value." };
  }

  try {
    const result = await prisma.candidate.updateMany({
      where: { id: candidateId, organizationId: orgId },
      data,
    });
    if (result.count === 0) {
      return { ok: false, error: "Candidate not found in your workspace." };
    }
  } catch (e) {
    // Most likely the per-org unique email constraint.
    if (field === "email") {
      return { ok: false, error: "Another candidate in your workspace already uses that email." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}
