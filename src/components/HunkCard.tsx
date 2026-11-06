/**
 * P012 改稿守约 Edit Pact — 单条变更卡片（T008）。
 *
 * 纯 props 组件：不持有业务状态（展开/收起的局部显示状态除外），
 * 不调用任何核心规则，不直接写 session。所有决定经 onDecision
 * 回传给父组件，由 T006 的 reducer 处理；blocked 的 Hunk 不提供
 * 接受入口（项目书 §8.3、实施计划 §1 约束 4）。
 *
 * 显示规则：
 *  - 变更条目展示“原稿第几段”、删除文字、新增文字，以及
 *    “采用这处修改” / “保留原文”（项目书 §7.1）；
 *  - 纯插入在相邻位置展示上下文：含插入点的完整段落，插入点处
 *    标出“【插入点】”；
 *  - 差异显示包含所在完整段上下文（项目书 §8.5），变更片段在
 *    段落内以标记区分；跨段变更展示全部受影响段落；
 *  - 过长的新旧文字（>200 字）先显示前 200 字 + “……”，可展开
 *    全文（与 T007 长段折叠约定一致的显式约定）；
 *  - 不显示真实性评分或伪百分比进度；状态只用文字表达。
 */

import { useState } from 'react';
import { splitParagraphs } from '../core/text';
import type { Hunk, Paragraph, ProtectedRange } from '../domain/types';

/** 长文本折叠阈值（UTF-16 单元数）：与 T007 长段折叠约定一致。 */
export const LONG_TEXT_CHARS = 200;

export interface HunkCardProps {
  /** 本卡对应的 Hunk（decision 由父组件持有）。 */
  hunk: Hunk;
  /** 序号（第几处改动），由 ReviewPanel 传入；不传则不显示序号。 */
  index?: number;
  /** 规范化原稿全文（用于定位段落与显示上下文）。 */
  original: string;
  /** 本轮保护范围（用于标注冲突段号与显示保护原因）。 */
  protections: ProtectedRange[];
  /** 接受/保留原文；blocked 不会调用（无接受入口）。 */
  onDecision: (hunkId: string, decision: 'accepted' | 'rejected') => void;
  /** 返回调整保护（仅 blocked 卡显示；不传则不渲染该按钮）。 */
  onBackToProtections?: () => void;
}

/** 变更类型：替换 / 删除 / 纯插入（按 oldText/newText 是否为空判定）。 */
export type HunkKind = 'replace' | 'delete' | 'insert';

export function hunkKind(hunk: Hunk): HunkKind {
  if (hunk.oldText === '') {
    return 'insert';
  }
  if (hunk.newText === '') {
    return 'delete';
  }
  return 'replace';
}

function hunkKindLabel(kind: HunkKind): string {
  switch (kind) {
    case 'insert':
      return '纯插入';
    case 'delete':
      return '删除';
    case 'replace':
      return '替换';
  }
}

/**
 * 位置所属段落（0 起始序号）：
 *  - 位置落在某段 [start, end) 内，归属该段；
 *  - 位置恰在段末 LF 处或文末，归属到在该位置结束的段落
 *    （纯插入紧贴段末时属于该段，而非下一段）。
 */
export function paragraphIndexForPosition(
  paragraphs: Paragraph[],
  pos: number,
): number {
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (pos >= p.start && pos < p.end) {
      return i;
    }
  }
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (paragraphs[i].end <= pos) {
      return i;
    }
  }
  return 0;
}

/** Hunk 覆盖的段落（0 起始序号列表）；纯插入取插入点所在段。 */
export function paragraphIndicesForHunk(
  paragraphs: Paragraph[],
  hunk: Hunk,
): number[] {
  if (hunk.start === hunk.end) {
    return [paragraphIndexForPosition(paragraphs, hunk.start)];
  }
  const indices: number[] = [];
  paragraphs.forEach((p, i) => {
    if (p.start < hunk.end && p.end > hunk.start) {
      indices.push(i);
    }
  });
  return indices.length > 0
    ? indices
    : [paragraphIndexForPosition(paragraphs, hunk.start)];
}

