import { requireAdmin } from "@/lib/auth-utils";
import { NewUserForm } from "./NewUserForm";

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New user</h1>
        <NewUserForm />
    </main>
  );
}
