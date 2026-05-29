"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const signupSchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
});

export type SignupResult = { ok: true } | { ok: false; error: string };

/**
 * Self-serve signup: creates a new Organization + ADMIN user in a single
 * transaction, then redirects to /login with the email pre-filled so the
 * user signs in normally. We don't programmatically signIn() because
 * NextAuth's credentials flow plays nicest with an explicit form submit
 * and dedicated redirect.
 *
 * Idempotency / errors:
 *  - Email already in use → friendly error (no enumeration risk; we'd
 *    surface the same message whether or not the email is real, but
 *    we accept that trade-off for clarity).
 *  - Slug collision is auto-resolved by appending a short random suffix.
 */
export async function signupAction(
  _prevState: SignupResult,
  formData: FormData,
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    organizationName: formData.get("organizationName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  }
  const { organizationName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "An account with that email already exists. Sign in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = await pickAvailableSlug(slugify(organizationName));

  try {
    await prisma.$transaction(async (tx) => {
      // Create the Organization first, then the user, then set the user
      // as the org's owner. Two writes instead of one because Org and
      // User have a circular FK relationship (User.organizationId →
      // Organization, Organization.ownerUserId → User).
      const org = await tx.organization.create({
        data: { name: organizationName, slug },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          // Signup creates a new tenant → first user becomes its OWNER.
          role: Role.OWNER,
          organizationId: org.id,
        },
        select: { id: true },
      });
      await tx.organization.update({
        where: { id: org.id },
        data: { ownerUserId: user.id },
      });
    });
  } catch (err) {
    // If two requests happen to pick the same slug at the same instant we
    // could still race on Org.slug unique. Surface a generic message;
    // the user can retry.
    const message = err instanceof Error ? err.message : "Signup failed.";
    return {
      ok: false,
      error: message.includes("Unique constraint")
        ? "That workspace name is taken — try a different one."
        : "Couldn't create your workspace. Try again in a moment.",
    };
  }

  // Send them to /login with the email pre-filled. We can't return both
  // ok and redirect, so this throws a Next.js redirect (control never
  // returns to the form).
  redirect(`/login?email=${encodeURIComponent(email)}&fresh=1`);
}

/**
 * Build a URL-safe slug. Conservative — strip everything that isn't a
 * letter, digit, or hyphen, collapse runs, and trim.
 */
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace"
  );
}

/**
 * Try the slug as-is; if taken, append a 4-char random suffix and retry.
 * Race-free under Postgres because Org.slug has a unique constraint —
 * the worst case is the transaction throws and the user retries.
 */
async function pickAvailableSlug(base: string): Promise<string> {
  const existing = await prisma.organization.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing) return base;
  // Try a few random suffixes before giving up; collision odds are tiny.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Extremely unlikely.
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}