/**
 * 冲突保护范围对应的段号（1 起始，去重升序）。
 * 按 protection.paragraphId 找段落；找不到时回退到按范围起点定位。
 */
export function conflictParagraphNumbers(
  conflicts: readonly string[],
  protections: readonly ProtectedRange[],
  paragraphs: Paragraph[],
): number[] {
  const numbers = new Set<number>();
  for (const conflictId of conflicts) {
    const prot = protections.find((p) => p.id === conflictId);
    if (prot === undefined) {
      continue;
    }
    const byId = paragraphs.findIndex((p) => p.id === prot.paragraphId);
    if (byId >= 0) {
      numbers.add(byId + 1);
    } else {
      numbers.add(paragraphIndexForPosition(paragraphs, prot.start) + 1);
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

function joinNumbers(numbers: readonly number[]): string {
  return numbers.map((n) => `第 ${n} 段`).join('、');
}

function decisionStatusText(hunk: Hunk): string {
  // 有冲突即按 blocked 显示（classifyHunks 恒把冲突标为 blocked；
  // 即便 decision 字段被篡改，界面也不把冲突项当作可审项）。
  if (hunk.conflicts.length > 0) {
    return '保护冲突，已保留原文';
  }
  switch (hunk.decision) {
    case 'pending':
      return '待审';
    case 'accepted':
      return '已采用';
    case 'rejected':
      return '已保留原文';
    case 'blocked':
      return '保护冲突，已保留原文';
  }
}

/**
 * 空白类文本的可见标记（FIX-T013-09）：Hunk 恰为 "\n"（删除换行、合并
 * 两段）时，删除/新增文字栏与上下文变更片段会渲染为空白；功能正确，
 * 但展示不清。纯空白文本改以文字标记展示，不改动任何业务语义。
 */
function blankTextLabel(text: string): string | null {
  if (text.trim() !== '') {
    return null;
  }
  if (text === '\n') {
    return '（换行符）';
  }
  return `（空白，共 ${text.length} 字）`;
}

/** 可折叠长文本：超过阈值先显示前 200 字 + “……”，可展开全文。 */
function FoldableText({ text, label }: { text: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const blankLabel = blankTextLabel(text);
  if (blankLabel !== null) {
    return <span className="hunk-foldable">{blankLabel}</span>;
  }
  const isLong = text.length > LONG_TEXT_CHARS;
  const shown =
    isLong && !expanded ? `${text.slice(0, LONG_TEXT_CHARS)}……` : text;
  return (
    <span className="hunk-foldable">
      <span className="hunk-foldable-text">{shown}</span>
      {isLong ? (
        <button
          type="button"
          className="hunk-expand"
          aria-expanded={expanded}
          aria-label={`${label}${expanded ? '收起' : '展开全文'}`}
          onClick={() => {
            setExpanded((prev) => !prev);
          }}
        >
          {expanded ? '收起' : `展开全文（共 ${text.length} 字）`}
        </button>
      ) : null}
    </span>
  );
}

/**
 * 一段上下文：完整段落文字，变更片段以标记区分；
 * 纯插入则在插入点处标出“【插入点】”。
 */
function ContextParagraph({
  paragraph,
  paragraphNumber,
  hunk,
}: {
  paragraph: Paragraph;
  paragraphNumber: number;
  hunk: Hunk;
}) {
  const isInsert = hunk.start === hunk.end;
  const relStart = Math.max(0, hunk.start - paragraph.start);
  const relEnd = Math.min(paragraph.text.length, hunk.end - paragraph.start);
  const before = paragraph.text.slice(0, relStart);
  const changed = isInsert ? '' : paragraph.text.slice(relStart, relEnd);
  const after = paragraph.text.slice(relEnd);
  // 非插入 Hunk 在本段内无可见变更片段时，说明该 Hunk 只覆盖段末
  // 换行（如删除空行合并两段），以“（换行符）”标出，不留空白。
  const changedLabel =
    !isInsert && changed === '' ? '（换行符）' : changed;
  return (
    <p className="hunk-context-paragraph">
      <span className="hunk-context-index">第 {paragraphNumber} 段：</span>
      <span className="hunk-context-text">
        {before}
        {isInsert ? (
          <span className="hunk-insertion-marker">【插入点】</span>
        ) : (
          <mark className="hunk-context-changed">{changedLabel}</mark>
        )}
        {after}
      </span>
    </p>
  );
}

export function HunkCard({
  hunk,
  index,
  original,
  protections,
  onDecision,
  onBackToProtections,
}: HunkCardProps) {
  const paragraphs = splitParagraphs(original);
  const kind = hunkKind(hunk);
  const indices = paragraphIndicesForHunk(paragraphs, hunk);
  const paragraphNumbers = indices.map((i) => i + 1);
  const isBlocked = hunk.decision === 'blocked' || hunk.conflicts.length > 0;
  const conflictNumbers = conflictParagraphNumbers(
    hunk.conflicts,
    protections,
    paragraphs,
  );

  return (
    <article
      className={`hunk-card hunk-card--${hunk.decision}`}
      aria-label={
        index !== undefined
          ? `第 ${index} 处改动，原稿${joinNumbers(paragraphNumbers)}`
          : `一处改动，原稿${joinNumbers(paragraphNumbers)}`
      }
    >
      <header className="hunk-header">
        <span className="hunk-title">
          {index !== undefined ? `第 ${index} 处改动` : '一处改动'}
          {' · '}
          原稿{joinNumbers(paragraphNumbers)}
          {' · '}
          {hunkKindLabel(kind)}
        </span>
        <span className="hunk-status" role="status">
          {decisionStatusText(hunk)}
        </span>
      </header>

      <div className="hunk-context" aria-label="所在段落上下文">
        {indices.map((i) => (
          <ContextParagraph
            key={paragraphs[i].id}
            paragraph={paragraphs[i]}
            paragraphNumber={i + 1}
            hunk={hunk}
          />
        ))}
      </div>

      <dl className="hunk-texts">
        <div className="hunk-text-row">
          <dt className="hunk-text-label">删除文字</dt>
          <dd className="hunk-text-value">
            {hunk.oldText === '' ? (
              <span className="hunk-empty-note">（无，纯插入）</span>
            ) : (
              <FoldableText text={hunk.oldText} label="删除文字" />
            )}
          </dd>
        </div>
        <div className="hunk-text-row">
          <dt className="hunk-text-label">新增文字</dt>
          <dd className="hunk-text-value">
            {hunk.newText === '' ? (
              <span className="hunk-empty-note">（无，整处删除）</span>
            ) : (
              <FoldableText text={hunk.newText} label="新增文字" />
            )}
          </dd>
        </div>
      </dl>

      {isBlocked ? (
        <p className="hunk-blocked-note" role="alert">
          这处修改碰到了你保护的
          {conflictNumbers.length > 0
            ? joinNumbers(conflictNumbers)
            : '受保护段落'}
          ，成稿保留原文。
        </p>
      ) : null}

      <div className="hunk-actions">
        {isBlocked ? (
          onBackToProtections !== undefined ? (
            <button
              type="button"
              className="hunk-back-button"
              onClick={onBackToProtections}
            >
              返回调整保护
            </button>
          ) : null
        ) : (
          <>
            <button
              type="button"
              className="hunk-accept-button"
              disabled={hunk.decision === 'accepted'}
              aria-pressed={hunk.decision === 'accepted'}
              onClick={() => {
                onDecision(hunk.id, 'accepted');
              }}
            >
              采用这处修改
            </button>
            <button
              type="button"
              className="hunk-reject-button"
              disabled={hunk.decision === 'rejected'}
              aria-pressed={hunk.decision === 'rejected'}
              onClick={() => {
                onDecision(hunk.id, 'rejected');
              }}
            >
              保留原文
            </button>
          </>
        )}
      </div>
    </article>
  );
}
