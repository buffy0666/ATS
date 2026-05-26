"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeOrgLogo, uploadOrgLogo, type LogoActionResult } from "./actions";

export function BrandingForm({
  currentLogoUrl,
  isAdmin,
}: {
  currentLogoUrl: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function showResult(r: LogoActionResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    setTimeout(() => setBanner(null), 5000);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function handleUpload(formData: FormData) {
    startTransition(async () => {
      const r = await uploadOrgLogo(formData);
      showResult(r);
      if (r.ok) {
        setPreviewUrl(null);
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function handleRemove() {
    if (!confirm("Remove the workspace logo? It'll fall back to the org name.")) return;
    startTransition(async () => {
      const r = await removeOrgLogo();
      showResult(r);
      if (r.ok) {
        setPreviewUrl(null);
        router.refresh();
      }
    });
  }

  const displayedUrl = previewUrl ?? currentLogoUrl;

  return (
    <div className="space-y-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
      <div>
        <h2 className="text-lg font-semibold">Workspace logo</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Appears in the sidebar and on the dashboard for everyone in your workspace.
        </p>
      </div>

      <div className="flex items-start gap-6">
        <div className="shrink-0">
          <div className="h-24 w-24 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center overflow-hidden">
            {displayedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayedUrl}
                alt="Workspace logo preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-zinc-400 px-2 text-center">No logo</span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-zinc-400 text-center">Sidebar preview</p>
        </div>

        <form
          ref={formRef}
          action={handleUpload}
          className="flex-1 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="logo">
              Upload a JPG or PNG
            </label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/jpeg,image/png"
              disabled={!isAdmin || pending}
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
            />
          </div>

          <ul className="text-xs text-zinc-500 space-y-0.5 list-disc list-inside">
            <li>
              <strong>Format:</strong> JPG or PNG only. (PNG with a transparent background looks
              best in dark mode.)
            </li>
            <li>
              <strong>Recommended size:</strong> ~256 × 256 px (square) or 512 × 128 px (wide).
              We resize to fit; oversized files just waste bandwidth.
            </li>
            <li>
              <strong>Max file size:</strong> 2 MB.
            </li>
            <li>
              <strong>Where it shows:</strong> top-left of the sidebar (~40 px tall) and on the
              dashboard greeting (~96 px tall).
            </li>
          </ul>

          {banner && (
            <p
              className={`text-sm ${
                banner.tone === "ok"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
              aria-live="polite"
            >
              {banner.text}
            </p>
          )}

          {!isAdmin && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Only workspace admins can change the logo.
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={!isAdmin || pending || !previewUrl}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Uploading…" : currentLogoUrl ? "Replace logo" : "Upload logo"}
            </button>
            {currentLogoUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={!isAdmin || pending}
                className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
