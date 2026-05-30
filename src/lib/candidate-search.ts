import "server-only";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Boolean keyword search over Candidate's tsvector column.
 *
 * Accepts user-style queries like:
 *   "react" AND ("typescript" OR "next.js") -junior
 *   "machine learning" senior
 *   designer OR "ux researcher"
 *   senior engineer Boston
 *
 * Supported syntax (case-insensitive operators):
 *   - AND, OR, NOT
 *   - Parentheses for grouping
 *   - Double-quoted phrases ("machine learning")
 *   - Leading "-" as shorthand for NOT (e.g. -junior)
 *   - Implicit AND between adjacent terms
 *
 * Compiles to a Postgres tsquery and runs it against the `searchVector`
 * column (defined + maintained by a raw SQL trigger — Prisma does not
 * model it). Currently indexed:
 *
 *   weight A: firstName, lastName, email
 *   weight B: currentTitle, currentCompany, summary,
 *             skills, industries, specialties,
 *             locationCity, locationState
 *   weight C: notes, resumeText
 *
 * The trigger function is `candidate_search_vector_update()`; the trigger
 * is `candidate_search_vector_trigger`. Update both when adding fields.
 */

const TS_LANG = "english";
const FTS_RESULT_LIMIT = 1000;

export type CandidateSearchAst =
  | { type: "term"; value: string; isPhrase: boolean }
  | { type: "and"; children: CandidateSearchAst[] }
  | { type: "or"; children: CandidateSearchAst[] }
  | { type: "not"; child: CandidateSearchAst };

/** Returns true if the trimmed input contains any non-noise characters. */
export function hasSearchInput(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Run an FTS query and return candidate IDs ranked by relevance, scoped
 * to a single organization. Returns null if the query is empty or
 * compiles to nothing meaningful (caller should fall back to a non-FTS
 * findMany in that case).
 *
 * `orgId` is required — searching across tenants would leak candidates.
 */
export async function searchCandidates(
  rawInput: string,
  orgId: string,
): Promise<string[] | null> {
  const tsquery = compileTsquery(rawInput);
  if (!tsquery) return null;

  // TEMP DIAGNOSTIC — surface what the prod runtime actually receives,
  // since the DB shows the index populated and `searchVector @@ to_tsquery`
  // returns matches via direct psql, yet users report 0 results in the UI.
  // Logged via console.error so it appears in Vercel function logs.
  console.error(
    `[fts] orgId=${orgId} raw=${JSON.stringify(rawInput)} tsquery=${tsquery}`,
  );

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "Candidate"
      WHERE "organizationId" = ${orgId}
        AND "searchVector" @@ to_tsquery(${TS_LANG}, ${tsquery})
      ORDER BY ts_rank("searchVector", to_tsquery(${TS_LANG}, ${tsquery})) DESC, "createdAt" DESC
      LIMIT ${FTS_RESULT_LIMIT}
    `;
    console.error(`[fts] orgId=${orgId} tsquery=${tsquery} rows=${rows.length}`);

    // Safety net: if FTS legitimately returns 0 (maybe the searchVector
    // column hasn't been populated for this candidate yet on this DB),
    // fall back to a simple ILIKE so the user sees something rather than
    // nothing. This is defensive — the FTS path is the primary.
    if (rows.length === 0) {
      const fallback = await ilikeFallback(rawInput, orgId);
      console.error(
        `[fts] ilike fallback orgId=${orgId} raw=${JSON.stringify(rawInput)} rows=${fallback.length}`,
      );
      if (fallback.length > 0) return fallback;
    }
    return rows.map((r) => r.id);
  } catch (error) {
    // Most often: tsquery composed only of stop words ("the and a") or
    // an unfinished operator. Log the full error + try ILIKE as a
    // safety net so a broken FTS path doesn't return 0 results.
    console.error(
      `[fts] FAILED orgId=${orgId} tsquery=${tsquery}:`,
      error instanceof Error ? error.message : error,
    );
    try {
      const fallback = await ilikeFallback(rawInput, orgId);
      console.error(
        `[fts] catch-path ilike fallback rows=${fallback.length}`,
      );
      return fallback;
    } catch {
      return [];
    }
  }
}

/**
 * ILIKE-based safety-net search across the same fields the FTS index
 * covers. Lower-quality than tsquery (no ranking, no proper boolean
 * algebra, no phrase support) but matches anywhere in the text and
 * doesn't depend on the tsvector column being populated.
 *
 * Boolean handling: AND / OR / NOT keywords and "-term" syntax are
 * treated as TERM SEPARATORS. The remaining terms are implicit-AND'd
 * — every term must appear in at least one indexed field. That's good
 * enough for the common case ("react typescript", "senior engineer
 * boston", "james AND king") to find what the user expects. Phrase
 * search and explicit OR / NOT fall back to plain AND here.
 */
async function ilikeFallback(rawInput: string, orgId: string): Promise<string[]> {
  // Strip quotes (so "machine learning" becomes one bigram → two terms),
  // then split on whitespace, drop operator keywords + leading '-'.
  const stripped = rawInput.replace(/"/g, " ").toLowerCase();
  const terms = stripped
    .split(/\s+/)
    .map((s) => s.replace(/^-+/, "").replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(
      (s) =>
        s.length > 0 &&
        s !== "and" &&
        s !== "or" &&
        s !== "not",
    );
  if (terms.length === 0) return [];

  // Each term must match somewhere → implicit AND between conditions.
  const conditions = terms.map((t) => {
    const like = `%${t}%`;
    return Prisma.sql`(
      lower("firstName")                       LIKE ${like}
      OR lower("lastName")                     LIKE ${like}
      OR lower(email)                          LIKE ${like}
      OR lower(coalesce("currentTitle",''))    LIKE ${like}
      OR lower(coalesce("currentCompany",''))  LIKE ${like}
      OR lower(coalesce("locationCity",''))    LIKE ${like}
      OR lower(coalesce("locationState",''))   LIKE ${like}
    )`;
  });

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "Candidate"
    WHERE "organizationId" = ${orgId}
      AND ${Prisma.join(conditions, " AND ")}
    ORDER BY "createdAt" DESC
    LIMIT ${FTS_RESULT_LIMIT}
  `);
  return rows.map((r) => r.id);
}

