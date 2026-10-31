import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, ReadNight } from './types.js';

type Line = { at: string; job: string; status: JobStatus; owner: string | null; error: string | null };

function isRealDate(night: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === night;
}

function isStatus(value: unknown): value is JobStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseLine(text: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || !at || typeof job !== 'string' || !job) return null;
  if (!isStatus(status)) return null;
  if (typeof owner !== 'string' && owner !== null) return null;
  return { at, job, status, owner, error: typeof error === 'string' ? error : null };
}

function addLine(row: DigestRow | undefined, line: Line): DigestRow {
  const retry = line.status === 'retry' ? 1 : 0;
  return {
    job: line.job,
    owner: line.owner,
    runs: (row?.runs ?? 0) + 1,
    retries: (row?.retries ?? 0) + retry,
    lastStatus: line.status,
    lastError: line.error ?? row?.lastError ?? null,
    firstAt: row?.firstAt ?? line.at,
    lastAt: line.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isRealDate(night)) return { found: false };

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return { found: false };
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const line = parseLine(raw);
    if (line) rows.set(line.job, addLine(rows.get(line.job), line));
    else badLines += 1;
  }

  return {
    found: true,
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : 1)),
    badLines,
  };
};
