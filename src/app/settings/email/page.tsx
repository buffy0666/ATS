import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EmailSettingsForm } from "./EmailSettingsForm";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const { orgId } = await requireAdminWithOrg();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { emailOutDisabled: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Email</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Control outbound email for this workspace. This setting is scoped to your
          workspace only — it never affects other tenants.
        </p>
      </div>

      <EmailSettingsForm initialDisabled={Boolean(org?.emailOutDisabled)} />
    </div>
  );
}
