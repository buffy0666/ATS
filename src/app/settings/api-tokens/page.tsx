import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { TokensTable } from "./TokensTable";

export default async function ApiTokensPage() {
  const session = await requireSession();

  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">API tokens</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tokens authenticate external tools (Chrome extension, scripts, integrations) as you.
          Treat them like passwords — anyone with one can act on your behalf until you revoke it.
        </p>
      </div>
      <TokensTable tokens={tokens} />

      <section className="mt-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 text-sm">
        <h2 className="font-semibold mb-2">Using a token</h2>
        <p className="mb-2 text-zinc-600 dark:text-zinc-400">
          For the Chrome extension: open the extension popup, paste your ATS URL and token into the
          settings fields, save. Then navigate to any LinkedIn profile and click <em>Add to ATS</em>.
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          For other tools: send the token in an <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code> header
          to <code className="font-mono text-xs">/api/external/candidates</code>.
        </p>
      </section>
    </div>
  );
}
