import "server-only";

import { z } from "zod";
import { enrollCandidatesInSequence } from "@/app/sequences/actions";
import { defineTool } from "./types";

export const enrollInSequenceTool = defineTool({
  name: "enroll_in_sequence",
  description:
    "Enroll one or more candidates into a sequence. Step runs are scheduled from now; email steps are handed off to the provider immediately. Already-enrolled candidates are skipped.",
  requiresAdmin: false,
  parameters: z.object({
    sequenceId: z.string().min(1).max(40),
    candidateIds: z.array(z.string().min(1).max(40)).min(1).max(500),
  }),
  async execute(args) {
    const result = await enrollCandidatesInSequence(args.candidateIds, args.sequenceId);
    return result;
  },
});
