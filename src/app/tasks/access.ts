import type { Prisma, Role } from "@/generated/prisma";
import { isAdminOrAbove } from "@/lib/auth-utils";

/**
 * Task visibility in the user area:
 *   - OWNER / ADMIN see every task in the org.
 *   - RECRUITER sees only tasks they created or that are assigned to them.
 *
 * Returns a WHERE fragment to AND into a task query (`organizationId` is added
 * by the caller). Empty object for admins so they see everything. The same
 * fragment gates reads (list / detail) and writes (update / delete / bulk) so a
 * recruiter can never touch a task that isn't theirs, even via a guessed id.
 */
export function taskVisibilityWhere(
  role: Role | null | undefined,
  userId: string,
): Prisma.TaskWhereInput {
  if (isAdminOrAbove(role)) return {};
  return { OR: [{ createdById: userId }, { assignedToId: userId }] };
}
