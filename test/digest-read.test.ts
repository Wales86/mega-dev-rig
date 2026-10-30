import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only: the real night is only read, everything else goes to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 5 jobs, sorted by job, and counts the 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.night).toBe('2026-10-28');
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(digest!.badLines).toBe(1);
    expect(digest!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps a row whose owner is null', () => {
    expect(digest!.rows.find((r) => r.job === 'digest/render')).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });
  });

  it('counts 3 retries for fixtures/refresh and keeps its last error after the ok', () => {
    expect(digest!.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps first and last time with the log offset, and the fail', () => {
    const sync = digest!.rows.find((r) => r.job === 'lane/sync')!;
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(digest!.rows.find((r) => r.job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(digest))).toEqual(digest);
  });
});

describe('readNight in a temp runs dir', () => {
  it('reads an empty file as a night where nothing ran', () => {
    writeFileSync(join(tmp, '2026-10-01.jsonl'), '');
    expect(readNight(tmp, '2026-10-01')).toEqual({
      night: '2026-10-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('returns null for a missing file', () => {
    expect(readNight(tmp, '2026-10-02')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(tmp, 'notes.jsonl'), '');
    expect(readNight(tmp, 'notes')).toBeNull();
    expect(readNight(tmp, '../2026-10-01')).toBeNull();
  });

  it('skips blank lines and counts lines that are not a RunLine as bad', () => {
    const lines = [
      '{"at":"2026-10-03T01:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
      '',
      '   ',
      '42',
      '{"at":"2026-10-03T01:00:00+02:00","job":"a","status":"done","owner":"rook"}',
      '{"at":"2026-10-03T01:00:00+02:00","job":"a","status":"ok"}',
      '{"at":"2026-10-03T02:00:00+02:00","job":"a","status":"retry","owner":"rook","error":"x"}\r',
    ];
    writeFileSync(join(tmp, '2026-10-03.jsonl'), lines.join('\n') + '\n');
    const digest = readNight(tmp, '2026-10-03');
    expect(digest!.badLines).toBe(3);
    expect(digest!.rows).toEqual([
      {
        job: 'a',
        owner: 'rook',
        runs: 2,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'x',
        firstAt: '2026-10-03T01:00:00+02:00',
        lastAt: '2026-10-03T02:00:00+02:00',
      },
    ]);
  });
});
