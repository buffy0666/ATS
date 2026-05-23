import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

async function saveKnowledgeFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File exceeds 20 MB limit.");
  }
  if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error("Unsupported file type.");
  }

  const dir = path.join(process.cwd(), "public", "uploads", "knowledge");
  await fs.mkdir(dir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/uploads/knowledge/${filename}`;
}

async function getKnowledgeItems() {
  return prisma.knowledgeItem.findMany({
    orderBy: { createdAt: "desc" },
  });
}

async function addKnowledgeItem(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const linkUrl = formData.get("url") as string;
  const file = formData.get("file") as File | null;

  if (!name) return;

  let finalUrl = "";
  let finalType = type;

  if (type === "link" && linkUrl) {
    finalUrl = linkUrl;
  } else if (type === "document" && file && file.size > 0) {
    finalUrl = await saveKnowledgeFile(file);
  } else {
    return; // invalid submission
  }

  await prisma.knowledgeItem.create({
    data: {
      name,
      type: finalType,
      url: finalUrl,
    },
  });

  revalidatePath("/knowledge");
}

export default async function KnowledgeBase() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = await getKnowledgeItems();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            ← Home
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge Base</h1>
        </div>
      </div>

      {/* Add new item form */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">Add Knowledge Item</h2>
        
        <form action={addKnowledgeItem} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Name *</label>
              <input 
                type="text" 
                name="name" 
                required 
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm" 
                placeholder="Q4 Hiring Plan" 
              />
            </div>
            
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Type *</label>
              <select 
                name="type" 
                required 
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                id="typeSelect"
              >
                <option value="document">Document (Upload)</option>
                <option value="link">Link</option>
              </select>
            </div>
          </div>

          {/* Link input */}
          <div id="linkSection">
            <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">URL / Link</label>
            <input 
              type="url" 
              name="url" 
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm" 
              placeholder="https://..." 
            />
          </div>

          {/* File upload */}
          <div id="fileSection" className="hidden">
            <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Upload Document</label>
            <input 
              type="file" 
              name="file" 
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700" 
            />
            <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, XLSX, TXT up to 20MB</p>
          </div>
          
          <button 
            type="submit"
            className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-5 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
          >
            Add to Knowledge Base
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Link / File</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                  No items yet. Add your first document or link above.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50">
                <td className="px-6 py-4 font-medium">{item.name}</td>
                <td className="px-6 py-4">
                  <span className="inline-block rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-0.5 text-xs uppercase tracking-wide">
                    {item.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <a 
                    href={item.url} 
                    target="_blank" 
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {item.url.length > 55 ? item.url.substring(0, 55) + "..." : item.url}
                  </a>
                </td>
                <td className="px-6 py-4 text-zinc-500 text-xs">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('typeSelect').addEventListener('change', function() {
            const linkSection = document.getElementById('linkSection');
            const fileSection = document.getElementById('fileSection');
            if (this.value === 'link') {
              linkSection.classList.remove('hidden');
              fileSection.classList.add('hidden');
            } else {
              linkSection.classList.add('hidden');
              fileSection.classList.remove('hidden');
            }
          });
        `
      }} />
    </div>
  );
}
