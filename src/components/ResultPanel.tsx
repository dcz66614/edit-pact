/**
 * P012 改稿守约 Edit Pact — 成稿展示面板（T008）。
 *
 * 纯 props 组件：只展示 T009 经 compose 得到的成功结果，不自行
 * 拼接预览、不调用任何核心规则、不写 session。复制与下载入口
 * 归属 T009（本面板不提供）。
 *
 * 显示（项目书 §7.1）：完整成稿文本、受保护段数、采用数、保留数；
 * 只显示“已按本轮保护范围合成”，同时保留一句“文字保留不代表
 * 语义或事实已经核查”。不显示真实性评分或伪百分比进度。
 */

import type { ComposeSuccess } from '../domain/types';
import './review.css';

export interface ResultPanelProps {
  /** compose 的成功结果；为 null 时显示“尚未生成成稿”。 */
  result: ComposeSuccess | null;
  /** 已采用的变更数（由父组件按当前 analysis 统计）。 */
  acceptedCount: number;
  /** 已保留原文的变更数（rejected）。 */
  rejectedCount: number;
  /** 保护冲突数（blocked）。 */
  blockedCount: number;
  /** 本轮受保护段落数。 */
  protectedCount: number;
}

export function ResultPanel({
  result,
  acceptedCount,
  rejectedCount,
  blockedCount,
  protectedCount,
}: ResultPanelProps) {
  return (
    <section className="result-panel" aria-label="成稿">
      <h2 className="result-title">成稿</h2>
      {result === null ? (
        <p className="result-not-ready" role="status">
          尚未生成成稿。待审清零后，成稿会在这里显示。
        </p>
      ) : (
        <>
          <p className="result-counts" role="status">
            受保护 {protectedCount} 段 · 已采用 {acceptedCount} 处 · 已保留原文{' '}
            {rejectedCount} 处 · 保护冲突 {blockedCount} 处
          </p>
          {result.text === '' ? (
            <p className="result-empty-note">
              成稿为空：已接受整篇删除。
            </p>
          ) : null}
          <div className="result-text" aria-label="成稿全文">
            {result.text}
          </div>
          <p className="result-note">已按本轮保护范围合成。</p>
          <p className="result-disclaimer">
            文字保留不代表语义或事实已经核查。
          </p>
        </>
      )}
    </section>
  );
}
