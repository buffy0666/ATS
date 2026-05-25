import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EnrollmentStatus, SequenceStatus } from "@/generated/prisma";
import { deleteSequence, updateSequenceMeta } from "../actions";
import { StepBuilder, type StepRow, type TemplateOption } from "./StepBuilder";
import { DeleteSequenceButton } from "./DeleteSequenceButton";

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireSessionWithOrg();

  const [sequence, templates] = await Promise.all([
    prisma.sequence.findFirst({
      where: { id, organizationId: orgId },
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { enrollments: true } },
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          select: { id: true },
        },
      },
    }),
    prisma.emailTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, body: true },
    }),
  ]);

  if (!sequence) notFound();

  const stepRows: StepRow[] = sequence.steps.map((s) => ({
    id: s.id,
    order: s.order,
    type: s.type,
    delayDays: s.delayDays,
    emailTemplateId: s.emailTemplateId,
    subject: s.subject,
    body: s.body,
    taskTitle: s.taskTitle,
    taskInstructions: s.taskInstructions,
  }));

  const templateOptions: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
  }));

  async function handleMetaSave(formData: FormData) {
    "use server";
    await updateSequenceMeta(id, formData);
  }

  async function handleDelete() {
    "use server";
    await deleteSequence(id);
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      <Link href="/sequences" className="text-sm text-zinc-500 hover:underline">
        ← All sequences
      </Link>

      <div className="mt-1 mb-6 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{sequence.name}</h1>
        <Link
          href={`/sequences/${sequence.id}/enrollments`}
          className="text-sm text-zinc-500 hover:underline"
        >
          {sequence._count.enrollments} enrollment{sequence._count.enrollments === 1 ? "" : "s"}
          {" "}
          ({sequence.enrollments.length} active) →
        </Link>
      </div>

      <form
        action={handleMetaSave}
        className="mb-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Sequence details
        </h2>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={sequence.name}
            required
            maxLength={160}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={sequence.description ?? ""}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={sequence.status}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value={SequenceStatus.ACTIVE}>Active</option>
            <option value={SequenceStatus.ARCHIVED}>Archived</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium"
          >
            Save details
          </button>
        </div>
      </form>

      <form
        action={handleDelete}
        className="mb-6 flex justify-end"
      >
        <DeleteSequenceButton name={sequence.name} />
      </form>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Steps</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Each step&apos;s delay is measured from the previous step&apos;s scheduled time
            (cumulative).
          </p>
        </div>
        <StepBuilder sequenceId={sequence.id} steps={stepRows} templates={templateOptions} />
      </section>
    </main>
  );
}
