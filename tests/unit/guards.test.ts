/**
 * P012 T005 — 保护冲突分类（classifyHunks）单元测试。
 *
 * 覆盖（任务卡完成定义：按冻结签名交付 classifyHunks，RawHunk 验证并
 * 分类为 blocked 或 pending）：
 *  - 冲突规则（项目书 §8.3）：非空范围重叠、纯插入端点拦截、相邻不冲突；
 *  - 固定 RawHunk 测试数据：坐标全部手算并以真实 fixture 文件逐字节
 *    核对（F01/F04/F06/F07/F08/F09 的 original.txt 切片与 protections.json
 *    一致；见证据 hand-computed 校验记录）；
 *  - 验证失败一律返回 { ok: false, errorCode: 'INVALID_PATCH' }，不返回
 *    部分结果（oldText 错配、越界、未排序、重叠、id 重复、保护非法）。
 */

import { describe, expect, it } from 'vitest';
import { classifyHunks } from '../../src/core/guards';
import type { ProtectedRange, RawHunk } from '../../src/domain/types';

// ---------------------------------------------------------------------------
// 固定测试数据（手算坐标，已与 tests/fixtures/EP-Fxx/original.txt 核对）
// ---------------------------------------------------------------------------

const F01_ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
const F01_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p2', start: 8, end: 17 },
];
const F01_HUNKS: RawHunk[] = [
  { id: 'h1', start: 0, end: 7, oldText: '请于周五确认。', newText: '请在周五前回复确认。' },
  { id: 'h2', start: 8, end: 17, oldText: '人数上限为30人。', newText: '人数上限为50人。' },
  { id: 'h3', start: 18, end: 23, oldText: '谢谢配合。', newText: '感谢配合。' },
];

const F04_ORIGINAL = '第一段受保护。\n第二段受保护。\n第三段受保护。';
const F04_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p1', start: 0, end: 7 },
  { id: 'prot-2', paragraphId: 'p2', start: 8, end: 15 },
  { id: 'prot-3', paragraphId: 'p3', start: 16, end: 23 },
];
const F04_HUNKS: RawHunk[] = [
  { id: 'h1', start: 0, end: 7, oldText: '第一段受保护。', newText: '第一段已改动。' },
  { id: 'h2', start: 8, end: 15, oldText: '第二段受保护。', newText: '第二段已改动。' },
  { id: 'h3', start: 16, end: 23, oldText: '第三段受保护。', newText: '第三段已改动。' },
];

const F06_ORIGINAL = '开头段不变。\n受保护段不得删除。\n结尾段需要改写。';
const F06_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p2', start: 7, end: 16 },
];
const F06_HUNKS: RawHunk[] = [
  // 删除保护段的 Hunk 必须含段末 LF [7,17)，否则重建改稿会多一个换行
  // （原稿 [16,17) 的 LF 与 [6,7) 的 LF 不能同时保留）。
  { id: 'h1', start: 7, end: 17, oldText: '受保护段不得删除。\n', newText: '' },
  { id: 'h2', start: 17, end: 25, oldText: '结尾段需要改写。', newText: '结尾段已经改写。' },
];

const F07_ORIGINAL = '第一段内容不变。\n第二段甲内容。\n第三段乙内容。\n第四段内容不变。';
const F07_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p2', start: 9, end: 16 },
];
const F07_HUNKS: RawHunk[] = [
  // 真实最小差异（FIX-T010-01 修复后的 EP-F07 金标准，T013-04）：
  // h1 [11,18) 删“段甲内容。\n第”，与保护 [9,16) 重叠 blocked；
  // h2 [20,21) 把“乙”换成“合并后的”，在第三段内 pending，可单独接受。
  // 旧版此处手写单 Hunk [9,24)，与修复后金标准矛盾，已改写。
  {
    id: 'h1',
    start: 11,
    end: 18,
    oldText: '段甲内容。\n第',
    newText: '',
  },
  {
    id: 'h2',
    start: 20,
    end: 21,
    oldText: '乙',
    newText: '合并后的',
  },
];

