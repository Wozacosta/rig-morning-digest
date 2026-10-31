import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

// A temp runs dir, so the tests never touch runs/ and every night is one we wrote.
const at = '2026-10-29T05:00:00+01:00';
const line = (fields: Record<string, unknown>) =>
  JSON.stringify({ at, job: 'lane/sync', status: 'ok', owner: 'rook', ...fields });

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // A clean night: two jobs, one with no owner on its last line.
  writeFileSync(
    join(runsDir, '2026-10-29.jsonl'),
    [line({}), line({ job: 'digest/render', owner: null, at: '2026-10-29T05:10:00+01:00' })].join('\n'),
  );
  // An empty night: the file exists, no lines.
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
  // A night with one line that does not parse.
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), [line({}), 'not json'].join('\n'));
  // A file whose name is not a real date: it must 404 even though the file exists.
  writeFileSync(join(runsDir, '2026-02-30.jsonl'), line({}));

  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders the rows of a night with no bad lines', async () => {
    const res = await app.request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table>');
    expect(html).toContain('bad lines: 0');
    const body = html.slice(html.indexOf('<tbody>'));
    const jobs = [...body.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(jobs).toEqual(['digest/render', 'lane/sync']);
  });

  it('404s through the layout for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('<header>');
    expect(html).toContain('no digest for 2026-10-30');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
    expect(html).toContain('bad lines: 0');
  });

  it('renders a night with a bad line and counts it', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table>');
    expect(html).toContain('bad lines: 1');
  });

  it('404s a night parameter that is not a date, even with a file of that name', async () => {
    const res = await app.request('/digest/2026-02-30');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<header>');
  });

  it('renders a null owner as —', async () => {
    const html = await (await app.request('/digest/2026-10-29')).text();
    expect(html).toMatch(/<td>digest\/render<\/td><td>—<\/td>/);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows of a night with no bad lines', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: DigestRow[]; badLines: number };
    expect(json.badLines).toBe(0);
    expect(json.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });

  it('404s as JSON for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ found: false });
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('returns a night with a bad line, counting it', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: DigestRow[]; badLines: number };
    expect(json.badLines).toBe(1);
    expect(json.rows.map((r) => r.job)).toEqual(['lane/sync']);
  });

  it('404s as JSON for a night parameter that is not a date', async () => {
    const res = await app.request('/api/digest/2026-02-30');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ found: false });
  });

  it('keeps a null owner as null', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    const json = (await res.json()) as { rows: DigestRow[] };
    const render = json.rows.find((r) => r.job === 'digest/render');
    expect(render?.owner).toBeNull();
    expect(json.rows.find((r) => r.job === 'lane/sync')?.owner).toBe('rook');
  });
});
