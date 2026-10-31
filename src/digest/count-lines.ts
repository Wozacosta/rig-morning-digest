import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRealDate, parseLines } from './read-night.js';
import type { JobStatus } from './types.js';

export type LineCounts = Record<JobStatus, number>;

// Parsed lines of a night by status. Null when readNight would say found: false.
export function countLines(runsDir: string, night: string): LineCounts | null {
  if (!isRealDate(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: LineCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of parseLines(text).lines) counts[line.status] += 1;
  return counts;
}
