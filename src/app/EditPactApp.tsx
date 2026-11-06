/**
 * P012 改稿守约 Edit Pact — 应用集成（T009）。
 *
 * 来源：项目书 §4（固定流程）、§7.1（页面结构：单页三步骤工作台，
 * 顶部显示名称、当前步骤与“内容仅在本页处理”说明）、§7.2（状态与
 * 文案）、T007/T008 交接（组件 props 与接线要点）。
 *
 * 本组件只做接线：准备页用 PreparePanel + 改稿输入面板，核对页
 * 用 ReviewPanel，成稿页用 ResultPanel；状态、比较、决定、合成、
 * 导出、清空全部走 useEditPact。组件本身不实现任何核心规则，
 * 不自行拼接预览文字，不直接写 session。
 *
 * 接线要点（T006/T007/T008 交接）：
 *  - 原稿变化经 changeOriginal 清除旧改稿/保护/决定（草稿提交时
 *    会丢失内容先确认一次）；保护变化经 changeProtections 清决定；
 *    开始比较即冻结本轮保护契约；
 *  - beginCompare 进入 comparing 时清空旧分析，error 阶段提供
 *    “重新比较”入口，不把 error 当作可导出状态；
 *  - 内置例子用 PreparePanel 导出的 DEFAULT_EXAMPLE_TEXT；
 *  - 待审清零后由 hook 调用 compose；复制/下载/回执前复核
 *    analysisId、revision、decisionRevision 三标识；
 *  - 清空只接 onClear 回调（reducer clearSession），不另写
 *    第二份 clear 实现；清空时终止 Worker。
 */

import { useRef } from 'react';
import { PreparePanel } from '../components/PreparePanel';
import { countHunks, ReviewPanel } from '../components/ReviewPanel';
import { ResultPanel } from '../components/ResultPanel';
import { CandidatePanel } from './CandidatePanel';
import { useEditPact } from './useEditPact';
import type { EditPactDeps } from './useEditPact';

const STEP_LABELS = ['准备原稿', '核对改动', '复制成稿'] as const;

