import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
// pdf-parse v1 is intentionally pinned in package.json. v2 pulls in pdfjs-dist,
// which requires the native @napi-rs/canvas package for DOMMatrix and friends —
// that combo doesn't load in Vercel's serverless runtime ("ReferenceError:
// DOMMatrix is not defined"). v1 does Buffer-only parsing with zero native deps.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

type ResumeSource =
  | File
  | {
      url: string;
    };

type LoadedResume = {
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
};

type ResumeKind = "pdf" | "docx";

export async function extractResumeText(input: ResumeSource): Promise<string> {
  const loaded = await loadResume(input);
  const kind = detectResumeKind(loaded);

  switch (kind) {
    case "pdf":
      return extractPdfText(loaded.buffer);
    case "docx":
      return extractDocxText(loaded.buffer);
    default:
      throw new Error("Unsupported resume type. Use PDF or DOCX.");
  }
}

async function loadResume(input: ResumeSource): Promise<LoadedResume> {
  if (input instanceof File) {
    return {
      buffer: Buffer.from(await input.arrayBuffer()),
      contentType: input.type,
      fileName: input.name,
    };
  }

  if (isHttpUrl(input.url)) {
    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(`Could not fetch resume from URL: HTTP ${response.status}.`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? undefined,
      fileName: new URL(input.url).pathname,
    };
  }

  const publicDir = path.resolve(process.cwd(), "public");
  const relativeUrl = input.url.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, relativeUrl);
  if (!filePath.startsWith(publicDir + path.sep)) {
    throw new Error("Resume URL points outside the public uploads directory.");
  }

  return {
    buffer: await fs.readFile(filePath),
    fileName: filePath,
  };
}

function detectResumeKind(resume: LoadedResume): ResumeKind {
  const contentType = resume.contentType?.toLowerCase();
  const fileName = resume.fileName?.toLowerCase() ?? "";

  if (contentType === "application/pdf" || fileName.endsWith(".pdf")) return "pdf";
  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return "docx";
  }
  if (contentType === "application/msword" || fileName.endsWith(".doc")) {
    throw new Error("Legacy DOC resumes are not supported for parsing. Use PDF or DOCX.");
  }

  throw new Error("Unsupported resume type. Use PDF or DOCX.");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return normalizeWhitespace(result.text);
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result.value);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
