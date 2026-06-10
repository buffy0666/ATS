import "server-only";

import { Role } from "@/generated/prisma";
import type { AssistantTool } from "./types";

import { searchCandidatesTool } from "./search-candidates";
import { listJobsTool } from "./list-jobs";
import { listClientsTool } from "./list-clients";
import { listListsTool } from "./list-lists";
import { getCandidateTool } from "./get-candidate";
import { getJobTool } from "./get-job";
import { summarizeCandidateTool } from "./summarize-candidate";
import { recommendCandidatesForJobTool } from "./recommend-candidates-for-job";
import { createListTool } from "./create-list";
import { createSavedSearchTool } from "./create-saved-search";
import { addToListTool } from "./add-to-list";
import { tagCandidatesTool } from "./tag-candidates";
import { enrollInSequenceTool } from "./enroll-in-sequence";
import { emailCandidateTool } from "./email-candidate";
import { moveApplicationStageTool } from "./move-application-stage";
import { listUsersTool } from "./list-users";
import { createUserTool } from "./create-user";
import { updateUserRoleTool } from "./update-user-role";
import { deactivateUserTool } from "./deactivate-user";

/** Master registry — order matters only for stable display in system prompts. */
export const ALL_TOOLS: AssistantTool[] = [
  // Read
  searchCandidatesTool,
  listJobsTool,
  listClientsTool,
  listListsTool,
  getCandidateTool,
  getJobTool,
  summarizeCandidateTool,
  recommendCandidatesForJobTool,
  // Write (general)
  createListTool,
  createSavedSearchTool,
  addToListTool,
  tagCandidatesTool,
  enrollInSequenceTool,
  emailCandidateTool,
  moveApplicationStageTool,
  // Admin
  listUsersTool,
  createUserTool,
  updateUserRoleTool,
  deactivateUserTool,
];

/**
 * Filter the master registry to the tools a given role is allowed to see.
 * Non-admins never receive the admin-only tools in their tool list, which
 * means the model can't even attempt to call them.
 */
export function getAvailableTools(role: Role): AssistantTool[] {
  // Both OWNER and ADMIN are "admin-tier" for tool gating purposes.
  if (role === Role.OWNER || role === Role.ADMIN) return ALL_TOOLS;
  return ALL_TOOLS.filter((t) => !t.requiresAdmin);
}

/**
 * Look up a tool by name from the master registry. Returns null for unknown
 * names — used by the orchestrator to reject hallucinated tool calls.
 */
export function findToolByName(name: string): AssistantTool | null {
  return ALL_TOOLS.find((t) => t.name === name) ?? null;
}

export type { AssistantTool, ToolContext } from "./types";
