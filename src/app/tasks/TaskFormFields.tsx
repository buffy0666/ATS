import { TaskStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

export function TaskFormFields({
  defaultName,
  defaultDescription,
  defaultStatus,
}: {
  defaultName?: string;
  defaultDescription?: string;
  defaultStatus?: TaskStatus;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          defaultValue={defaultName}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={defaultStatus ?? TaskStatus.NOT_STARTED}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
        >
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="description">
          Description (HTML allowed)
        </label>
        <textarea
          id="description"
          name="description"
          rows={10}
          defaultValue={defaultDescription}
          placeholder="<p>Plain text or HTML — admins only.</p>"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Rendered as HTML on the task page. Tags like &lt;p&gt;, &lt;a&gt;, &lt;ul&gt; work.
        </p>
      </div>
    </div>
  );
}
