#!/usr/bin/env node
/**
 * Generates docs/Sequences-Guide.docx from inline content.
 *
 * Uses jszip (already a transitive dep) to build a minimal but valid Word
 * document — no extra packages needed. Re-run any time to refresh:
 *
 *     node scripts/gen-sequences-docx.mjs
 */
import JSZip from "jszip";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "..", "docs", "Sequences-Guide.docx");

/** Document content, written as a flat list of "blocks". */
const blocks = [
  { type: "h1", text: "Sequences — Multi-Step Recruiter Cadences" },
  {
    type: "p",
    text:
      "Sequences let a recruiter line up a series of touchpoints — emails, calls, texts, LinkedIn outreach — and run them across one or many candidates on a fixed cadence. Emails go out automatically through Resend at the time you schedule. Everything else surfaces as a task you tick off as you go.",
  },

  { type: "h2", text: "1. What is a sequence?" },
  {
    type: "p",
    text:
      "A sequence is a named, reusable template made of ordered steps. Each step has a type (Email, Call, Text, LinkedIn, or Task) and a delay measured in days from the previous step. When you enroll a candidate, the system computes the full schedule up front and either schedules the email or queues the manual task for the day it’s due.",
  },
  {
    type: "p",
    text:
      "Sequences live at /sequences. Each enrollment lives inside one sequence and points at one candidate (optionally also at a specific job application).",
  },

  { type: "h2", text: "2. Step types" },
  {
    type: "bullets",
    items: [
      "Email — Sent automatically through Resend at the scheduled time. Pick a template or write the subject and body inline.",
      "Call — Manual task: phone the candidate. You write the talking points.",
      "Text — Manual task: send an SMS. The system does not send the text; it reminds you to.",
      "LinkedIn — Manual task: connect with, message, or InMail the candidate.",
      "Task — Generic catch-all manual task for anything else (review their portfolio, share a resume internally, etc).",
    ],
  },
  {
    type: "p",
    text:
      "Only Email steps execute on their own. Call, Text, LinkedIn, and Task all show up in your Tasks Due list when their scheduled day arrives.",
  },

  { type: "h2", text: "3. How timing works" },
  {
    type: "p",
    text:
      "Each step has a delay-days value that is counted from the previous step’s scheduled time, not from enrollment. So a sequence with steps of 0, 3, 2, 1 days produces a schedule of day 0, day 3, day 5, day 6 — cumulative.",
  },
  {
    type: "p",
    text:
      "When you enroll a candidate, every step’s scheduled time is computed in one pass and saved. Future changes to the sequence template do not retroactively shift active enrollments — they only affect new enrollments.",
  },

  { type: "h2", text: "4. Creating a sequence" },
  {
    type: "ol",
    items: [
      "Go to /sequences and click New sequence.",
      "Give it a clear name (e.g. “Senior Engineer — Cold Outreach”) and an optional description.",
      "On the sequence detail page, add steps one at a time. For each step pick a type, the delay days, and either an email template (or inline subject + body) or a task title + instructions.",
      "Reorder steps with the up/down arrows. Step delays are always relative to the step above.",
      "Sequences can be saved as DRAFT (work in progress) or ACTIVE. Only ACTIVE sequences accept new enrollments.",
    ],
  },

  { type: "h2", text: "5. Personalising the message" },
  {
    type: "p",
    text:
      "Email subjects and bodies support handlebars-style placeholders. The renderer fills them in per candidate before sending:",
  },
  {
    type: "bullets",
    items: [
      "{{candidate.firstName}} / {{candidate.lastName}} / {{candidate.email}} / {{candidate.phone}}",
      "{{sender.name}} / {{sender.email}} — the recruiter who owns this enrollment",
      "{{job.title}} — only available when the enrollment is linked to an application",
    ],
  },

  { type: "h2", text: "6. Enrolling a candidate" },
  {
    type: "ol",
    items: [
      "Open the candidate’s profile.",
      "In the Sequences section, click Enroll in sequence.",
      "Pick the sequence and, optionally, an existing application to attach the enrollment to (so {{job.title}} resolves and notes land on the right pipeline entry).",
      "Confirm. The system schedules every step. Email steps are immediately handed off to Resend with a scheduledAt timestamp.",
    ],
  },
  {
    type: "p",
    text:
      "A candidate can be enrolled in many sequences, but at most once per sequence at a time. Re-enrolling after a cancellation creates a fresh enrollment record.",
  },

  { type: "h2", text: "7. Tasks Due" },
  {
    type: "p",
    text:
      "Manual steps (Call, Text, LinkedIn, Task) surface in your Tasks Due list when their scheduled day arrives. You see only the tasks that belong to enrollments you created — other recruiters don’t pile their work onto your list. Each row shows the candidate, sequence, step type, and your instructions.",
  },
  {
    type: "p",
    text:
      "Hit Mark done on a row, jot a short outcome note (“left voicemail”, “booked screen for Thursday”, etc.), and the task is closed out. The enrollment moves to the next step automatically.",
  },

  { type: "h2", text: "8. Pausing, resuming, cancelling" },
  {
    type: "bullets",
    items: [
      "Pause — Future scheduled emails are immediately cancelled with Resend (so nothing accidentally goes out while the candidate is on hold). Manual steps stop appearing in Tasks Due.",
      "Resume — Each remaining scheduled time shifts forward by the duration of the pause, and emails are re-scheduled with Resend. The relative cadence between steps is preserved.",
      "Cancel — Same as Pause but the enrollment is closed for good. Any unsent emails are dropped.",
    ],
  },

  { type: "h2", text: "9. Limits and things this version does not do" },
  {
    type: "bullets",
    items: [
      "No reply detection — sending more emails after a candidate replies is on you for now.",
      "No unsubscribe handling beyond Resend’s default link.",
      "No automatic retries on send failure — failed StepRuns are flagged in the enrollment view; manually resend or re-enroll.",
      "No branching, A/B, or conditional logic. One linear cadence per sequence.",
      "Bulk enroll, sequence cloning, and per-recruiter “from” override are deferred to a later pass.",
    ],
  },

  { type: "h2", text: "10. Email sending status (as of go-live)" },
  {
    type: "p",
    text:
      "The bbagc.com sending domain is still propagating through Resend’s verification process. Until DNS finishes verifying, real outbound only works from the onboarding@resend.dev sender to the email address you signed up to Resend with. Every other recipient will be silently dropped by Resend with a 422.",
  },
  {
    type: "p",
    text:
      "The sequences feature itself does not need to change once the domain is verified — the same scheduledAt API path will start delivering to real candidates. Until then, test enrollments will only deliver to your own inbox.",
  },

  { type: "h2", text: "Glossary" },
  {
    type: "bullets",
    items: [
      "Sequence — The reusable template (name, description, ordered steps).",
      "SequenceStep — One step in the template (type, delay days, content).",
      "Enrollment — A candidate going through a sequence. One per (sequence, candidate) pair at a time.",
      "StepRun — One concrete scheduled action inside an enrollment. Has its own scheduledFor and status.",
    ],
  },
];

// ---------- XML rendering ----------

const escape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const para = (text, style) => {
  const styleTag = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleTag}<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;
};

const listItem = (text, kind) => {
  // kind === "bullet" -> numId=1, kind === "number" -> numId=2
  const numId = kind === "number" ? 2 : 1;
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;
};

const renderBlocks = () =>
  blocks
    .map((b) => {
      switch (b.type) {
        case "h1":
          return para(b.text, "Heading1");
        case "h2":
          return para(b.text, "Heading2");
        case "p":
          return para(b.text);
        case "bullets":
          return b.items.map((t) => listItem(t, "bullet")).join("");
        case "ol":
          return b.items.map((t) => listItem(t, "number")).join("");
        default:
          return "";
      }
    })
    .join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${renderBlocks()}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="480" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="360" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr>
  </w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

// ---------- ZIP + write ----------

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypesXml);
zip.folder("_rels").file(".rels", rootRelsXml);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", stylesXml);
word.file("numbering.xml", numberingXml);
word.folder("_rels").file("document.xml.rels", documentRelsXml);

const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, buffer);

console.log(`Wrote ${OUT_PATH} (${buffer.length.toLocaleString()} bytes)`);
