export type RowResult =
  | { row: number; email: string; status: "created"; candidateId: string }
  | { row: number; email: string; status: "updated"; candidateId: string }
  | { row: number; email: string | null; status: "skipped"; reason: string }
  | {
      row: number;
      email: string | null;
      status: "error";
      reason: string;
      record: Record<string, string>;
    };

/** Drives whether the importer creates new candidates, updates existing ones, or both. */
export type ImportMode = "create" | "upsert" | "update-only";

export type ImportResult = {
  status: "idle" | "success" | "error";
  message: string;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  rows: RowResult[];
  headers: string[];
};

export const initialImportResult: ImportResult = {
  status: "idle",
  message: "",
  created: 0,
  updated: 0,
  skipped: 0,
  errored: 0,
  rows: [],
  headers: [],
};