/** Compile user input into a Postgres tsquery string, or null if empty. */
export function compileTsquery(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let ast: CandidateSearchAst | null;
  try {
    const tokens = tokenize(trimmed);
    const parser = new Parser(tokens);
    ast = parser.parseExpression();
    parser.expectEnd();
  } catch {
    // Malformed input — fall back to a phrase-style search of the whole input
    // by treating every bare word as a required term.
    ast = fallbackAst(trimmed);
  }

  if (!ast) return null;
  return compile(ast);
}

// ---------- Tokenizer ----------

type Token =
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "and" }
  | { kind: "or" }
  | { kind: "not" }
  | { kind: "word"; value: string }
  | { kind: "phrase"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isSpace = (ch: string) => /\s/.test(ch);
  const isWordChar = (ch: string) =>
    !isSpace(ch) && ch !== "(" && ch !== ")" && ch !== '"' && ch !== "-";

  while (i < input.length) {
    const ch = input[i];

    if (isSpace(ch)) {
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      const start = i;
      while (i < input.length && input[i] !== '"') i++;
      const value = input.slice(start, i);
      if (i < input.length) i++; // skip closing quote
      if (value.trim()) tokens.push({ kind: "phrase", value });
      continue;
    }

    if (ch === "-") {
      // "-" acts as NOT only when it precedes a term (no space between).
      const next = input[i + 1];
      if (next && !isSpace(next) && next !== ")") {
        tokens.push({ kind: "not" });
        i++;
        continue;
      }
      // Otherwise it's part of a word (e.g. "next-js").
    }

    // Word (or operator keyword).
    let j = i;
    while (j < input.length && isWordChar(input[j])) j++;
    const raw = input.slice(i, j);
    i = j;
    if (!raw) {
      i++;
      continue;
    }
    const upper = raw.toUpperCase();
    if (upper === "AND") tokens.push({ kind: "and" });
    else if (upper === "OR") tokens.push({ kind: "or" });
    else if (upper === "NOT") tokens.push({ kind: "not" });
    else tokens.push({ kind: "word", value: raw });
  }

  return tokens;
}

