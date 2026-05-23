export type RowResult =
  | { row: number; email: string; status: "created"; candidateId: string }
  | { row: number; email: string | null; status: "skipped"; reason: string }
  | {
      row: number;
      email: string | null;
      status: "error";
      reason: string;
      record: Record<string, string>;
    };

export type ImportResult = {
  status: "idle" | "success" | "error";
  message: string;
  created: number;
  skipped: number;
  errored: number;
  rows: RowResult[];
  headers: string[];
};

export const initialImportResult: ImportResult = {
  status: "idle",
  message: "",
  created: 0,
  skipped: 0,
  errored: 0,
  rows: [],
  headers: [],
};
