import { auth } from "@/auth";
import { Role } from "@/generated/prisma";
import { SidebarClient } from "./SidebarClient";

export async function Nav() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <SidebarClient
      email={session.user.email}
      role={session.user.role}
      isAdmin={session.user.role === Role.ADMIN}
      organizationName={session.user.organizationName ?? null}
    />
  );
}
