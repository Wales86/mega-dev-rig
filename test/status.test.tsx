import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';

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

  it('links each night to its digest and shows counts', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> · 10 ok · 4 retry · 1 fail');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a> · 7 ok · 0 retry · 0 fail');
  });

  it('renders link without counts when readNight returns null', () => {
    const status = readStatus(config, () => null);
    expect(status.nights[0]).toEqual({ night: '2026-10-28', counts: null });

    const board = (
      <StatusBoard
        status={{
          adapter: 'shim',
          installed: '2026-10-29T14:06:00+01:00',
          lastBeat: null,
          nights: [{ night: '2026-10-28', counts: null }],
        }}
      />
    );
    expect(board.toString()).toContain('<li><a href="/digest/2026-10-28">2026-10-28</a></li>');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('renders nothing in runs/ when no nights exist', async () => {
    const emptyConfig = { ...config, runsDir: 'non-existent-dir' };
    const res = await createApp(emptyConfig).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing in runs/');
  });
});