const F08_ORIGINAL = '保护段文字。\n普通段文字。';
const F08_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 },
];
const F08_HUNKS: RawHunk[] = [
  { id: 'h1', start: 6, end: 6, oldText: '', newText: '插入受阻。' },
  { id: 'h2', start: 13, end: 13, oldText: '', newText: '追加内容。' },
];

const F09_ORIGINAL =
  '注意：仅限内部使用。\n第一段正文。\n注意：仅限内部使用。\n第二段正文。';
const F09_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p1', start: 0, end: 10 },
];
const F09_HUNKS: RawHunk[] = [
  { id: 'h1', start: 11, end: 17, oldText: '第一段正文。', newText: '第一段正文修改版。' },
  {
    id: 'h2',
    start: 18,
    end: 28,
    oldText: '注意：仅限内部使用。',
    newText: '注意：仅限内部使用，请勿外传。',
  },
];

// ---------------------------------------------------------------------------
// 正常分类：证据——保护段删除、跨段替换、区间端点插入、重复句坐标映射
// ---------------------------------------------------------------------------

describe('classifyHunks 正常分类', () => {
  it('F01 混合采纳：保护段内的 30→50 改动 blocked，其余 pending', () => {
    const result = classifyHunks(F01_ORIGINAL, F01_HUNKS, F01_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks).toHaveLength(3);
    expect(result.hunks[0]).toMatchObject({ id: 'h1', conflicts: [], decision: 'pending' });
    expect(result.hunks[1]).toMatchObject({
      id: 'h2',
      conflicts: ['prot-1'],
      decision: 'blocked',
    });
    expect(result.hunks[2]).toMatchObject({ id: 'h3', conflicts: [], decision: 'pending' });
  });

  it('F04 全部保护：三个改动全部 blocked', () => {
    const result = classifyHunks(F04_ORIGINAL, F04_HUNKS, F04_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks.map((h) => h.decision)).toEqual(['blocked', 'blocked', 'blocked']);
    expect(result.hunks.map((h) => h.conflicts)).toEqual([['prot-1'], ['prot-2'], ['prot-3']]);
  });

  it('F06 保护段删除：删除保护段的 Hunk blocked，第三段改写 pending', () => {
    const result = classifyHunks(F06_ORIGINAL, F06_HUNKS, F06_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({
      id: 'h1',
      conflicts: ['prot-1'],
      decision: 'blocked',
    });
    expect(result.hunks[1]).toMatchObject({ id: 'h2', conflicts: [], decision: 'pending' });
  });

  it('F07 跨段替换：h1 [11,18) 与保护 [9,16) 重叠 blocked，h2 [20,21) 在第三段内 pending', () => {
    const result = classifyHunks(F07_ORIGINAL, F07_HUNKS, F07_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks).toHaveLength(2);
    expect(result.hunks[0]).toMatchObject({
      id: 'h1',
      conflicts: ['prot-1'],
      decision: 'blocked',
    });
    expect(result.hunks[1]).toMatchObject({
      id: 'h2',
      conflicts: [],
      decision: 'pending',
    });
  });

  it('F08 区间端点插入：[6,6) 紧贴保护段末端 blocked，文末 [13,13) pending', () => {
    const result = classifyHunks(F08_ORIGINAL, F08_HUNKS, F08_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({
      id: 'h1',
      conflicts: ['prot-1'],
      decision: 'blocked',
    });
    expect(result.hunks[1]).toMatchObject({ id: 'h2', conflicts: [], decision: 'pending' });
  });

  it('F08 纯插入在保护段起点 [0,0) 也冲突（左端点拦截）', () => {
    const hunks: RawHunk[] = [{ id: 'h1', start: 0, end: 0, oldText: '', newText: '前缀。' }];
    const result = classifyHunks(F08_ORIGINAL, hunks, F08_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({ conflicts: ['prot-1'], decision: 'blocked' });
  });

  it('F09 重复句坐标映射：改第二次出现的相同句子 pending，改第一次出现 blocked', () => {
    const result = classifyHunks(F09_ORIGINAL, F09_HUNKS, F09_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 第二次出现的“注意：仅限内部使用。”[18,28) 不在保护位置，可改。
    expect(result.hunks[1]).toMatchObject({ id: 'h2', conflicts: [], decision: 'pending' });
    const firstOccurrence: RawHunk[] = [
      { id: 'h0', start: 0, end: 10, oldText: '注意：仅限内部使用。', newText: '注意：可公开。' },
    ];
    const blocked = classifyHunks(F09_ORIGINAL, firstOccurrence, F09_PROTECTIONS);
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.hunks[0]).toMatchObject({ conflicts: ['prot-1'], decision: 'blocked' });
  });

  it('无保护时全部 pending；无 Hunk 时返回空数组', () => {
    const noProt = classifyHunks(F01_ORIGINAL, F01_HUNKS, []);
    expect(noProt.ok).toBe(true);
    if (!noProt.ok) return;
    expect(noProt.hunks.every((h) => h.decision === 'pending')).toBe(true);
    const noHunks = classifyHunks(F01_ORIGINAL, [], F01_PROTECTIONS);
    expect(noHunks).toEqual({ ok: true, hunks: [] });
  });

  it('一个 Hunk 与多个保护重叠时 conflicts 列出全部保护 id', () => {
    const protections: ProtectedRange[] = [
      { id: 'prot-a', paragraphId: 'p1', start: 0, end: 7 },
      { id: 'prot-b', paragraphId: 'p2', start: 8, end: 17 },
    ];
    const hunks: RawHunk[] = [
      { id: 'h1', start: 0, end: 17, oldText: '请于周五确认。\n人数上限为30人。', newText: '全改。' },
    ];
    const result = classifyHunks(F01_ORIGINAL, hunks, protections);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({
      conflicts: ['prot-a', 'prot-b'],
      decision: 'blocked',
    });
  });
});

// ---------------------------------------------------------------------------
// 边界语义：相邻不冲突、包含关系
// ---------------------------------------------------------------------------

describe('classifyHunks 边界语义', () => {
  it('替换紧贴保护段之后开始 [17,23)：a < e 不成立，不冲突', () => {
    const hunks: RawHunk[] = [
      { id: 'h1', start: 17, end: 23, oldText: '\n谢谢配合。', newText: '\n谢谢。' },
    ];
    // 注意：[17,23) 的 oldText 为原稿 [17,23) = '\n谢谢配合。'，手算核对。
    expect(F01_ORIGINAL.slice(17, 23)).toBe('\n谢谢配合。');
    const result = classifyHunks(F01_ORIGINAL, hunks, F01_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({ conflicts: [], decision: 'pending' });
  });

  it('替换紧贴保护段之前结束 [0,8)：b > s 不成立，不冲突', () => {
    const hunks: RawHunk[] = [
      { id: 'h1', start: 0, end: 8, oldText: '请于周五确认。\n', newText: '请确认。\n' },
    ];
    expect(F01_ORIGINAL.slice(0, 8)).toBe('请于周五确认。\n');
    const result = classifyHunks(F01_ORIGINAL, hunks, F01_PROTECTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hunks[0]).toMatchObject({ conflicts: [], decision: 'pending' });
  });

  it('Hunk 完全在保护范围内 / 保护完全在 Hunk 内，均冲突', () => {
    const inside: RawHunk[] = [
      { id: 'h1', start: 10, end: 15, oldText: '上限为30', newText: '上限为99' },
    ];
    expect(F01_ORIGINAL.slice(10, 15)).toBe('上限为30');
    const r1 = classifyHunks(F01_ORIGINAL, inside, F01_PROTECTIONS);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.hunks[0].decision).toBe('blocked');

    const wrapping: RawHunk[] = [
      { id: 'h1', start: 0, end: 23, oldText: F01_ORIGINAL, newText: '全文重写。' },
    ];
    const r2 = classifyHunks(F01_ORIGINAL, wrapping, F01_PROTECTIONS);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.hunks[0].decision).toBe('blocked');
  });

  it('分类不修改输入数组与 RawHunk 对象', () => {
    const hunks = structuredClone(F01_HUNKS);
    const protections = structuredClone(F01_PROTECTIONS);
    const before = JSON.stringify({ hunks, protections });
    const result = classifyHunks(F01_ORIGINAL, hunks, protections);
    expect(result.ok).toBe(true);
    expect(JSON.stringify({ hunks, protections })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 验证失败：全部返回 INVALID_PATCH，不返回部分结果
// ---------------------------------------------------------------------------

describe('classifyHunks 验证失败', () => {
  it('oldText 错配 → INVALID_PATCH', () => {
    const hunks: RawHunk[] = [
      { id: 'h1', start: 0, end: 7, oldText: '请于周五确认！', newText: '请确认。' },
    ];
    expect(classifyHunks(F01_ORIGINAL, hunks, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });

  it('Hunk 越界（end > 原稿长度）→ INVALID_PATCH', () => {
    const hunks: RawHunk[] = [
      { id: 'h1', start: 18, end: 24, oldText: '谢谢配合。', newText: '谢谢。' },
    ];
    expect(classifyHunks(F01_ORIGINAL, hunks, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });

  it('Hunk 负 start / start > end → INVALID_PATCH', () => {
    const negative: RawHunk[] = [
      { id: 'h1', start: -1, end: 7, oldText: '请于周五确认。', newText: '请确认。' },
    ];
    expect(classifyHunks(F01_ORIGINAL, negative, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
    const reversed: RawHunk[] = [
      { id: 'h1', start: 7, end: 0, oldText: '', newText: '请确认。' },
    ];
    expect(classifyHunks(F01_ORIGINAL, reversed, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });

  it('Hunk 未按升序 / 重叠 → INVALID_PATCH', () => {
    const unsorted: RawHunk[] = [F01_HUNKS[2], F01_HUNKS[0]];
    expect(classifyHunks(F01_ORIGINAL, unsorted, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
    const overlapping: RawHunk[] = [
      { id: 'h1', start: 0, end: 10, oldText: '请于周五确认。\n人数', newText: '甲。' },
      { id: 'h2', start: 8, end: 17, oldText: '人数上限为30人。', newText: '乙。' },
    ];
    expect(F01_ORIGINAL.slice(0, 10)).toBe('请于周五确认。\n人数');
    expect(classifyHunks(F01_ORIGINAL, overlapping, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });

  it('Hunk id 重复 / id 为空 → INVALID_PATCH', () => {
    const dup: RawHunk[] = [F01_HUNKS[0], { ...F01_HUNKS[2], id: 'h1' }];
    expect(classifyHunks(F01_ORIGINAL, dup, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
    const emptyId: RawHunk[] = [{ ...F01_HUNKS[0], id: '' }];
    expect(classifyHunks(F01_ORIGINAL, emptyId, F01_PROTECTIONS)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });

  it('保护范围非法：空区间 / 越界 / id 重复 → INVALID_PATCH', () => {
    const empty: ProtectedRange[] = [{ id: 'prot-1', paragraphId: 'p2', start: 8, end: 8 }];
    expect(classifyHunks(F01_ORIGINAL, F01_HUNKS, empty)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
    const outOfBounds: ProtectedRange[] = [
      { id: 'prot-1', paragraphId: 'p2', start: 8, end: 24 },
    ];
    expect(classifyHunks(F01_ORIGINAL, F01_HUNKS, outOfBounds)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
    const dup: ProtectedRange[] = [
      { id: 'prot-1', paragraphId: 'p2', start: 8, end: 17 },
      { id: 'prot-1', paragraphId: 'p2', start: 8, end: 17 },
    ];
    expect(classifyHunks(F01_ORIGINAL, F01_HUNKS, dup)).toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
    });
  });
});
