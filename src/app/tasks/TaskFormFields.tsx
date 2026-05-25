import { TaskPriority, TaskStatus } from "@/generated/prisma";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

type UserOption = { id: string; name: string | null; email: string };

export function TaskFormFields({
  defaultName,
  defaultDescription,
  defaultStatus,
  defaultPriority,
  defaultDueDate,
  defaultAssignedToId,
  assignableUsers = [],
}: {
  defaultName?: string;
  defaultDescription?: string;
  defaultStatus?: TaskStatus;
  defaultPriority?: TaskPriority | null;
  defaultDueDate?: Date | null;
  defaultAssignedToId?: string | null;
  assignableUsers?: UserOption[];
}) {
  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100";

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
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaultStatus ?? TaskStatus.NOT_STARTED}
            className={inputCls}
          >
            {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="priority">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={defaultPriority ?? ""}
            className={inputCls}
          >
            <option value="">— None —</option>
            {(Object.keys(TASK_PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="assignedToId">
            Assigned to
          </label>
          <select
            id="assignedToId"
            name="assignedToId"
            defaultValue={defaultAssignedToId ?? ""}
            className={inputCls}
          >
            <option value="">— Unassigned —</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={
              defaultDueDate ? defaultDueDate.toISOString().slice(0, 10) : ""
            }
            className={inputCls}
          />
        </div>
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
