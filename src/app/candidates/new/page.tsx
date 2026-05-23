import { createCandidate } from "../actions";

export default function NewCandidatePage() {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New candidate</h1>
        <form
          action={createCandidate}
          className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" name="firstName" required />
            <Field label="Last name" name="lastName" required />
          </div>
          <Field label="Email" name="email" type="email" required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone" name="phone" />
            <Field label="LinkedIn URL" name="linkedinUrl" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="resume">
              Resume (PDF or DOCX, max 10 MB)
            </label>
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="block w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
          >
            Create candidate
          </button>
        </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  );
}
