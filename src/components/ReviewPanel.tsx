/**
 * P012 改稿守约 Edit Pact — 审阅面板（T008）。
 *
 * 纯 props 组件：不持有业务状态，不调用任何核心规则，不直接写
 * session。决定与“其余保留原文”经回调回传给父组件，由 T006 的
 * reducer 处理；成稿合成由 T009 在 pending 清零后调用 compose，
 * 本面板不自行拼接任何预览文字（项目书 §8.4）。
 *
 * 布局（项目书 §7.1）：左侧为原稿与保护标记，中间为变更列表，
 * 右侧为审阅计数；宽度不足时上下排列。右侧在有 pending 时显示
 * 审阅计数和“处理完剩余项后生成全文”，不生成混合状态的成稿。
 * 全部 Hunk 都渲染，不通过隐藏无法处理的 Hunk 减少界面复杂度。
 */

import { splitParagraphs } from '../core/text';
import type { Analysis, Hunk } from '../domain/types';
import { HunkCard } from './HunkCard';
import './review.css';

export interface ReviewPanelProps {
  /** 规范化原稿全文（左侧原稿栏与 Hunk 段落定位共用）。 */
  original: string;
  /** 本轮完整分析（含 protections 与 hunks）。 */
  analysis: Analysis;
  /** 接受/保留原文某处改动。 */
  onDecision: (hunkId: string, decision: 'accepted' | 'rejected') => void;
  /** 其余保留原文：把所有 pending 改为 rejected，已采用项不受影响。 */
  onKeepRemaining: () => void;
  /** 返回调整保护（透传给 blocked 卡；不传则 blocked 卡不渲染该按钮）。 */
  onBackToProtections?: () => void;
}

export interface ReviewCounts {
  pending: number;
  accepted: number;
  rejected: number;
  blocked: number;
  total: number;
}

/** 按 Hunk 的 decision 与 conflicts 统计（conflicts 非空即计 blocked）。 */
export function countHunks(hunks: readonly Hunk[]): ReviewCounts {
  const counts: ReviewCounts = {
    pending: 0,
    accepted: 0,
    rejected: 0,
    blocked: 0,
    total: hunks.length,
  };
  for (const hunk of hunks) {
    if (hunk.conflicts.length > 0 || hunk.decision === 'blocked') {
      counts.blocked += 1;
    } else if (hunk.decision === 'pending') {
      counts.pending += 1;
    } else if (hunk.decision === 'accepted') {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }
  return counts;
}

export function ReviewPanel({
  original,
  analysis,
  onDecision,
  onKeepRemaining,
  onBackToProtections,
}: ReviewPanelProps) {
  const paragraphs = splitParagraphs(original);
  const counts = countHunks(analysis.hunks);
  const protectedIds = new Set(
    analysis.protections.map((prot) => prot.paragraphId),
  );

  return (
    <section className="review-panel" aria-label="核对改动">
      <h2 className="review-title">核对改动</h2>
      <p className="review-notice">
        内容仅在本页处理，不上传、不保存；刷新页面后会丢失。
      </p>

      <div className="review-columns">
        <div className="review-original" aria-label="原稿与保护标记">
          <h3 className="review-subtitle">原稿与保护</h3>
          {paragraphs.map((p, index) => {
            const isProtected = protectedIds.has(p.id);
            return (
              <p
                key={p.id}
                className={
                  isProtected
                    ? 'review-paragraph review-paragraph--protected'
                    : 'review-paragraph'
                }
              >
                <span className="review-paragraph-index">
                  第 {index + 1} 段
                </span>
                {isProtected ? (
                  <span className="review-protected-tag">已保护</span>
                ) : null}
                <span className="review-paragraph-text">
                  {p.text === '' ? '（空段）' : p.text}
                </span>
              </p>
            );
          })}
        </div>

        <div className="review-changes" aria-label="变更列表">
          <h3 className="review-subtitle">
            变更列表（共 {counts.total} 处）
          </h3>
          {analysis.hunks.length === 0 ? (
            <p className="review-no-diff" role="status">
              未发现文字改动。两稿文字完全一致，可以导出原稿。
            </p>
          ) : (
            <ul className="review-hunk-list">
              {analysis.hunks.map((hunk, i) => (
                <li key={hunk.id} className="review-hunk-item">
                  <HunkCard
                    hunk={hunk}
                    index={i + 1}
                    original={original}
                    protections={analysis.protections}
                    onDecision={onDecision}
                    onBackToProtections={onBackToProtections}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="review-summary" aria-label="审阅进度">
          <h3 className="review-subtitle">审阅进度</h3>
          <p className="review-counts" role="status" aria-live="polite">
            待审 {counts.pending} 项 · 已采用 {counts.accepted} 项 · 已保留原文{' '}
            {counts.rejected} 项 · 保护冲突 {counts.blocked} 项
          </p>
          {counts.pending > 0 ? (
            <>
              <p className="review-pending-note">
                处理完剩余 {counts.pending} 项后生成全文；成稿复制在待审清零前不可用。
              </p>
              <button
                type="button"
                className="review-keep-button"
                onClick={onKeepRemaining}
              >
                其余保留原文
              </button>
              <p className="review-keep-note">
                把其余待审项全部改为保留原文；已采用的改动不受影响。
              </p>
            </>
          ) : analysis.hunks.length > 0 ? (
            <p className="review-ready-note" role="status">
              待审已清，可以生成成稿。
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
