/**
 * P012 改稿守约 Edit Pact — 改稿输入面板（T009）。
 *
 * 来源：项目书 §4（流程第 4 步：粘贴改稿并比较；应用不发送任何
 * 内容）、§7.1（开始比较即冻结本轮保护契约）、§8.1（改稿可为空，
 * 用于显式删除场景；单个导入文件最多 100 KiB）。
 *
 * 本面板只负责改稿的粘贴与文件导入回传，不持有业务状态：
 * 改稿文本由父组件（useEditPact）持有，每次按键经 changeCandidate
 * 回传；文件导入由父组件校验（超限/非 UTF-8 时拒绝并保留旧输入）。
 * “开始比较”按钮放在本面板：只有原稿与改稿都就绪后才可用，
 * 点击即冻结本轮保护契约。
 */

import { useRef } from 'react';

export interface CandidatePanelProps {
  /** 改稿原文（父组件持有；已规范化）。 */
  candidate: string;
  /** 是否已提供改稿（哪怕是空改稿：显式整篇删除场景）。 */
  candidateProvided: boolean;
  /** 改稿文本变化时回传完整新文本。 */
  onCandidateChange: (text: string) => void;
  /** 从文件导入改稿（父组件校验并回传结果）。 */
  onImportFile: (file: File) => void;
  /** 用户点击“开始比较”时调用。 */
  onBeginCompare: () => void;
  /** 是否可开始比较。 */
  canCompare: boolean;
  /** 不可比较时的原因（可比较时为 null）。 */
  compareBlockedReason: string | null;
}

export function CandidatePanel({
  candidate,
  candidateProvided,
  onCandidateChange,
  onImportFile,
  onBeginCompare,
  canCompare,
  compareBlockedReason,
}: CandidatePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section className="candidate-panel" aria-label="粘贴改稿">
      <h3 className="candidate-title">粘贴改稿</h3>
      <p className="candidate-help">
        把你现有 AI 助手给出的改稿粘贴到这里，或从 .txt 文件导入。
        改稿不会上传，只在本页与原稿比较。改稿留空也可以：那表示
        接受整篇删除，将按此比较。
      </p>
      <label className="candidate-label" htmlFor="candidate-input">
        改稿
      </label>
      <textarea
        id="candidate-input"
        className="candidate-textarea"
        value={candidate}
        rows={8}
        placeholder="粘贴改稿，例如 AI 助手润色后的版本……"
        onChange={(event) => {
          onCandidateChange(event.target.value);
        }}
      />
      <div className="candidate-actions">
        <button
          type="button"
          className="candidate-import-button"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          从文件导入改稿（.txt）
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          className="candidate-file-input"
          aria-label="选择改稿文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 清空选择：同一文件改后可再次导入。
            event.target.value = '';
            if (file !== undefined) {
              onImportFile(file);
            }
          }}
        />
        {candidateProvided ? (
          <p className="candidate-status" role="status">
            {candidate === ''
              ? '改稿为空：将按整篇删除比较。'
              : '已粘贴改稿。'}
          </p>
        ) : (
          <p className="candidate-status" role="status">
            尚未粘贴改稿。
          </p>
        )}
      </div>
      <button
        type="button"
        className="candidate-begin-button"
        disabled={!canCompare}
        onClick={onBeginCompare}
      >
        开始比较
      </button>
      {canCompare ? (
        <p className="candidate-begin-note">
          开始比较即冻结本轮保护契约：保护范围与本轮决定将被锁定，
          直到你返回调整保护或清空。
        </p>
      ) : (
        <p className="candidate-blocked-reason" role="status">
          {compareBlockedReason ?? '现在还不能开始比较。'}
        </p>
      )}
    </section>
  );
}
