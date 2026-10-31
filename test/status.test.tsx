import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

describe('status board links', () => {
  it('links every night to a digest that renders, with counts', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    for (const night of ['2026-10-27', '2026-10-28']) {
      expect(html).toContain(`href="/digest/${night}"`);
      const res = await app.request(`/digest/${night}`);
      expect(res.status).toBe(200);
    }
    expect(html).toMatch(/2026-10-28<\/a> · ok \d+ · retry \d+ · fail\s*\d+/);
  });
});
