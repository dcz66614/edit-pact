/**
 * P012 改稿守约 Edit Pact — 比较 Worker（T004）。
 *
 * 来源：项目书 §8.2（diff 在单独 Web Worker 内运行）、CONTRACT.md §1.5
 * （Worker 协议）、实施计划 §8（取消终止 Worker，下次重建）。
 *
 * 本文件只在真实 DedicatedWorker 作用域内注册 onmessage；在 Node/测试
 * 环境导入时（无全局 postMessage）不注册、不抛错，处理器可直接导入测试。
 *
 * 消息处理（createDiffWorkerHandler）：
 *  - `{ type: 'analyze', request }`：跑 analyze(request)，成功后以
 *    `{ type: 'result', result }` 回发。analyze 的全部契约失败
 *    （INVALID_INPUT / TOO_COMPLEX / INVALID_PATCH / UNSUPPORTED_ENV）
 *    均以结果值返回，不抛错。
 *  - `{ type: 'cancel', jobId }`：取消只做“丢弃在途结果”标记——
 *    Worker 无法中断正在跑的同步 diff，终止由主线程客户端执行。
 *    若在途 job 被取消，其结果算出后也不回发（迟到结果不落地）。
 *  - analyze 抛出的非契约异常（不应发生：全部预期失败都以结果值返回）
 *    由处理器兜底为 `{ type: 'error', errorCode: 'TOO_COMPLEX', ... }`
 *    回发；客户端另有 onerror 与 1500 ms 超时兜底。
 *  - Worker 不读浏览器存储，不生成 UI 提示文案。
 */

import { analyze } from '../core/analyze';
import type { AnalyzeResult, WorkerRequest, WorkerResponse } from '../domain/types';

export type WorkerPostMessage = (message: WorkerResponse) => void;

/** analyze 的可注入实现（生产用默认 analyze；测试注入可控版本）。 */
export type AnalyzeFn = (request: Parameters<typeof analyze>[0]) => Promise<AnalyzeResult>;

/**
 * 创建 Worker 消息处理器。同一时刻只跟踪一个活动 jobId；被取消或
 * 被更新的 job 取代后，其结果不再回发。
 */
export function createDiffWorkerHandler(
  postMessage: WorkerPostMessage,
  runAnalyze: AnalyzeFn = analyze,
): (message: WorkerRequest) => Promise<void> {
  let currentJobId: string | null = null;

  return async (message: WorkerRequest): Promise<void> => {
    if (message.type === 'cancel') {
      if (message.jobId === currentJobId) {
        currentJobId = null;
      }
      return;
    }

    const { request } = message;
    currentJobId = request.jobId;
    let result: AnalyzeResult;
    try {
      result = await runAnalyze(request);
    } catch {
      // 非契约异常的最后兜底：比较未能完成，按 TOO_COMPLEX 回发，
      // 不让 Worker 静默无响应（客户端另有 1500 ms 超时兜底）。
      postMessage({
        type: 'error',
        errorCode: 'TOO_COMPLEX',
        revision: request.revision,
        jobId: request.jobId,
      });
      return;
    }
    if (currentJobId !== request.jobId) {
      return; // 已被取消或取代：迟到结果直接丢弃。
    }
    currentJobId = null;
    postMessage({ type: 'result', result });
  };
}

// 仅在真实 DedicatedWorker 作用域内注册；Node/测试环境导入时跳过。
const scope = globalThis as unknown as {
  onmessage?: ((event: { data: WorkerRequest }) => void) | null;
  postMessage?: (message: WorkerResponse) => void;
};
if (typeof scope.postMessage === 'function') {
  const handler = createDiffWorkerHandler((message) => {
    scope.postMessage!(message);
  });
  scope.onmessage = (event) => {
    void handler(event.data);
  };
}
