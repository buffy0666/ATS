import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const summarizeCandidateTool = defineTool({
  name: "summarize_candidate",
  description:
    "Produce a deterministic 3-5 line text summary of a candidate from their profile fields. Cheap (no LLM round-trip) and good when the user wants a quick blurb.",
  requiresAdmin: false,
  parameters: z.object({
    candidateId: z.string().min(1).max(40),
  }),
  async execute(args, ctx) {
    const c = await prisma.candidate.findFirst({
      where: { id: args.candidateId, organizationId: ctx.organizationId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        currentTitle: true,
        currentCompany: true,
        yearsExperience: true,
        seniority: true,
        locationCity: true,
        locationState: true,
        locationCountry: true,
        summary: true,
        skills: true,
        status: true,
        source: true,
      },
    });
    if (!c) return { ok: false, error: "Candidate not found." };

    const lines: string[] = [];
    lines.push(`${c.firstName} ${c.lastName} (${c.email}).`);

    const roleParts: string[] = [];
    if (c.currentTitle) roleParts.push(c.currentTitle);
    if (c.currentCompany) roleParts.push(`at ${c.currentCompany}`);
    if (roleParts.length > 0) {
      const exp = c.yearsExperience != null ? ` — ${c.yearsExperience}y experience` : "";
      const lvl = c.seniority ? ` (${c.seniority})` : "";
      lines.push(`${roleParts.join(" ")}${exp}${lvl}.`);
    } else if (c.seniority) {
      lines.push(`Seniority: ${c.seniority}.`);
    }

    const loc = [c.locationCity, c.locationState, c.locationCountry].filter(Boolean).join(", ");
    if (loc) lines.push(`Based in ${loc}.`);

    if (c.summary) lines.push(c.summary);

    if (c.skills.length > 0) {
      lines.push(`Skills: ${c.skills.slice(0, 12).join(", ")}.`);
    }

    const meta: string[] = [`status ${c.status}`];
    if (c.source) meta.push(`source ${c.source}`);
    lines.push(meta.join(" · "));

    return { ok: true, summary: lines.join(" ") };
  },
});
