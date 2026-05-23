import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@/generated/prisma";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== Role.ADMIN) {
    redirect("/?error=forbidden");
  }
  return session;
}
