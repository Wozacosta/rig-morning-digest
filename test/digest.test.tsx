import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir: 'runs' });

describe('GET /digest/:night', () => {
  it('renders a night', async () => {
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table>');
    expect(html).toContain('bad lines:');
  });

  it('404s through the layout', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<header>');
  });
});
