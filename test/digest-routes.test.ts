import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

// runs/ is read-only fixtures: build a temp runs dir for route testing.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const config: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: tmp,
};

const app = createApp(config);

// Fixture 1: normal night with multiple jobs (written out of order to verify sorting)
writeFileSync(
  join(tmp, '2026-10-15.jsonl'),
  [
    JSON.stringify({ at: '2026-10-15T01:00:00+01:00', job: 'job-c', status: 'ok', owner: 'rook' }),
    JSON.stringify({ at: '2026-10-15T01:05:00+01:00', job: 'job-a', status: 'retry', owner: 'rook' }),
    JSON.stringify({ at: '2026-10-15T01:10:00+01:00', job: 'job-a', status: 'ok', owner: 'rook' }),
    JSON.stringify({ at: '2026-10-15T01:15:00+01:00', job: 'job-b', status: 'fail', owner: 'bishop', error: 'boom' }),
  ].join('\n') + '\n',
);

// Fixture 2: empty night
writeFileSync(join(tmp, '2026-10-01.jsonl'), '');

// Fixture 3: night with a bad line (and jobs out of order)
writeFileSync(
  join(tmp, '2026-10-02.jsonl'),
  [
    JSON.stringify({ at: '2026-10-02T01:00:00+01:00', job: 'job-y', status: 'ok', owner: 'rook' }),
    'this line is not valid json',
    JSON.stringify({ at: '2026-10-02T02:00:00+01:00', job: 'job-x', status: 'ok', owner: null }),
  ].join('\n') + '\n',
);

describe('GET /digest/:night', () => {
  it('returns 200 and renders jobs in alphabetical order', async () => {
    const res = await app.request('/digest/2026-10-15');
    expect(res.status).toBe(200);
    const html = await res.text();
    const idxA = html.indexOf('job-a');
    const idxB = html.indexOf('job-b');
    const idxC = html.indexOf('job-c');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
    expect(idxC).toBeGreaterThan(idxB);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-10-99');
    expect(res.status).toBe(404);
  });

  it('returns 200 and renders "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-10-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
  });

  it('returns 200 and renders valid jobs in order when night has a bad line', async () => {
    const res = await app.request('/digest/2026-10-02');
    expect(res.status).toBe(200);
    const html = await res.text();
    const idxX = html.indexOf('job-x');
    const idxY = html.indexOf('job-y');
    expect(idxX).toBeGreaterThan(-1);
    expect(idxY).toBeGreaterThan(idxX);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 and NightDigest JSON with jobs in order', async () => {
    const res = await app.request('/api/digest/2026-10-15');
    expect(res.status).toBe(200);
    const digest = (await res.json()) as NightDigest;
    expect(digest.night).toBe('2026-10-15');
    expect(digest.badLines).toBe(0);
    expect(digest.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(digest.rows.map((r) => r.job)).toEqual(['job-a', 'job-b', 'job-c']);
    expect(digest.rows).toEqual([
      {
        job: 'job-a',
        owner: 'rook',
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-15T01:05:00+01:00',
        lastAt: '2026-10-15T01:10:00+01:00',
      },
      {
        job: 'job-b',
        owner: 'bishop',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-10-15T01:15:00+01:00',
        lastAt: '2026-10-15T01:15:00+01:00',
      },
      {
        job: 'job-c',
        owner: 'rook',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-15T01:00:00+01:00',
        lastAt: '2026-10-15T01:00:00+01:00',
      },
    ]);
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-10-99');
    expect(res.status).toBe(404);
  });

  it('returns 200 and empty NightDigest for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-01');
    expect(res.status).toBe(200);
    const digest = (await res.json()) as NightDigest;
    expect(digest).toEqual({
      night: '2026-10-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('returns 200 and reports badLines count in NightDigest', async () => {
    const res = await app.request('/api/digest/2026-10-02');
    expect(res.status).toBe(200);
    const digest = (await res.json()) as NightDigest;
    expect(digest.night).toBe('2026-10-02');
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
    expect(digest.rows.map((r) => r.job)).toEqual(['job-x', 'job-y']);
    expect(digest.rows[0].job).toBe('job-x');
    expect(digest.rows[0].owner).toBeNull();
  });
});
