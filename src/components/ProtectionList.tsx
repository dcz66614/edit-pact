/**
 * P012 改稿守约 Edit Pact — 保护段落列表（T007）。
 *
 * 纯 props 组件：不持有原文、不猜测敏感信息、不调用任何核心规则。
 * 段落与坐标来自 T003 的 splitParagraphs；保护范围的形状遵循
 * T002 冻结的 ProtectedRange（id 按段落在原文中的顺序编号 prot-1…）。
 *
 * 键盘操作：复选框为原生 <input type="checkbox">，真实浏览器中
 * Tab 聚焦后按空格即可切换。jsdom 未实现空格键对复选框的原生
 * 激活行为，因此组件另在 keydown 里处理空格（preventDefault 后
 * 手动切换一次）；真实浏览器里 preventDefault 会阻止原生切换，
 * 两种环境都恰好只切换一次，不会双重切换。
 */

import { useState } from 'react';
import type { Paragraph, ProtectedRange } from '../domain/types';

/** 最多保护的段落数（项目书 §7.1）。 */
export const MAX_PROTECTED_PARAGRAPHS = 20;

/** 长段折叠阈值（UTF-16 单元数）：超过此长度先显示前 200 字预览。 */
export const LONG_PARAGRAPH_CHARS = 200;

export interface ProtectionListProps {
  /** 按 LF 切分后的段落（T003 splitParagraphs 的输出）。 */
  paragraphs: Paragraph[];
  /** 已选保护段落的段落 id（与 protections 的 paragraphId 对应）。 */
  selectedParagraphIds: readonly string[];
  /** 最多保护段数，默认 20。 */
  maxProtected?: number;
  /** 切换某一段的保护选择；空白段永远不会触发。 */
  onToggleParagraph: (paragraph: Paragraph) => void;
}

/**
 * 由段落与已选 id 生成保护范围列表。
 * 只取非空白段；id 按段落在原文中的顺序编号（prot-1、prot-2…），
 * 与点击顺序无关，保证同一选择集合总得到同一范围列表。
 * 范围 [start, end) 为规范化原稿中的 UTF-16 坐标，不含段末 LF。
 */
export function protectionsForParagraphs(
  paragraphs: Paragraph[],
  selectedParagraphIds: readonly string[],
): ProtectedRange[] {
  const selected = new Set(selectedParagraphIds);
  return paragraphs
    .filter((p) => selected.has(p.id) && !p.isBlank)
    .map((p, i) => ({
      id: `prot-${i + 1}`,
      paragraphId: p.id,
      start: p.start,
      end: p.end,
    }));
}

export function ProtectionList({
  paragraphs,
  selectedParagraphIds,
  maxProtected = MAX_PROTECTED_PARAGRAPHS,
  onToggleParagraph,
}: ProtectionListProps) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selected = new Set(selectedParagraphIds);
  const selectedCount = paragraphs.filter(
    (p) => selected.has(p.id) && !p.isBlank,
  ).length;
  const atCap = selectedCount >= maxProtected;

  const toggleExpanded = (paragraphId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paragraphId)) {
        next.delete(paragraphId);
      } else {
        next.add(paragraphId);
      }
      return next;
    });
  };

  return (
    <div className="protection-list-wrap">
      <p className="protection-count" aria-live="polite">
        已保护 {selectedCount} 段（最多 {maxProtected} 段）
      </p>
      {atCap ? (
        <p className="protection-cap-note" role="status">
          已达到最多 {maxProtected} 段保护；取消一段后才能再选。
        </p>
      ) : null}
      <ul className="protection-list" aria-label="保护段落列表">
        {paragraphs.map((p, index) => {
          const isSelected = selected.has(p.id) && !p.isBlank;
          const isLong = p.text.length > LONG_PARAGRAPH_CHARS;
          const isExpanded = expandedIds.has(p.id);
          const shownText =
            isLong && !isExpanded
              ? `${p.text.slice(0, LONG_PARAGRAPH_CHARS)}……`
              : p.text;
          // 空白段不可保护；已达上限时未选中的非空白段也不可再选。
          const disabled = p.isBlank || (atCap && !isSelected);
          return (
            <li key={p.id} className="protection-row">
              <label className="protection-label">
                <input
                  type="checkbox"
                  className="protection-checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  aria-label={
                    p.isBlank
                      ? `第 ${index + 1} 段（空白段，不可保护）`
                      : `保护第 ${index + 1} 段`
                  }
                  onChange={() => {
                    onToggleParagraph(p);
                  }}
                  onKeyDown={(event) => {
                    // 空格键切换。真实浏览器里 preventDefault 会阻止
                    // 原生切换，本处理恰好只切换一次；jsdom 无原生
                    // 激活行为，本处理是唯一的切换路径。
                    if (event.key === ' ') {
                      event.preventDefault();
                      onToggleParagraph(p);
                    }
                  }}
                />
                <span className="protection-index">第 {index + 1} 段</span>
                {p.isBlank ? (
                  <span className="protection-blank-tag">空白段</span>
                ) : null}
                <span className="protection-text">
                  {p.text === '' ? '（空段）' : shownText}
                </span>
              </label>
              {isLong ? (
                <button
                  type="button"
                  className="protection-expand"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    toggleExpanded(p.id);
                  }}
                >
                  {isExpanded
                    ? '收起'
                    : `展开全文（共 ${p.text.length} 字）`}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
