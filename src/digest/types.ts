// Plan morning-digest § 1. The shapes every part of the digest builds against: the reader (#2)
// produces a NightDigest, the page (#3), the JSON (#4) and the board (#5) only read it.
// Everything here is plain JSON (no Dates, no undefined), so the page and /api/digest render
// the same object and can't disagree (ADR 0001).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge (styleguide).
export type RunLine = {
  at: string; // ISO 8601 with the log's offset, kept as written
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. "First" and "last" follow file order: the log is append-only.
export type DigestRow = {
  job: string;
  owner: string | null; // from the last line; null renders as "—", the row is kept
  runs: number; // lines for this job, any status
  retries: number; // lines with status "retry"; 3 or more is marked on the page
  lastStatus: RunStatus;
  lastError: string | null; // error of the latest line that had one, even if a later run was ok
  firstAt: string; // `at` of the first line, offset kept
  lastAt: string; // `at` of the last line, offset kept
};

// Lines per status across the night (parsed lines only). The board shows these beside each night.
export type StatusCounts = Record<RunStatus, number>;

export type NightDigest = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON keep this order
  counts: StatusCounts;
  badLines: number; // lines that aren't JSON or aren't a RunLine: counted, never thrown
};

// readNight(runsDir, night) reads <runsDir>/<night>.jsonl. Implemented by #2 in
// src/digest/read.ts as `export const readNight: ReadNight`.
// - null: `night` isn't YYYY-MM-DD, or there is no such file (the routes answer 404).
// - empty file: a NightDigest with no rows and zero counts ("nothing ran").
// - never throws on the file's content; blank lines are skipped, not counted as bad.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
