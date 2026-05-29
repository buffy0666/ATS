import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { BrandingForm } from "./BrandingForm";

export default async function BrandingSettingsPage() {
  const { session, orgId } = await requireSessionWithOrg();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true },
  });
  return (
    <BrandingForm
      currentLogoUrl={org?.logoUrl ?? null}
      isAdmin={isAdminOrAbove(session.user.role)}
    />
  );
}
