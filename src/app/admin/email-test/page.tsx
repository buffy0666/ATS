import { requireAdmin } from "@/lib/auth-utils";
import { EmailTestForm } from "./EmailTestForm";

export default async function EmailTestPage() {
  await requireAdmin();

  const provider = process.env.EMAIL_PROVIDER ?? "resend";
  const fromDefault = process.env.EMAIL_FROM_DEFAULT ?? "(not set)";

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Email test</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Send a one-off email through the configured provider. Useful for verifying
          API keys and DNS / sender setup.
        </p>
        <div className="mt-3 text-xs text-zinc-500 space-x-3">
          <span>
            Provider: <code className="font-mono">{provider}</code>
          </span>
          <span>
            Default from: <code className="font-mono">{fromDefault}</code>
          </span>
        </div>
      </div>

      <EmailTestForm fromDefault={fromDefault} />
    </main>
  );
}
