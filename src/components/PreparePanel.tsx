/**
 * P012 改稿守约 Edit Pact — 原稿与保护设置面板（T007）。
 *
 * 纯 props 组件：不持有任何业务状态，不写本地存储，不联网。
 * 原稿、保护范围、修改目标全部由父组件（T009 接线）持有，
 * 本面板只负责展示与回传：
 *  - 原稿变化 → onOriginalChange（父组件按契约清除旧保护与决定）；
 *  - 保护勾选 → onProtectionsChange（保护范围 [start, end) 为
 *    规范化原稿中的 UTF-16 坐标，不含段末 LF）；
 *  - 修改目标 → onGoalChange（可选，最多 120 UTF-16 单元）。
 *
 * 本面板不猜测敏感信息：段落里的日期、人数、金额等一律不自动
 * 选中、不高亮，只保护用户亲手勾选的段落。内容只保存在内存中，
 * 刷新页面后丢失，面板内明确提示。
 */

import {
  canonicalize,
  splitParagraphs,
  truncateToUtf16Units,
  validateInput,
} from '../core/text';
import type { InputIssue, ProtectedRange } from '../domain/types';
import {
  MAX_PROTECTED_PARAGRAPHS,
  ProtectionList,
  protectionsForParagraphs,
} from './ProtectionList';
import './prepare.css';

/** 修改目标输入上限（UTF-16 单元数，项目书 §7.1）。 */
export const GOAL_MAX_UNITS = 120;

/**
 * 内置虚构例子（项目书 §7.2：原稿为空时显示的例子入口）。
 * 全文 34 字（含换行），在 80 字以内；内容纯属虚构，不含任何私人信息。
 */
export const DEFAULT_EXAMPLE_TEXT =
  '会议定于下周三上午十点开始。\n参会人数为十二人。\n地点在三楼会议室。';

export interface PreparePanelProps {
  /** 原稿原文（未规范化；段落与坐标按规范化后文本计算）。 */
  original: string;
  /** 原稿文本变化时回传完整新文本。 */
  onOriginalChange: (text: string) => void;
  /** 当前保护范围（父组件持有；原稿变化时由父组件清空）。 */
  protections: ProtectedRange[];
  /** 保护范围变化时回传完整新列表。 */
  onProtectionsChange: (protections: ProtectedRange[]) => void;
  /** 修改目标（可选，最多 120 UTF-16 单元）。 */
  goal: string;
  /** 修改目标变化时回传完整新文本。 */
  onGoalChange: (goal: string) => void;
  /** 改稿说明文本（FR03，项目书 §4 第 3 步）：只含用户当前看到的
   *  内容（目标 + 显示为已选的保护段落），由父组件生成。 */
  instructionText: string;
  /** 用户点击“复制改稿说明”时调用；只复制，不发送。 */
  onCopyInstruction: () => void;
  /** 改稿说明的复制状态：idle（未复制）/ copied / failed。 */
  instructionCopyState: 'idle' | 'copied' | 'failed';
  /** 内置虚构例子文本，默认 DEFAULT_EXAMPLE_TEXT。 */
  exampleText?: string;
  /**
   * 用户点击“开始比较”时调用；不传则不渲染该按钮。
   * 开始比较即冻结本轮保护契约（项目书 §7.2）。
   */
  onBeginCompare?: () => void;
}

function issueMessage(issue: InputIssue): string {
  switch (issue.code) {
    case 'INVALID_UNICODE':
      return `原稿含有不成对的代理字符（位置 ${issue.actual ?? '?'}），请修正后再比较。`;
    case 'TOO_LONG':
      return `原稿共 ${issue.actual ?? '?'} 字，超过上限 ${issue.limit ?? 12000} 字，请缩短后再比较。`;
    case 'TOO_MANY_PARAGRAPHS':
      return `原稿共 ${issue.actual ?? '?'} 段，超过上限 ${issue.limit ?? 200} 段，请合并段落后再比较。`;
    case 'EMPTY_ORIGINAL':
      return '原稿为空。';
    default:
      return '原稿输入有问题，请检查后再比较。';
  }
}

