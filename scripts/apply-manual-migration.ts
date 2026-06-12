/**
 * Apply a manual SQL migration file (prisma/manual-migrations/*.sql) to the
 * database in .env. Prisma's raw API runs one statement per call, so this
 * splits the file on top-level semicolons — respecting $$ ... $$ function
 * bodies, quoted strings, and line comments.
 *
 * Usage:
 *   npx tsx scripts/apply-manual-migration.ts prisma/manual-migrations/<file>.sql
 */

import { config } from "dotenv";
config();

import { readFileSync } from "fs";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/apply-manual-migration.ts <path-to-sql>");
  process.exit(1);
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDollar = false;
  let inLineComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      current += ch;
      i++;
      continue;
    }
    if (!inSingle && !inDollar && two === "--") {
      inLineComment = true;
      current += two;
      i += 2;
      continue;
    }
    if (!inDollar && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      i++;
      continue;
    }
    if (!inSingle && two === "$$") {
      inDollar = !inDollar;
      current += two;
      i += 2;
      continue;
    }
    if (ch === ";" && !inSingle && !inDollar) {
      statements.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current);

  // Drop chunks that are only comments/whitespace.
  return statements.filter((s) =>
    s
      .split("\n")
      .some((line) => line.trim() && !line.trim().startsWith("--")),
  );
}

async function main() {
  const sql = readFileSync(file, "utf8");
  const statements = splitStatements(sql);
  console.log(`Applying ${file} — ${statements.length} statement(s).`);
  for (const stmt of statements) {
    const label = stmt.trim().split("\n").find((l) => l.trim() && !l.trim().startsWith("--"))?.slice(0, 80);
    console.log(`  -> ${label}`);
    const result = await prisma.$executeRawUnsafe(stmt);
    console.log(`     ok (${result} row(s) affected)`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
