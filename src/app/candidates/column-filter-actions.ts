"use server";

import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { loadChoiceOptions } from "@/lib/choices";
import { CANDIDATE_STATUS_LABEL } from "@/lib/candidate-status";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import type { ChoiceOptionSource } from "./candidate-columns";

const humanizeEnum = (v: string) => v.replace(/_/g, " ");

/**
 * Resolve the option list for a choice-column filter popover. Static enum /
 * boolean sources don't hit the DB; tags / lists / ChoiceOption-backed
 * sources are org-scoped reads. Returns [] for unknown sources.
 */
export async function loadColumnChoiceOptions(
  source: string,
): Promise<{ value: string; label: string }[]> {
  const { orgId } = await requireSessionWithOrg();

  switch (source as ChoiceOptionSource) {
    case "enum:CandidateStatus":
      // UI labels, not humanized enum names — e.g. BLACKLISTED is surfaced
      // as "Do not submit / Internal block" (see src/lib/candidate-status.ts).
      return Object.values(CandidateStatus).map((v) => ({
        value: v,
        label: CANDIDATE_STATUS_LABEL[v],
      }));
    case "enum:RemotePref":
      return Object.values(RemotePref).map((v) => ({ value: v, label: humanizeEnum(v) }));
    case "enum:WorkAuth":
      return Object.values(WorkAuth).map((v) => ({ value: v, label: humanizeEnum(v) }));
    case "enum:EmploymentType":
      return Object.values(EmploymentType).map((v) => ({ value: v, label: humanizeEnum(v) }));
    case "bool":
      // Boolean columns (willingToRelocate, needsSponsorship) are modelled as
      // a choice with static Yes/No options; values match the boolScalar
      // variant handled in candidate-filter.ts.
      return [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ];
    case "tags": {
      const rows = await prisma.tag.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      return rows.map((r) => ({ value: r.name, label: r.name }));
    }
    case "lists": {
      const rows = await prisma.candidateList.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      return rows.map((r) => ({ value: r.name, label: r.name }));
    }
    default: {
      if (typeof source === "string" && source.startsWith("choice:")) {
        const field = source.slice("choice:".length);
        const rows = await loadChoiceOptions(field, orgId);
        return rows.map((r) => ({ value: r.name, label: r.name }));
      }
      return [];
    }
  }
}
