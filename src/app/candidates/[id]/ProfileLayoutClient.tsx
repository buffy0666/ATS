"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_PROFILE_FIELD_KEYS,
  DEFAULT_PROFILE_LAYOUT,
  PROFILE_FIELD_LABELS,
  PROFILE_LAYOUT_STORAGE_KEY,
  parseProfileLayout,
  sanitizeProfileLayout,
  type ProfileFieldKey,
  type ProfileLayoutConfig,
} from "./profile-fields";
import {
  createProfileLayout,
  deleteProfileLayout,
  updateProfileLayout,
} from "./profile-layout-actions";

type Scope = "PERSONAL" | "SHARED";

export type ProfileFieldNode = { key: string; label: string; node: React.ReactNode };

export type SavedProfileLayout = {
  id: string;
  name: string;
  scope: Scope;
  config: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
};

// Each field's default "home" section, so re-adding a hidden field lands
// somewhere sensible.
const HOME_SECTION = new Map<ProfileFieldKey, string>();
for (const s of DEFAULT_PROFILE_LAYOUT.sections) {
  for (const f of s.fields) HOME_SECTION.set(f, s.title);
}

export function ProfileLayoutClient({
  fields,
  savedLayouts,
  currentUserId,
}: {
  fields: ProfileFieldNode[];
  savedLayouts: SavedProfileLayout[];
  currentUserId: string;
}) {
  const router = useRouter();
  const nodeByKey = useMemo(() => new Map(fields.map((f) => [f.key, f.node])), [fields]);

  const [config, setConfig] = useState<ProfileLayoutConfig>(DEFAULT_PROFILE_LAYOUT);
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveScope, setSaveScope] = useState<Scope>("PERSONAL");
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Hydrate the working layout from localStorage (per browser), else default.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_LAYOUT_STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeProfileLayout(JSON.parse(raw));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage on mount
        if (parsed) setConfig(parsed);
      }
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, []);

  // Persist working layout on change (after hydration so we don't clobber it).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PROFILE_LAYOUT_STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [config, hydrated]);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function flash(tone: "ok" | "err", text: string) {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 4000);
  }

  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    config.sections.forEach((sec) => sec.fields.forEach((f) => s.add(f)));
    return s;
  }, [config]);

  const hiddenFields = useMemo(
    () => ALL_PROFILE_FIELD_KEYS.filter((k) => !usedKeys.has(k)),
    [usedKeys],
  );

  // ---- layout mutations -------------------------------------------------
  function moveField(key: string, toSection: number, beforeKey: string | null) {
    setConfig((cur) => {
      const sections = cur.sections.map((s) => ({
        ...s,
        fields: s.fields.filter((f) => f !== key),
      }));
      const target = sections[toSection];
      if (!target) return cur;
      const idx = beforeKey ? target.fields.indexOf(beforeKey as ProfileFieldKey) : -1;
      if (idx === -1) target.fields.push(key as ProfileFieldKey);
      else target.fields.splice(idx, 0, key as ProfileFieldKey);
      return { sections };
    });
  }

  function hideField(key: string) {
    setConfig((cur) => ({
      sections: cur.sections.map((s) => ({
        ...s,
        fields: s.fields.filter((f) => f !== key),
      })),
    }));
  }

  function showField(key: ProfileFieldKey) {
    const home = HOME_SECTION.get(key);
    const target = config.sections.findIndex((s) => s.title === home);
    moveField(key, target >= 0 ? target : 0, null);
  }

  function resetDefault() {
    setConfig(DEFAULT_PROFILE_LAYOUT);
    flash("ok", "Layout reset to default.");
  }

  // ---- saved layouts ----------------------------------------------------
  function applyLayout(l: SavedProfileLayout) {
    setConfig(parseProfileLayout(l.config));
    setMenuOpen(false);
    flash("ok", `Applied “${l.name}”.`);
  }

  function saveCurrent() {
    if (!saveName.trim()) return;
    startTransition(async () => {
      const r = await createProfileLayout({
        name: saveName.trim(),
        scope: saveScope,
        config: JSON.stringify(config),
      });
      if (r.ok) {
        setSaveName("");
        flash("ok", "Layout saved.");
        router.refresh();
      } else {
        flash("err", r.error);
      }
    });
  }

  function overwriteLayout(l: SavedProfileLayout) {
    startTransition(async () => {
      const r = await updateProfileLayout(l.id, { config: JSON.stringify(config) });
      if (r.ok) {
        flash("ok", `Updated “${l.name}”.`);
        router.refresh();
      } else flash("err", r.error);
    });
  }

  function renameLayout(l: SavedProfileLayout) {
    const name = prompt("Rename layout", l.name);
    if (!name || !name.trim() || name.trim() === l.name) return;
    startTransition(async () => {
      const r = await updateProfileLayout(l.id, { name: name.trim() });
      if (r.ok) router.refresh();
      else flash("err", r.error);
    });
  }

  function toggleScope(l: SavedProfileLayout) {
    const next: Scope = l.scope === "SHARED" ? "PERSONAL" : "SHARED";
    startTransition(async () => {
      const r = await updateProfileLayout(l.id, { scope: next });
      if (r.ok) router.refresh();
      else flash("err", r.error);
    });
  }

  function removeLayout(l: SavedProfileLayout) {
    if (!confirm(`Delete layout “${l.name}”?`)) return;
    startTransition(async () => {
      const r = await deleteProfileLayout(l.id);
      if (r.ok) router.refresh();
      else flash("err", r.error);
    });
  }

  const personal = savedLayouts.filter((l) => l.ownerId === currentUserId);
  const shared = savedLayouts.filter((l) => l.scope === "SHARED" && l.ownerId !== currentUserId);

  return (
    <div>
      {/* Header controls */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">
          {editing ? "Drag fields to reorder, hide, or move between sections." : "Click any field below to edit it."}
        </p>
        <div className="relative flex items-center gap-2" ref={menuRef}>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              editing
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {editing ? "Done" : "Edit layout"}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Layout ▾
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-30 w-72 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              {/* Save current */}
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Save current layout
              </div>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Layout name"
                maxLength={120}
                className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <div className="mb-2 flex items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={saveScope === "PERSONAL"}
                    onChange={() => setSaveScope("PERSONAL")}
                  />
                  Personal
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={saveScope === "SHARED"}
                    onChange={() => setSaveScope("SHARED")}
                  />
                  Shared
                </label>
                <button
                  type="button"
                  onClick={saveCurrent}
                  disabled={pending || !saveName.trim()}
                  className="ml-auto rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Save
                </button>
              </div>

              <button
                type="button"
                onClick={resetDefault}
                className="mb-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Reset to default
              </button>

              {(personal.length > 0 || shared.length > 0) && (
                <div className="mt-1 max-h-60 space-y-3 overflow-y-auto border-t border-zinc-200 pt-2 dark:border-zinc-800">
                  {personal.length > 0 && (
                    <LayoutGroup
                      title="Personal"
                      layouts={personal}
                      ownable
                      onApply={applyLayout}
                      onOverwrite={overwriteLayout}
                      onRename={renameLayout}
                      onToggleScope={toggleScope}
                      onDelete={removeLayout}
                      pending={pending}
                    />
                  )}
                  {shared.length > 0 && (
                    <LayoutGroup
                      title="Shared"
                      layouts={shared}
                      ownable={false}
                      onApply={applyLayout}
                      onOverwrite={overwriteLayout}
                      onRename={renameLayout}
                      onToggleScope={toggleScope}
                      onDelete={removeLayout}
                      pending={pending}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {banner && (
        <p
          className={`mb-3 text-xs ${
            banner.tone === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {banner.text}
        </p>
      )}

      {editing ? (
        <EditCanvas
          config={config}
          hiddenFields={hiddenFields}
          dragKey={dragKey}
          setDragKey={setDragKey}
          moveField={moveField}
          hideField={hideField}
          showField={showField}
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-2">
          {config.sections
            .filter((s) => s.fields.length > 0)
            .map((s) => (
              <section key={s.title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {s.title}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {s.fields.map((k) => (
                    <div key={k}>{nodeByKey.get(k) ?? null}</div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function LayoutGroup({
  title,
  layouts,
  ownable,
  onApply,
  onOverwrite,
  onRename,
  onToggleScope,
  onDelete,
  pending,
}: {
  title: string;
  layouts: SavedProfileLayout[];
  ownable: boolean;
  onApply: (l: SavedProfileLayout) => void;
  onOverwrite: (l: SavedProfileLayout) => void;
  onRename: (l: SavedProfileLayout) => void;
  onToggleScope: (l: SavedProfileLayout) => void;
  onDelete: (l: SavedProfileLayout) => void;
  pending: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </div>
      <ul className="space-y-1">
        {layouts.map((l) => (
          <li key={l.id} className="group flex items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => onApply(l)}
              className="flex-1 truncate rounded px-1 py-0.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={ownable ? l.name : `${l.name} — ${l.ownerName ?? l.ownerEmail}`}
            >
              {l.name}
              {!ownable && (
                <span className="ml-1 text-xs text-zinc-400">· {l.ownerName ?? l.ownerEmail}</span>
              )}
            </button>
            {ownable && (
              <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <IconBtn label="Update to current" onClick={() => onOverwrite(l)} disabled={pending}>
                  ⤓
                </IconBtn>
                <IconBtn label="Rename" onClick={() => onRename(l)} disabled={pending}>
                  ✎
                </IconBtn>
                <IconBtn label={l.scope === "SHARED" ? "Unshare" : "Share"} onClick={() => onToggleScope(l)} disabled={pending}>
                  {l.scope === "SHARED" ? "🡐" : "🡒"}
                </IconBtn>
                <IconBtn label="Delete" onClick={() => onDelete(l)} disabled={pending} danger>
                  ✕
                </IconBtn>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-1 text-xs leading-none disabled:opacity-40 ${
        danger
          ? "text-red-500 hover:text-red-700"
          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function EditCanvas({
  config,
  hiddenFields,
  dragKey,
  setDragKey,
  moveField,
  hideField,
  showField,
}: {
  config: ProfileLayoutConfig;
  hiddenFields: ProfileFieldKey[];
  dragKey: string | null;
  setDragKey: (k: string | null) => void;
  moveField: (key: string, toSection: number, beforeKey: string | null) => void;
  hideField: (key: string) => void;
  showField: (key: ProfileFieldKey) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {config.sections.map((s, si) => (
          <section
            key={s.title}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragKey) moveField(dragKey, si, null);
              setDragKey(null);
            }}
            className="rounded-md border border-dashed border-zinc-300 p-2 dark:border-zinc-700"
          >
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {s.title}
            </h2>
            {s.fields.length === 0 ? (
              <p className="px-1 py-2 text-xs text-zinc-400">Drop fields here</p>
            ) : (
              <ul className="space-y-1">
                {s.fields.map((k) => (
                  <li
                    key={k}
                    draggable
                    onDragStart={() => setDragKey(k)}
                    onDragEnd={() => setDragKey(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragKey && dragKey !== k) moveField(dragKey, si, k);
                      setDragKey(null);
                    }}
                    className={`flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950 ${
                      dragKey === k ? "opacity-40" : ""
                    }`}
                  >
                    <span className="cursor-grab text-zinc-400" aria-hidden>
                      ⠿
                    </span>
                    <span className="flex-1 truncate">{PROFILE_FIELD_LABELS[k]}</span>
                    <button
                      type="button"
                      onClick={() => hideField(k)}
                      title="Hide field"
                      aria-label={`Hide ${PROFILE_FIELD_LABELS[k]}`}
                      className="rounded px-1 text-xs text-zinc-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* Hidden / available fields tray */}
      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragKey) hideField(dragKey);
          setDragKey(null);
        }}
        className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950"
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Hidden fields {hiddenFields.length > 0 && `(${hiddenFields.length})`}
        </h2>
        {hiddenFields.length === 0 ? (
          <p className="text-xs text-zinc-400">All fields are shown. Drag a field here to hide it.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hiddenFields.map((k) => (
              <button
                key={k}
                type="button"
                draggable
                onDragStart={() => setDragKey(k)}
                onDragEnd={() => setDragKey(null)}
                onClick={() => showField(k)}
                title="Click or drag to show"
                className="cursor-grab rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                + {PROFILE_FIELD_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