export function PreparePanel({
  original,
  onOriginalChange,
  protections,
  onProtectionsChange,
  goal,
  onGoalChange,
  instructionText,
  onCopyInstruction,
  instructionCopyState,
  exampleText = DEFAULT_EXAMPLE_TEXT,
  onBeginCompare,
}: PreparePanelProps) {
  const canonicalLength = canonicalize(original).length;
  const paragraphs = splitParagraphs(original);
  const issues = validateInput(original, 'original').filter(
    (issue) => issue.code !== 'EMPTY_ORIGINAL',
  );
  // 只认与当前段落逐字对应的保护（段落 id、起点、终点三者一致），
  // 陈旧范围不会被误显示为已选。
  const selectedParagraphIds = paragraphs
    .filter((p) =>
      protections.some(
        (prot) =>
          prot.paragraphId === p.id &&
          prot.start === p.start &&
          prot.end === p.end,
      ),
    )
    .map((p) => p.id);
  const selectedCount = selectedParagraphIds.length;
  const isEmpty = canonicalLength === 0;
  const hasBlockingIssue = issues.length > 0;

  const handleToggleParagraph = (paragraphId: string) => {
    const paragraph = paragraphs.find((p) => p.id === paragraphId);
    if (paragraph === undefined || paragraph.isBlank) {
      return;
    }
    const alreadySelected = selectedParagraphIds.includes(paragraphId);
    let nextSelected: string[];
    if (alreadySelected) {
      nextSelected = selectedParagraphIds.filter((id) => id !== paragraphId);
    } else {
      if (selectedCount >= MAX_PROTECTED_PARAGRAPHS) {
        return;
      }
      nextSelected = [...selectedParagraphIds, paragraphId];
    }
    onProtectionsChange(protectionsForParagraphs(paragraphs, nextSelected));
  };

  return (
    <section className="prepare-panel" aria-label="准备原稿">
      <h2 className="prepare-title">准备原稿</h2>
      <p className="prepare-notice">
        内容仅在本页处理，不上传、不保存；刷新页面后会丢失。
      </p>
      <p className="prepare-help">
        段落按换行切分：每一段是原文中的一行。勾选的段落将逐字保留，
        改稿不得改动其中的任何文字。本工具不猜测哪些内容敏感，
        只保护你亲手勾选的段落。
      </p>

      <div className="prepare-columns">
        <div className="prepare-original">
          <label className="prepare-label" htmlFor="prepare-original-input">
            原稿
          </label>
          <textarea
            id="prepare-original-input"
            className="prepare-textarea"
            value={original}
            rows={12}
            placeholder="粘贴原稿，例如一段通知、公告或说明……"
            onChange={(event) => {
              onOriginalChange(event.target.value);
            }}
          />
          {isEmpty ? (
            <div className="prepare-empty">
              <p>原稿还是空的。可以先载入一个虚构例子看看效果：</p>
              <button
                type="button"
                className="prepare-example-button"
                onClick={() => {
                  // 只有用户点击才载入；页面打开时不自动加载任何内容。
                  onOriginalChange(exampleText);
                }}
              >
                载入内置虚构例子
              </button>
              <p className="prepare-example-note">
                这是一个虚构例子，不会加载你的私人内容。
              </p>
            </div>
          ) : null}
          <label className="prepare-label" htmlFor="prepare-goal-input">
            修改目标（可选）
          </label>
          <input
            id="prepare-goal-input"
            className="prepare-goal-input"
            type="text"
            value={goal}
            maxLength={GOAL_MAX_UNITS}
            placeholder="例如：把语气改得更正式，但不要改时间地点"
            onChange={(event) => {
              // 按字位簇边界截断：不切开代理对与组合序列
              // （FIX-T013-08：原先的 slice(0, 120) 可切出不成对 surrogate）。
              onGoalChange(
                truncateToUtf16Units(event.target.value, GOAL_MAX_UNITS),
              );
            }}
          />
          <p className="prepare-goal-count" aria-live="polite">
            {goal.length}/{GOAL_MAX_UNITS} 字
          </p>
          <div className="prepare-instruction">
            <h3 className="prepare-subtitle">改稿说明（可选）</h3>
            <p className="prepare-instruction-note">
              复制下面这份说明，自行粘贴给你的 AI
              助手；本应用不会发送任何内容。
            </p>
            <label
              className="prepare-label"
              htmlFor="prepare-instruction-text"
            >
              改稿说明内容
            </label>
            <textarea
              id="prepare-instruction-text"
              className="prepare-instruction-text"
              readOnly
              rows={6}
              value={instructionText}
            />
            <button
              type="button"
              className="prepare-instruction-copy-button"
              onClick={onCopyInstruction}
            >
              复制改稿说明
            </button>
            {instructionCopyState === 'copied' ? (
              <p className="prepare-instruction-ok" role="status">
                已复制改稿说明。
              </p>
            ) : null}
            {instructionCopyState === 'failed' ? (
              <p className="prepare-instruction-failed" role="alert">
                复制失败，请手动全选上面文本复制。
              </p>
            ) : null}
          </div>
          {issues.length > 0 ? (
            <ul className="prepare-issues" role="alert">
              {issues.map((issue) => (
                <li key={issue.code}>{issueMessage(issue)}</li>
              ))}
            </ul>
          ) : null}
          {onBeginCompare !== undefined ? (
            <button
              type="button"
              className="prepare-begin-button"
              disabled={isEmpty || hasBlockingIssue}
              onClick={onBeginCompare}
            >
              开始比较
            </button>
          ) : null}
        </div>

        <div className="prepare-protections">
          <h3 className="prepare-subtitle">保护清单</h3>
          {selectedCount === 0 ? (
            <p className="prepare-no-protection" role="status">
              本轮没有受保护段落：比较仍可进行，但改动可能覆盖任何一段。
            </p>
          ) : (
            <p className="prepare-protected-count" role="status">
              已保护 {selectedCount} 段，成稿将逐字保留这些段落。
            </p>
          )}
          <ProtectionList
            paragraphs={paragraphs}
            selectedParagraphIds={selectedParagraphIds}
            onToggleParagraph={(paragraph) => {
              handleToggleParagraph(paragraph.id);
            }}
          />
        </div>
      </div>
    </section>
  );
}
