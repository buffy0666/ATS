"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-utils";
import { disconnectMailbox } from "@/lib/email/mailbox";

export type MailboxActionResult = { ok: true } | { ok: false; error: string };

/** Disconnect the current user's Gmail sending mailbox. */
export async function disconnectMyMailbox(): Promise<MailboxActionResult> {
  const session = await requireSession();
  if (!session.user.id) return { ok: false, error: "Not signed in." };
  await disconnectMailbox(session.user.id);
  revalidatePath("/profile");
  return { ok: true };
}
