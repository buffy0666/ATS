"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EmploymentType, RemotePref, WorkAuth } from "@/generated/prisma";

export type QuickEditResult = { ok: true; message: string } | { ok: false; error: string };

const optionalUrl = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      if (!t) return null;
      return /^https?:\/\//i.test(t) ? t : `https://${t}`;
    },
    z.string().url().max(max).nullable(),
  );

const optionalEnum = <T extends Record<string, string>>(e: T) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.nativeEnum(e).nullable());

const enumArray = <T extends Record<string, string>>(e: T) =>
  z.preprocess((v) => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.length > 0);
    return [];
  }, z.array(z.nativeEnum(e)).default([]));

const optionalBool = () =>
  z.preprocess(
    (v) => v === "on" || v === "true" || v === "1",
    z.boolean(),
  );

const schema = z.object({
  workAuthorization: optionalEnum(WorkAuth),
  requiresSponsorship: optionalBool(),
  githubUrl: optionalUrl(300),
  portfolioUrl: optionalUrl(300),
  employmentTypePref: enumArray(EmploymentType),
  remotePref: enumArray(RemotePref),
});

/**
 * Inline edit of a candidate's optional fields from the detail page's
 * "+" expander sections. Org-scoped: the updateMany never reaches across
 * tenants, so a guessed id from another org silently updates nothing.
 */
export async function updateCandidateQuickFields(
  candidateId: string,
  _prev: QuickEditResult | undefined,
  formData: FormData,
): Promise<QuickEditResult> {
  const { orgId } = await requireSessionWithOrg();

  const parsed = schema.safeParse({
    workAuthorization: formData.get("workAuthorization"),
    requiresSponsorship: formData.get("requiresSponsorship"),
    githubUrl: formData.get("githubUrl"),
    portfolioUrl: formData.get("portfolioUrl"),
    employmentTypePref: formData.getAll("employmentTypePref"),
    remotePref: formData.getAll("remotePref"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await prisma.candidate.updateMany({
    where: { id: candidateId, organizationId: orgId },
    data: parsed.data,
  });
  if (result.count === 0) {
    return { ok: false, error: "Candidate not found in your workspace." };
  }

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Saved." };
}
