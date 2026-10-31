export type JobStatus = 'ok' | 'retry' | 'fail';

// One job's night. Times stay as the log wrote them, offset included.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null stays null, the view renders it as —
  runs: number; // every parsed line of the job
  retries: number; // lines with status retry
  lastStatus: JobStatus;
  lastError: string | null; // most recent error on the job, even if a later line was ok
  firstAt: string; // first line in log order
  lastAt: string; // last line in log order
};

// found: false is a missing file, or a night that is not a real YYYY-MM-DD: the route 404s.
// An empty file is { found: true, rows: [], badLines: 0 }: it renders "nothing ran".
export type Night =
  | { found: false }
  | {
      found: true;
      rows: DigestRow[]; // sorted by job, so the page and the JSON cannot disagree
      badLines: number; // lines that did not parse, lacked a required field or had an unknown status
    };

// Implemented by readNight in src/digest/read-night.ts. Synchronous; never throws.
export type ReadNight = (runsDir: string, night: string) => Night;