export function EditPactApp({ deps }: { deps?: EditPactDeps } = {}) {
  const { state, actions, canCompare, compareBlockedReason } =
    useEditPact(deps);
  const {
    session,
    originalDraft,
    goal,
    candidateProvided,
    composeResult,
    error,
    copyState,
    instructionText,
    instructionCopyState,
    returningToPrepare,
    hasContent,
  } = state;
  const originalFileRef = useRef<HTMLInputElement | null>(null);

  const counts =
    session.analysis !== null ? countHunks(session.analysis.hunks) : null;
  const showPrepare =
    session.phase === 'prepare' || returningToPrepare;
  const step = showPrepare
    ? 1
    : composeResult !== null
      ? 3
      : 2;

  return (
    <div
      className="edit-pact"
      onCompositionStart={actions.onCompositionStart}
      onCompositionEnd={actions.onCompositionEnd}
    >
      <header className="app-header">
        <h1>改稿守约 Edit Pact</h1>
        <p className="app-subtitle">
          保护逐字段落，再让 AI 润色；最终文本只由原文与已批准的改动合成。
        </p>
        <p className="app-privacy" role="note">
          内容仅在本页处理，不上传、不保存；刷新页面后会丢失。
        </p>
        <ol className="app-steps" aria-label="当前步骤">
          {STEP_LABELS.map((label, index) => (
            <li
              key={label}
              className={
                index + 1 === step
                  ? 'app-step app-step--current'
                  : index + 1 < step
                    ? 'app-step app-step--done'
                    : 'app-step'
              }
              aria-current={index + 1 === step ? 'step' : undefined}
            >
              第 {index + 1} 步：{label}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="app-clear-button"
          disabled={session.phase === 'comparing' || !hasContent}
          onClick={actions.clear}
        >
          清空本次内容
        </button>
      </header>

      <main>
        {error !== null ? (
          <div className="app-error" role="alert">
            <p>{error.message}</p>
            <button
              type="button"
              className="app-error-dismiss"
              onClick={actions.dismissError}
            >
              知道了
            </button>
          </div>
        ) : null}

        {session.phase === 'comparing' ? (
          <section className="app-comparing" aria-label="正在比较">
            <h2>正在比较两稿……</h2>
            <p>请稍候，比较在后台进行，不会上传任何内容。</p>
            <button
              type="button"
              className="app-cancel-button"
              onClick={actions.cancelCompare}
            >
              取消比较
            </button>
          </section>
        ) : showPrepare ? (
          <>
            <div className="app-import-row">
              <button
                type="button"
                className="app-import-button"
                onClick={() => {
                  originalFileRef.current?.click();
                }}
              >
                从文件导入原稿（.txt）
              </button>
              <input
                ref={originalFileRef}
                type="file"
                accept=".txt,text/plain"
                className="app-file-input"
                aria-label="选择原稿文件"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file !== undefined) {
                    void actions.importOriginalFile(file);
                  }
                }}
              />
              <p className="app-import-note">
                导入新原稿将清除改稿、保护和决定；文件超过 100 KiB
                或不是严格 UTF-8 文本时拒绝导入，并保留之前输入。
              </p>
            </div>
            {returningToPrepare && session.analysis !== null ? (
              <>
                <p className="app-back-note" role="status">
                  你从审阅页返回：调整保护或原稿将清空旧的审阅决定；
                  不改保护可直接返回审阅，决定全部保留。
                </p>
                <button
                  type="button"
                  className="app-back-to-review-button"
                  onClick={actions.backToReview}
                >
                  返回审阅（保留决定）
                </button>
              </>
            ) : null}
            <PreparePanel
              original={originalDraft}
              onOriginalChange={actions.setOriginalDraft}
              protections={session.protections}
              onProtectionsChange={actions.setProtections}
              goal={goal}
              onGoalChange={actions.setGoal}
              instructionText={instructionText}
              onCopyInstruction={() => {
                void actions.copyInstruction();
              }}
              instructionCopyState={instructionCopyState}
            />
            <CandidatePanel
              candidate={session.candidate}
              candidateProvided={candidateProvided}
              onCandidateChange={actions.setCandidate}
              onImportFile={(file) => {
                void actions.importCandidateFile(file);
              }}
              onBeginCompare={actions.beginCompare}
              canCompare={canCompare}
              compareBlockedReason={compareBlockedReason}
            />
          </>
        ) : session.phase === 'error' ? (
          <section className="app-error-panel" aria-label="比较未能完成">
            <h2>比较未能完成</h2>
            <p>
              {error !== null
                ? error.message
                : '比较未能完成，已保留当前输入。'}
            </p>
            <div className="app-error-actions">
              <button
                type="button"
                className="app-retry-button"
                onClick={actions.retryCompare}
              >
                重新比较
              </button>
              <button
                type="button"
                className="app-back-button"
                onClick={actions.backToProtections}
              >
                返回准备页
              </button>
            </div>
          </section>
        ) : (
          <>
            {session.analysis !== null ? (
              <ReviewPanel
                original={session.original}
                analysis={session.analysis}
                onDecision={actions.decide}
                onKeepRemaining={actions.keepRemaining}
                onBackToProtections={actions.backToProtections}
              />
            ) : null}
            {counts !== null && counts.pending > 0 ? (
              <p className="app-compose-wait" role="status">
                还有 {counts.pending} 项待审，处理完后生成成稿。
              </p>
            ) : null}
            <ResultPanel
              result={composeResult}
              acceptedCount={counts?.accepted ?? 0}
              rejectedCount={counts?.rejected ?? 0}
              blockedCount={counts?.blocked ?? 0}
              protectedCount={session.protections.length}
            />
            {composeResult !== null ? (
              <section className="app-export" aria-label="导出成稿">
                <h3>导出成稿</h3>
                <div className="app-export-actions">
                  <button
                    type="button"
                    className="app-copy-button"
                    onClick={() => {
                      void actions.copyResult();
                    }}
                  >
                    复制成稿
                  </button>
                  <button
                    type="button"
                    className="app-download-button"
                    onClick={actions.downloadResult}
                  >
                    下载 TXT
                  </button>
                  <button
                    type="button"
                    className="app-receipt-button"
                    onClick={actions.downloadReceipt}
                  >
                    下载审阅回执（JSON）
                  </button>
                </div>
                {copyState === 'copied' ? (
                  <p className="app-copy-ok" role="status">
                    已复制到剪贴板。
                  </p>
                ) : null}
                {copyState === 'failed' ? (
                  <>
                    <p className="app-copy-failed" role="alert">
                      复制失败，请手动全选下面文本复制，或下载 TXT。
                    </p>
                    <label
                      className="app-fallback-label"
                      htmlFor="app-fallback-text"
                    >
                      成稿全文（可手动全选复制）
                    </label>
                    <textarea
                      id="app-fallback-text"
                      className="app-fallback-text"
                      readOnly
                      rows={8}
                      value={composeResult.text}
                    />
                  </>
                ) : null}
                <p className="app-receipt-note">
                  回执不含正文，只记录版本、哈希与审阅结果；不能单独
                  重建全文，也不能证明模型输出为真。
                </p>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
