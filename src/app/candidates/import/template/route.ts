import { auth } from "@/auth";
import { toCsv } from "@/lib/csv";
import { CSV_COLUMNS, CSV_HEADERS } from "../columns";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const example = CSV_COLUMNS.map((c) => c.example);
  const csv = toCsv([CSV_HEADERS, example]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="candidates-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
