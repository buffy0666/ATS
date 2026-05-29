import { auth } from "@/auth";
import { endImpersonationAction } from "@/app/platform/organizations/[id]/impersonate-actions";

/**
 * Red sticky banner pinned to the top of every page when the current
 * session is an active impersonation. Shows who's wearing whose hat plus
 * an "Exit" button that returns the platform admin to their own identity.
 *
 * Renders nothing for normal users — the auth() call returns no
 * impersonation block.
 */
export async function ImpersonationBanner() {
  const session = await auth();
  if (!session?.impersonation) return null;

  const { realEmail, targetEmail, targetOrgName } = session.impersonation;

  return (
    <div
      data-impersonation-banner
      className="sticky top-0 z-50 bg-red-600 text-white px-4 py-2 text-sm flex items-center justify-between gap-3 shadow"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-semibold uppercase tracking-wider text-[10px] rounded-full bg-white/20 px-2 py-0.5">
          Impersonating
        </span>
        <span className="truncate">
          You ({realEmail}) are signed in as <strong>{targetEmail}</strong> in{" "}
          <strong>{targetOrgName}</strong>. Any action you take is logged.
        </span>
      </div>
      <form action={endImpersonationAction}>
        <button
          type="submit"
          className="shrink-0 rounded-md bg-white text-red-700 hover:bg-red-50 px-3 py-1 text-xs font-semibold"
        >
          Exit impersonation
        </button>
      </form>
    </div>
  );
}
