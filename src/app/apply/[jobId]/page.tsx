import { prisma } from "@/lib/prisma";
import { extractResumeText } from "@/lib/resume-parser/extract";
import { saveResume } from "@/lib/uploads";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function getJob(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId, status: "OPEN" },
    select: {
      id: true,
      title: true,
      department: true,
      location: true,
      description: true,
    },
  });
}

async function submitApplication(formData: FormData) {
  "use server";

  const jobId = formData.get("jobId") as string;
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const linkedinUrl = (formData.get("linkedinUrl") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const resume = formData.get("resume") as File | null;

  if (!jobId || !firstName || !lastName || !email) {
    return;
  }

  // Create or find candidate
  let candidate = await prisma.candidate.findUnique({ where: { email } });

  if (!candidate) {
    let resumeUrl: string | null = null;
    let resumeText: string | null = null;
    if (resume && resume.size > 0) {
      resumeUrl = await saveResume(resume);
      try {
        resumeText = await extractResumeText(resume);
      } catch (error) {
        console.warn("Resume text extraction failed during apply submission.", error);
      }
    }

    candidate = await prisma.candidate.create({
      data: {
        email,
        firstName,
        lastName,
        phone,
        linkedinUrl,
        resumeUrl,
        resumeText,
      },
    });
  }

  // Create application (avoid duplicates)
  const existing = await prisma.application.findUnique({
    where: { jobId_candidateId: { jobId, candidateId: candidate.id } },
  });

  if (!existing) {
    await prisma.application.create({
      data: {
        jobId,
        candidateId: candidate.id,
      },
    });
  }

  revalidatePath("/jobs");
  redirect(`/apply/${jobId}/success`);
}

export default async function ApplyPage({ params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId);

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Job not found</h1>
          <p className="text-zinc-400">This position may have been filled or is no longer open.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-sm text-zinc-500 mb-1">We're hiring</div>
          <h1 className="text-4xl font-semibold tracking-tight">{job.title}</h1>
          <div className="flex gap-3 text-zinc-400 mt-2">
            {job.department && <span>{job.department}</span>}
            {job.location && <span>• {job.location}</span>}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-xl font-medium mb-6">Apply for this position</h2>

          <form action={submitApplication} className="space-y-5">
            <input type="hidden" name="jobId" value={job.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">First Name</label>
                <input type="text" name="firstName" required className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Last Name</label>
                <input type="text" name="lastName" required className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
                <input type="email" name="email" required className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Phone (optional)</label>
                <input type="tel" name="phone" className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">LinkedIn URL (optional)</label>
              <input type="url" name="linkedinUrl" className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-600" placeholder="https://linkedin.com/in/..." />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Resume (PDF or DOCX)</label>
              <input type="file" name="resume" accept=".pdf,.doc,.docx" className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white file:text-black file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200" />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Additional Notes (optional)</label>
              <textarea name="notes" rows={4} className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 text-sm focus:outline-none focus:border-zinc-600 resize-y" placeholder="Anything else you'd like us to know..." />
            </div>

            <button
              type="submit"
              className="w-full mt-4 rounded-xl bg-white text-black py-3 font-medium hover:bg-zinc-200 transition"
            >
              Submit Application
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-500 mt-6">
          Your information will only be used for this application.
        </p>
      </div>
    </div>
  );
}