// ---------- Parser (recursive descent) ----------

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  expectEnd(): void {
    if (this.pos !== this.tokens.length) {
      throw new Error(`Unexpected trailing input at position ${this.pos}`);
    }
  }

  parseExpression(): CandidateSearchAst | null {
    return this.parseOr();
  }

  private parseOr(): CandidateSearchAst | null {
    const children: CandidateSearchAst[] = [];
    const first = this.parseAnd();
    if (first) children.push(first);

    while (this.peek()?.kind === "or") {
      this.consume();
      const next = this.parseAnd();
      if (next) children.push(next);
    }

    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { type: "or", children };
  }

  private parseAnd(): CandidateSearchAst | null {
    const children: CandidateSearchAst[] = [];
    let node = this.parseNot();
    if (node) children.push(node);

    while (true) {
      const tk = this.peek();
      if (!tk) break;
      if (tk.kind === "rparen" || tk.kind === "or") break;
      if (tk.kind === "and") this.consume();
      node = this.parseNot();
      if (!node) break;
      children.push(node);
    }

    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { type: "and", children };
  }

  private parseNot(): CandidateSearchAst | null {
    if (this.peek()?.kind === "not") {
      this.consume();
      const inner = this.parseNot();
      if (!inner) return null;
      return { type: "not", child: inner };
    }
    return this.parseAtom();
  }

  private parseAtom(): CandidateSearchAst | null {
    const tk = this.peek();
    if (!tk) return null;

    if (tk.kind === "lparen") {
      this.consume();
      const inner = this.parseExpression();
      const closing = this.consume();
      if (closing?.kind !== "rparen") {
        throw new Error("Missing closing parenthesis");
      }
      return inner;
    }

    if (tk.kind === "word") {
      this.consume();
      return { type: "term", value: tk.value, isPhrase: false };
    }

    if (tk.kind === "phrase") {
      this.consume();
      return { type: "term", value: tk.value, isPhrase: true };
    }

    return null;
  }
}

function fallbackAst(input: string): CandidateSearchAst | null {
  const words = input
    .split(/\s+/)
    .map(sanitizeWord)
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return { type: "term", value: words[0], isPhrase: false };
  return {
    type: "and",
    children: words.map((w) => ({
      type: "term" as const,
      value: w,
      isPhrase: false,
    })),
  };
}

// ---------- Compile AST → tsquery ----------

function compile(node: CandidateSearchAst): string | null {
  switch (node.type) {
    case "term": {
      if (node.isPhrase) {
        const words = node.value.split(/\s+/).map(sanitizeWord).filter(Boolean);
        if (words.length === 0) return null;
        return words.join(" <-> ");
      }
      const w = sanitizeWord(node.value);
      return w || null;
    }
    case "and": {
      const parts = node.children.map(compile).filter(Boolean) as string[];
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return parts.map(wrap).join(" & ");
    }
    case "or": {
      const parts = node.children.map(compile).filter(Boolean) as string[];
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return parts.map(wrap).join(" | ");
    }
    case "not": {
      const inner = compile(node.child);
      if (!inner) return null;
      return `!${wrap(inner)}`;
    }
  }
}

function wrap(s: string): string {
  // Already a single bare token — no need to parenthesize.
  if (/^[a-z0-9_-]+$/i.test(s)) return s;
  return `(${s})`;
}

function sanitizeWord(value: string): string {
  // Keep letters (any script), digits, underscore, hyphen. Lowercase.
  return value.replace(/[^\p{L}\p{N}_-]/gu, "").toLowerCase();
}
