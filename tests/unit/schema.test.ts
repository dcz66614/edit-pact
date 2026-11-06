/**
 * P012 T002 — 契约 schema 单元测试。
 * 覆盖：SHA-256 已知向量、analysisId 构造性质、Zod 严格校验、
 * 全部 24 组 fixture 的 case.json / protections.json / decisions.json
 * 结构核对与 expected.txt 存在规则、EP-P01 冻结哈希复核。
 * 本文件不运行任何业务实现；expected.txt 的语义复核由
 * scripts/check-fixtures.mjs 的独立 oracle 执行。
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnalysisSchema,
  DecisionsFileSchema,
  FixtureCaseSchema,
  ProtectedRangeSchema,
  ReviewReceiptSchema,
  buildAnalysisIdPayload,
  computeAnalysisId,
  parseDecisionsFile,
  parseFixtureCase,
  parseProtectionsFile,
  sha256Hex,
} from '../../src/domain/schema';
import type { AnalysisIdInput } from '../../src/domain/schema';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));
const FIXTURE_IDS = Array.from({ length: 24 }, (_, i) => `EP-F${String(i + 1).padStart(2, '0')}`);

function readJson(dir: string, name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, dir, name), 'utf8'));
}

describe('sha256Hex', () => {
  it('matches the standard SHA-256 test vectors', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    await expect(sha256Hex('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('returns lowercase hex of length 64', async () => {
    const h = await sha256Hex('请于周五确认。');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('computeAnalysisId', () => {
  const base: AnalysisIdInput = {
    schemaVersion: '1.0.0',
    engineVersion: '1.0.0+jsdiff-8.0.0',
    revision: 1,
    jobId: 'job-test-1',
    originalHash: 'a'.repeat(64),
    candidateHash: 'b'.repeat(64),
    protections: [{ id: 'prot-1', paragraphId: 'p1', start: 0, end: 7 }],
  };

  it('pins the exact payload string (fixed field order)', () => {
    expect(buildAnalysisIdPayload(base)).toBe(
      `["1.0.0","1.0.0+jsdiff-8.0.0",1,"job-test-1","${'a'.repeat(64)}","${'b'.repeat(64)}",[["prot-1","p1",0,7]]]`,
    );
  });

  it('is deterministic for identical input', async () => {
    await expect(computeAnalysisId(base)).resolves.toBe(await computeAnalysisId(base));
  });

  it('changes when revision, jobId or a protection changes', async () => {
    const id = await computeAnalysisId(base);
    await expect(computeAnalysisId({ ...base, revision: 2 })).resolves.not.toBe(id);
    await expect(computeAnalysisId({ ...base, jobId: 'job-test-2' })).resolves.not.toBe(id);
    await expect(
      computeAnalysisId({
        ...base,
        protections: [{ id: 'prot-1', paragraphId: 'p1', start: 0, end: 8 }],
      }),
    ).resolves.not.toBe(id);
  });

  it('is insensitive to protection order (sorted by start/end/id)', async () => {
    const two = [
      { id: 'prot-1', paragraphId: 'p1', start: 0, end: 7 },
      { id: 'prot-2', paragraphId: 'p2', start: 8, end: 15 },
    ];
    const a = await computeAnalysisId({ ...base, protections: two });
    const b = await computeAnalysisId({ ...base, protections: [...two].reverse() });
    expect(a).toBe(b);
  });
});

describe('Zod contract schemas', () => {
  it('accepts a minimal valid Analysis and rejects a bad hash', () => {
    const valid = {
      schemaVersion: '1.0.0',
      engineVersion: '1.0.0+jsdiff-8.0.0',
      revision: 1,
      jobId: 'job-test-1',
      analysisId: 'c'.repeat(64),
      originalHash: 'a'.repeat(64),
      candidateHash: 'b'.repeat(64),
      protections: [],
      hunks: [],
    };
    expect(AnalysisSchema.safeParse(valid).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...valid, analysisId: 'not-a-hash' }).success).toBe(false);
  });

  it('rejects an empty protected range (end must be > start)', () => {
    expect(
      ProtectedRangeSchema.safeParse({ id: 'p', paragraphId: 'p1', start: 5, end: 5 }).success,
    ).toBe(false);
    expect(
      ProtectedRangeSchema.safeParse({ id: 'p', paragraphId: 'p1', start: 0, end: 7 }).success,
    ).toBe(true);
  });

  it('rejects a ReviewReceipt carrying body text (strict, no original/candidate)', () => {
    const base = {
      schemaVersion: '1.0.0',
      engineVersion: '1.0.0+jsdiff-8.0.0',
      analysisId: 'c'.repeat(64),
      revision: 1,
      decisionRevision: 1,
      originalHash: 'a'.repeat(64),
      candidateHash: 'b'.repeat(64),
      outputHash: 'd'.repeat(64),
      protections: [],
      protectedMappings: [],
      hunks: [],
      counts: { accepted: 0, rejected: 0, blocked: 0 },
    };
    expect(ReviewReceiptSchema.safeParse(base).success).toBe(true);
    expect(ReviewReceiptSchema.safeParse({ ...base, original: '正文不得进回执' }).success).toBe(false);
    expect(ReviewReceiptSchema.safeParse({ ...base, oldText: '旧文不得进回执' }).success).toBe(false);
  });

  it('requires an error code for error outcomes and a state for state outcomes', () => {
    const base = {
      id: 'EP-F99',
      kind: 'workflow',
      title: 't',
      description: 'd',
      originalFile: 'original.txt',
      actions: [{ type: 'clear' }],
      expectedOutcome: 'error',
      hasText: false,
    };
    expect(FixtureCaseSchema.safeParse(base).success).toBe(false);
    expect(FixtureCaseSchema.safeParse({ ...base, expectedErrorCode: 'CANCELLED' }).success).toBe(true);
  });

  it('requires newText on accepted decisions, not on rejected ones', () => {
    expect(
      DecisionsFileSchema.safeParse({
        version: '1.0.0',
        decisions: [{ start: 0, end: 7, decision: 'accepted' }],
      }).success,
    ).toBe(false);
    expect(
      DecisionsFileSchema.safeParse({
        version: '1.0.0',
        decisions: [
          { start: 0, end: 7, decision: 'accepted', newText: '新文字。' },
          { start: 8, end: 15, decision: 'rejected' },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('24 fixture groups', () => {
  it('every EP-F01..EP-F24 case.json parses and its id matches its directory', () => {
    for (const id of FIXTURE_IDS) {
      const parsed = parseFixtureCase(readJson(id, 'case.json'));
      expect(parsed.success, `${id} case.json must parse`).toBe(true);
      if (parsed.success) {
        expect(parsed.data.id).toBe(id);
      }
    }
  });

  it('declared files exist; protections/decisions parse when present', () => {
    for (const id of FIXTURE_IDS) {
      const c = parseFixtureCase(readJson(id, 'case.json'));
      expect(c.success).toBe(true);
      if (!c.success) continue;
      const dir = path.join(FIXTURES_DIR, id);
      for (const f of [c.data.originalFile, c.data.candidateFile, c.data.protectionsFile, c.data.decisionsFile]) {
        if (f) expect(existsSync(path.join(dir, f)), `${id} missing ${f}`).toBe(true);
      }
      if (c.data.protectionsFile) {
        expect(parseProtectionsFile(readJson(id, c.data.protectionsFile)).success, `${id} protections`).toBe(true);
      }
      if (c.data.decisionsFile) {
        expect(parseDecisionsFile(readJson(id, c.data.decisionsFile)).success, `${id} decisions`).toBe(true);
      }
    }
  });

  it('expected.txt exists exactly for success+hasText cases, and F12 is an empty file', () => {
    for (const id of FIXTURE_IDS) {
      const c = parseFixtureCase(readJson(id, 'case.json'));
      expect(c.success).toBe(true);
      if (!c.success) continue;
      const expectedPath = path.join(FIXTURES_DIR, id, 'expected.txt');
      const needsExpected =
        c.data.kind === 'compose' && c.data.expectedOutcome === 'success' && c.data.hasText;
      expect(existsSync(expectedPath), `${id} expected.txt presence`).toBe(needsExpected);
      if (id === 'EP-F12') {
        expect(statSync(expectedPath).size).toBe(0);
      }
    }
  });

  it('workflow v2 files referenced by actions exist', () => {
    for (const id of FIXTURE_IDS) {
      const c = parseFixtureCase(readJson(id, 'case.json'));
      if (!c.success) continue;
      for (const a of c.data.actions) {
        if ('file' in a && typeof a.file === 'string') {
          expect(existsSync(path.join(FIXTURES_DIR, id, a.file)), `${id} action file ${a.file}`).toBe(true);
        }
      }
    }
  });
});

describe('EP-P01 frozen performance sample', () => {
  it('is 2000 UTF-16 units with 100 substitutions and frozen hashes', () => {
    const dir = path.join(FIXTURES_DIR, 'perf', 'EP-P01');
    const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    const orig = readFileSync(path.join(dir, 'original.txt'), 'utf8');
    const cand = readFileSync(path.join(dir, 'candidate.txt'), 'utf8');
    const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
    expect(orig.length).toBe(2000);
    expect(cand.length).toBe(2000);
    expect(orig.split('\n').slice(0, 20).every((l) => l.length === 99)).toBe(true);
    let diff = 0;
    for (let i = 0; i < orig.length; i++) if (orig[i] !== cand[i]) diff++;
    expect(diff).toBe(100);
    expect(sha(orig)).toBe(meta.originalSha256);
    expect(sha(cand)).toBe(meta.candidateSha256);
    expect(meta.totalUtf16Units).toBe(2000);
    expect(meta.totalSubstitutions).toBe(100);
  });

  it('protects exactly lines 4, 8, 12, 16, 20 as whole lines', () => {
    const dir = path.join(FIXTURES_DIR, 'perf', 'EP-P01');
    const prot = JSON.parse(readFileSync(path.join(dir, 'protections.json'), 'utf8'));
    expect(prot.protections.map((p: { start: number; end: number }) => [p.start, p.end])).toEqual([
      [300, 399],
      [700, 799],
      [1100, 1199],
      [1500, 1599],
      [1900, 1999],
    ]);
  });
});

describe('fixture inventory', () => {
  it('covers the §9 matrix: 17 compose, 6 workflow, 1 validation', () => {
    const kinds: Record<string, number> = {};
    for (const id of FIXTURE_IDS) {
      const c = parseFixtureCase(readJson(id, 'case.json'));
      if (c.success) kinds[c.data.kind] = (kinds[c.data.kind] ?? 0) + 1;
    }
    expect(kinds).toEqual({ compose: 17, workflow: 6, validation: 1 });
    expect(readdirSync(FIXTURES_DIR).filter((d) => d.startsWith('EP-F')).length).toBe(24);
  });
});
