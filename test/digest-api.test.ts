import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const app = createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' });

describe('GET /api/digest/:night', () => {
  it('has the same jobs in the same order as the page', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: DigestRow[]; badLines: number };

    const html = await (await app.request('/digest/2026-10-28')).text();
    const body = html.slice(html.indexOf('<tbody>'));
    const pageJobs = [...body.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);

    expect(pageJobs.length).toBeGreaterThan(0);
    expect(json.rows.map((r) => r.job)).toEqual(pageJobs);
    expect(html).toContain(`bad lines: ${json.badLines}`);
  });

  it('404s as JSON', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ found: false });
  });
});
