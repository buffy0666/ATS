/**
 * Top-of-dashboard branding band. Only renders when the workspace has
 * uploaded a logo (admins set it under /settings/branding); otherwise the
 * Greeting block immediately below carries the welcome.
 *
 * Renders the logo at ~96 px tall (the recommended-size hint in the upload
 * form is matched to this).
 */
export function WorkspaceBanner({
  logoUrl,
  organizationName,
}: {
  logoUrl: string | null;
  organizationName: string | null;
}) {
  if (!logoUrl) return null;
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 px-6 py-5 flex items-center gap-5 shadow-sm">
      <div className="h-24 w-24 shrink-0 rounded-md bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={organizationName ?? "Workspace logo"}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      {organizationName && (
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Workspace</div>
          <h2 className="mt-0.5 text-2xl font-semibold truncate">{organizationName}</h2>
        </div>
      )}
    </section>
  );
}
