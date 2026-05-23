export const TAG_COLOR_NAMES = [
  "zinc",
  "red",
  "orange",
  "amber",
  "emerald",
  "sky",
  "indigo",
  "purple",
  "pink",
] as const;

export type TagColorName = (typeof TAG_COLOR_NAMES)[number];

/**
 * Deterministically picks a color for a tag name so the same name always gets
 * the same color across all clients/contacts where it appears.
 */
export function tagColorForName(name: string): TagColorName {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TAG_COLOR_NAMES[Math.abs(hash) % TAG_COLOR_NAMES.length];
}

export const TAG_COLOR_CLASS: Record<string, string> = {
  zinc: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
};

export function tagClass(color: string): string {
  return TAG_COLOR_CLASS[color] ?? TAG_COLOR_CLASS.zinc;
}
