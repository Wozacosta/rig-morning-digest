import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { DigestPage } from './views/digest.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const result = readNight(config.runsDir, night);
    if (!result.found) {
      return c.html(
        <Layout title="not found" lane={lane()}>
          <h1>not found</h1>
          <p class="mute">no digest for {night}</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage night={night} rows={result.rows} badLines={result.badLines} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));
    if (!result.found) return c.json({ found: false }, 404);
    return c.json({ rows: result.rows, badLines: result.badLines });
  });

  return app;
}
