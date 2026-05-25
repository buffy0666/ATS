"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@/generated/prisma";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizationName: z.string().trim().min(1).max(120),
});

export type CreateOrgResult = { ok: true } | { ok: false; error: string };

/**
 * Used by /onboarding/create-organization. The user is already authenticated
 * but somehow has no organizationId — usually because they predate the
 * multi-tenant migration. We create an Organization, attach the user as
 * ADMIN + owner, then sign them out so the next login re-issues a JWT
 * with the new organizationId in it (otherwise they'd loop right back
 * here on every protected page).
 */
export async function createOrganizationAction(
  _prevState: CreateOrgResult,
  formData: FormData,
): Promise<CreateOrgResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }
  if (session.user.organizationId) {
    redirect("/");
  }

  const parsed = schema.safeParse({
    organizationName: formData.get("organizationName"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid workspace name.",
    };
  }
  const { organizationName } = parsed.data;
  const userId = session.user.id;

  const slug = await pickAvailableSlug(slugify(organizationName));

  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: organizationName, slug, ownerUserId: userId },
        select: { id: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: org.id,
          // Promote to ADMIN since they're the founder of this workspace.
          role: Role.ADMIN,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed.";
    return {
      ok: false,
      error: message.includes("Unique constraint")
        ? "That workspace name is taken — try a different one."
        : "Couldn't create your workspace. Try again.",
    };
  }

  // JWT was issued without organizationId — sign out so the next sign-in
  // picks up the new tenant context. NextAuth doesn't expose a clean
  // "rotate token" path with the credentials provider, so this is the
  // pragmatic move. signOut() will redirect to /login.
  await signOut({ redirectTo: "/login?fresh=1" });
  // Unreachable — signOut throws a redirect.
  return { ok: true };
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace"
  );
}

async function pickAvailableSlug(base: string): Promise<string> {
  const existing = await prisma.organization.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}
