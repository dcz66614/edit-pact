/**
 * P012 改稿守约 Edit Pact — Worker 主线程客户端（T004）。
 *
 * 来源：项目书 §8.2（Worker 预算）、CONTRACT.md §1.5（Worker 协议）、
 * 实施计划 §8（一个活动 job；取消终止 Worker，下次重建）。
 *
 * 协议：
 *  - 一个活动 job：新 analyze 调用先以 CANCELLED 结束旧的待处理 job，
 *    再终止旧 Worker、重建新 Worker。
 *  - 主线程在 WORKER_WAIT_MS（1500 ms）内未收到有效结果时终止
 *    Worker，返回 TOO_COMPLEX（“超时预算耗尽”）。
 *  - 所有结果先验证 revision/jobId：与当前 job 不符的迟到结果直接丢弃，
 *    不 resolve、不终止、不报错。
 *  - cancel(jobId)：终止 Worker，待处理 job 以 CANCELLED 返回；
 *    jobId 与当前 job 不符时不做任何事。
 *  - Worker 报错事件（onerror）视为比较未能完成：终止 Worker，
 *    返回 TOO_COMPLEX；1500 ms 超时是最终兜底。
 *  - 本客户端不读浏览器存储，不生成 UI 提示文案，不修改请求。
 *
 * 可测试性：Worker 由注入的工厂创建（默认用 Vite 的
 * `new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' })`）；
 * waitMs 可注入（默认 WORKER_WAIT_MS），单元测试可用短超时验证超时路径，
 * 另保留一次真实 1500 ms 路径的计时证据。
 */

import type { AnalyzeRequest, AnalyzeResult, ErrorCode, WorkerRequest, WorkerResponse } from '../domain/types';
import { WORKER_WAIT_MS } from '../domain/types';

/** 与真实 Worker 兼容的最小接口（测试用假 Worker 实现同一接口）。 */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;

export interface DiffWorkerClientOptions {
  /** 注入 Worker 工厂（默认创建真实 diff.worker.ts Worker）。 */
  createWorker?: WorkerFactory;
  /** 主线程等待上限 ms（默认 WORKER_WAIT_MS = 1500）。 */
  waitMs?: number;
}

function defaultCreateWorker(): WorkerLike {
  const worker = new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' });
  return worker as unknown as WorkerLike;
}

interface PendingJob {
  jobId: string;
  revision: number;
  resolve: (result: AnalyzeResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DiffWorkerClient {
  private readonly createWorker: WorkerFactory;
  private readonly waitMs: number;
  private worker: WorkerLike | null = null;
  private pending: PendingJob | null = null;

  constructor(options: DiffWorkerClientOptions = {}) {
    this.createWorker = options.createWorker ?? defaultCreateWorker;
    this.waitMs = options.waitMs ?? WORKER_WAIT_MS;
  }

  /**
   * 在 Worker 内执行一次比较。同一时刻只有一个活动 job；若已有 job
   * 在跑，先以 CANCELLED 结束它，再重建 Worker 跑新 job。
   *
   * 构造失败（Worker chunk 缺失/损坏、浏览器禁用 Worker）不以同步
   * 抛错的形式外露：调用方（useEditPact）按 Promise 结果驱动状态机，
   * 同步抛错会绕过结果处理、让会话卡在 comparing。本方法恒返回
   * Promise，构造失败时以 { ok: false, errorCode: 'UNSUPPORTED_ENV' }
   * 兑现，调用方按正常错误结果进入 error 阶段并提示。
   * （FIX-T013-03：原实现中 createWorker() 在 Promise 执行器之外，
   * 构造失败同步抛出、无错误面。）
   */
  analyze(request: AnalyzeRequest): Promise<AnalyzeResult> {
    if (this.pending !== null) {
      this.failPending('CANCELLED');
    }
    this.terminateWorker();
    let worker: WorkerLike;
    try {
      worker = this.createWorker();
    } catch {
      return Promise.resolve({
        ok: false,
        errorCode: 'UNSUPPORTED_ENV',
        revision: request.revision,
        jobId: request.jobId,
      });
    }
    this.worker = worker;

    return new Promise<AnalyzeResult>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.jobId !== request.jobId) {
          return;
        }
        this.terminateWorker();
        this.pending = null;
        resolve({
          ok: false,
          errorCode: 'TOO_COMPLEX',
          revision: request.revision,
          jobId: request.jobId,
        });
      }, this.waitMs);

      this.pending = { jobId: request.jobId, revision: request.revision, resolve, timer };
      worker.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      worker.onerror = () => {
        if (this.pending?.jobId !== request.jobId) {
          return;
        }
        this.terminateWorker();
        this.pending = null;
        resolve({
          ok: false,
          errorCode: 'TOO_COMPLEX',
          revision: request.revision,
          jobId: request.jobId,
        });
      };
      try {
        worker.postMessage({ type: 'analyze', request });
      } catch {
        // 发送失败（Worker 已不可用）按比较未能完成处理，不抛错。
        clearTimeout(timer);
        this.terminateWorker();
        this.pending = null;
        resolve({
          ok: false,
          errorCode: 'TOO_COMPLEX',
          revision: request.revision,
          jobId: request.jobId,
        });
      }
    });
  }

  /** 取消当前 job（仅当 jobId 与当前活动 job 一致时生效）。 */
  cancel(jobId: string): void {
    if (this.pending?.jobId !== jobId) {
      return;
    }
    this.failPending('CANCELLED');
    this.terminateWorker();
  }

  /** 释放客户端：结束待处理 job（CANCELLED）并终止 Worker。 */
  dispose(): void {
    if (this.pending !== null) {
      this.failPending('CANCELLED');
    }
    this.terminateWorker();
  }

  private failPending(errorCode: ErrorCode): void {
    const pending = this.pending;
    if (pending === null) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve({
      ok: false,
      errorCode,
      revision: pending.revision,
      jobId: pending.jobId,
    });
  }

  private terminateWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker !== null) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }

  private handleMessage(message: WorkerResponse): void {
    const pending = this.pending;
    if (pending === null) {
      return; // 无待处理 job：迟到结果直接丢弃。
    }
    if (message.type === 'result') {
      const result = message.result;
      const resultJobId = result.ok ? result.analysis.jobId : result.jobId;
      const resultRevision = result.ok ? result.analysis.revision : result.revision;
      if (resultJobId !== pending.jobId || resultRevision !== pending.revision) {
        return; // 迟到/陈旧结果直接丢弃。
      }
      clearTimeout(pending.timer);
      this.pending = null;
      this.terminateWorker();
      pending.resolve(result);
      return;
    }
    if (message.jobId !== pending.jobId || message.revision !== pending.revision) {
      return; // 迟到/陈旧错误直接丢弃。
    }
    clearTimeout(pending.timer);
    this.pending = null;
    this.terminateWorker();
    pending.resolve({
      ok: false,
      errorCode: message.errorCode,
      revision: message.revision,
      jobId: message.jobId,
    });
  }
}
