import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";
import { defineTool } from "./types";

export const moveApplicationStageTool = defineTool({
  name: "move_application_stage",
  description:
    "Move an application to a different pipeline stage (APPLIED, SCREEN, INTERVIEW, OFFER, HIRED, REJECTED). Identify the application by its id; you can find ids via get_candidate or get_job.",
  requiresAdmin: false,
  parameters: z.object({
    applicationId: z.string().min(1).max(40),
    stage: z.nativeEnum(Stage),
  }),
  async execute(args, ctx) {
    const before = await prisma.application.findFirst({
      where: { id: args.applicationId, organizationId: ctx.organizationId },
      select: {
        id: true,
        stage: true,
        candidate: { select: { firstName: true, lastName: true } },
        job: { select: { id: true, title: true } },
      },
    });
    if (!before) return { ok: false, error: "Application not found." };
    if (before.stage === args.stage) {
      return {
        ok: true,
        unchanged: true,
        applicationId: before.id,
        stage: before.stage,
        message: `Already at stage ${before.stage}.`,
      };
    }
    const after = await prisma.application.update({
      where: { id: args.applicationId },
      data: { stage: args.stage },
      select: { id: true, stage: true, jobId: true },
    });
    return {
      ok: true,
      applicationId: after.id,
      previousStage: before.stage,
      newStage: after.stage,
      candidate: `${before.candidate.firstName} ${before.candidate.lastName}`,
      jobTitle: before.job.title,
    };
  },
});
