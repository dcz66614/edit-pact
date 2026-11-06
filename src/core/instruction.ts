/**
 * P012 改稿守约 Edit Pact — 改稿说明生成（FR03，FIX-T013-01）。
 *
 * 来源：项目书 §4 固定流程第 3 步、§6 FR03（P1）：
 * “可选复制改稿说明，然后自行去现有助手处理；应用不发送任何内容。”
 * “生成可选改稿说明 | P1 | 只复制用户当前看到的内容，不自动发送”。
 *
 * 本模块是纯字符串生成：输入只有用户当前在准备页看到的内容——
 * 修改目标（goal）、当前原稿草稿、当前显示为已选的保护范围；
 * 输出是一份可复制的说明文本。模块不读任何内部状态（无 analysisId、
 * 无 revision、无哈希、无决定），不调用任何网络或剪贴板接口，
 * 不发送任何内容——复制动作由调用方经既有 copyToClipboard 完成。
 *
 * 说明内容约定（只含可见内容）：
 *  - 修改目标原文（未填时写“未填写”）；
 *  - 每段受保护段落的段号与逐字原文（按原稿顺序）；
 *  - 无保护时明写“本轮没有受保护段落”；
 *  - 一句使用提示（不要改动受保护段落；其他段落可按目标调整）
 *    与一句不发送声明。
 */

import { splitParagraphs } from './text';
import type { ProtectedRange } from '../domain/types';

export interface InstructionInput {
  /** 用户填写的修改目标（可为空）。 */
  goal: string;
  /** 用户当前看到的原稿文本（准备页草稿）。 */
  original: string;
  /** 当前显示为已选的保护范围（须与 original 中的段落对应）。 */
  protections: readonly ProtectedRange[];
}

/**
 * 生成改稿说明文本。只含用户当前看到的内容，不含任何内部标识。
 * 保护范围若在原稿中找不到对应段落（陈旧范围），回退为按坐标
 * 切片原文，保证不凭空编造段号。
 */
export function buildInstructionText({
  goal,
  original,
  protections,
}: InstructionInput): string {
  const paragraphs = splitParagraphs(original);
  const lines: string[] = [];
  lines.push('改稿说明');
  const trimmedGoal = goal.trim();
  lines.push(`修改目标：${trimmedGoal === '' ? '未填写' : goal}`);
  if (protections.length === 0) {
    lines.push('必须逐字保留的段落：无。本轮没有受保护段落，改稿可调整任何段落。');
  } else {
    lines.push(`必须逐字保留的段落（共 ${protections.length} 段）：`);
    for (const prot of protections) {
      const index = paragraphs.findIndex((p) => p.id === prot.paragraphId);
      if (index >= 0) {
        lines.push(`第 ${index + 1} 段：${paragraphs[index].text}`);
      } else {
        // 陈旧保护范围：无段号可写，只按坐标给出原文，不编造。
        lines.push(`受保护段落：${original.slice(prot.start, prot.end)}`);
      }
    }
  }
  lines.push(
    '请按以上要求改稿：不要改动受保护段落的任何文字；其他段落可按修改目标调整。',
  );
  lines.push(
    '（本说明只包含你当前看到的内容；本应用不会发送任何内容，请自行粘贴给你的 AI 助手。）',
  );
  return lines.join('\n');
}
