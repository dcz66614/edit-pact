/**
 * P012 FIX-T013-01 — 改稿说明生成（FR03）单元测试。
 *
 * 覆盖（项目书 §4 第 3 步、§6 FR03）：
 *  - 说明内容与可见状态一致：目标原文、受保护段落的段号与逐字原文、
 *    段数；无保护/未填目标时明写；
 *  - 不含任何内部标识（保护 id、analysisId、revision、哈希）；
 *  - 无发送行为：生成模块源码中无任何网络/剪贴板调用（复制由调用方
 *    经既有 copyToClipboard 完成，本模块只做纯字符串拼接）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildInstructionText } from '../../src/core/instruction';
import type { ProtectedRange } from '../../src/domain/types';

const ORIGINAL =
  '第一段内容不变。\n第二段甲内容。\n第三段乙内容。\n第四段内容不变。';
const PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p2', start: 9, end: 16 },
];

describe('buildInstructionText', () => {
  it('含目标原文与受保护段落的段号、逐字原文与段数', () => {
    const text = buildInstructionText({
      goal: '语气更正式，但不要改时间地点',
      original: ORIGINAL,
      protections: PROTECTIONS,
    });
    expect(text).toContain('修改目标：语气更正式，但不要改时间地点');
    expect(text).toContain('必须逐字保留的段落（共 1 段）：');
    expect(text).toContain('第 2 段：第二段甲内容。');
    expect(text).toContain('不要改动受保护段落的任何文字');
    expect(text).toContain('不会发送任何内容');
  });

  it('未填目标写“未填写”；无保护时明写没有受保护段落', () => {
    const text = buildInstructionText({
      goal: '   ',
      original: ORIGINAL,
      protections: [],
    });
    expect(text).toContain('修改目标：未填写');
    expect(text).toContain('必须逐字保留的段落：无。');
    expect(text).toContain('没有受保护段落');
  });

  it('只含可见内容：不含任何内部标识', () => {
    const text = buildInstructionText({
      goal: '改得简短些',
      original: ORIGINAL,
      protections: PROTECTIONS,
    });
    for (const banned of [
      'prot-1',
      'analysisId',
      'revision',
      'jobId',
      'hash',
      'Hash',
      'sha256',
    ]) {
      expect(text).not.toContain(banned);
    }
    // 不含未受保护段落的原文（只复制保护段，不把整篇原稿塞进说明）。
    expect(text).not.toContain('第一段内容不变。');
    expect(text).not.toContain('第三段乙内容。');
  });

  it('陈旧保护范围（段落 id 不存在）不编造段号，按坐标给出原文', () => {
    const text = buildInstructionText({
      goal: '',
      original: ORIGINAL,
      protections: [
        { id: 'prot-9', paragraphId: 'p99', start: 9, end: 16 },
      ],
    });
    expect(text).not.toContain('第 99 段');
    expect(text).toContain('受保护段落：第二段甲内容。');
  });

  it('无发送行为：生成模块源码中无网络/剪贴板调用', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/core/instruction.ts', import.meta.url)),
      'utf8',
    );
    for (const banned of [
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
      'sendBeacon',
      'navigator.clipboard',
      'clipboard.writeText',
    ]) {
      expect(source).not.toContain(banned);
    }
    // 本模块只做纯字符串拼接：仅有的两个导入是 text 工具与类型定义。
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(
      (m) => m[1],
    );
    expect(imports).toEqual(['./text', '../domain/types']);
  });
});
