import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const NIGHT = '2026-10-30';
const line = (fields: Record<string, unknown>) =>
  JSON.stringify({ at: '2026-10-30T23:00:00+01:00', job: 'a/job', status: 'ok', owner: 'rook', ...fields });

describe('readNight on the real logs', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    expect(readNight('runs', '2026-10-28')).toEqual({
      found: true,
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 1,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('reads 2026-10-27: 4 jobs, no bad lines', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night.found && night.rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.found && night.badLines).toBe(0);
  });
});

describe('readNight', () => {
  let dir: string;
  const write = (text: string, night = NIGHT) => writeFileSync(join(dir, `${night}.jsonl`), text);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('separates a missing file from an empty one', () => {
    expect(readNight(dir, NIGHT)).toEqual({ found: false });
    write('');
    expect(readNight(dir, NIGHT)).toEqual({ found: true, rows: [], badLines: 0 });
  });

  it('treats a missing runs dir as a missing night', () => {
    expect(readNight(join(dir, 'nope'), NIGHT)).toEqual({ found: false });
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-10-1', '20261030', '', '2026-10-30\n'])(
    'treats %j as missing, even with a file of that name',
    (night) => {
      write(line({}), night);
      expect(readNight(dir, night)).toEqual({ found: false });
    },
  );

  it('accepts a real leap day', () => {
    write(line({}), '2028-02-29');
    expect(readNight(dir, '2028-02-29').found).toBe(true);
  });

  it('never leaves the runs dir', () => {
    const inner = join(dir, 'runs');
    mkdirSync(inner);
    write(line({}), 'secret');
    expect(readNight(inner, '../secret')).toEqual({ found: false });
  });

  it('counts bad lines without throwing', () => {
    const { owner: _owner, ...noOwner } = JSON.parse(line({}));
    write(
      [
        line({}),
        'not json',
        '42',
        'null',
        '[]',
        line({ job: undefined }),
        line({ job: '' }),
        line({ at: undefined }),
        line({ status: undefined }),
        line({ status: 'skipped' }),
        JSON.stringify(noOwner),
        line({ owner: 7 }),
      ].join('\n'),
    );
    const night = readNight(dir, NIGHT);
    expect(night.found && night.badLines).toBe(11);
    expect(night.found && night.rows).toHaveLength(1);
  });

  it('keeps a job whose only lines have an extra or non-string error', () => {
    write(line({ error: 503, extra: true }));
    const night = readNight(dir, NIGHT);
    expect(night.found && night.badLines).toBe(0);
    expect(night.found && night.rows[0].lastError).toBeNull();
  });

  it('skips blank lines and copes with CRLF', () => {
    write(`${line({})}\r\n\r\n   \n${line({})}\r\n`);
    const night = readNight(dir, NIGHT);
    expect(night.found && night.badLines).toBe(0);
    expect(night.found && night.rows[0].runs).toBe(2);
  });

  it('follows log order, not clock order, and keeps the offset', () => {
    write(
      [
        line({ at: '2026-10-30T05:00:00+01:00' }),
        line({ at: '2026-10-30T01:00:00-05:00', status: 'fail', error: 'first' }),
        line({ at: '2026-10-30T03:00:00+01:00', status: 'fail', error: 'second' }),
        line({ at: '2026-10-30T02:00:00+01:00', status: 'retry', owner: null }),
      ].join('\n'),
    );
    const night = readNight(dir, NIGHT);
    expect(night.found && night.rows[0]).toEqual({
      job: 'a/job',
      owner: null,
      runs: 4,
      retries: 1,
      fails: 2,
      lastStatus: 'retry',
      lastError: 'second',
      firstAt: '2026-10-30T05:00:00+01:00',
      lastAt: '2026-10-30T02:00:00+01:00',
    });
  });

  it('sorts rows by job whatever the log order', () => {
    write([line({ job: 'b' }), line({ job: 'a' }), line({ job: 'B' }), line({ job: 'a' })].join('\n'));
    const night = readNight(dir, NIGHT);
    expect(night.found && night.rows.map((r) => r.job)).toEqual(['B', 'a', 'b']);
  });
});
