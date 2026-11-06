/**
 * P012 T011 — Worker 超时路径浏览器桩入口（仅供 tests/e2e/worker.spec.ts
 * 在运行时用 esbuild 打包后注入真实浏览器页面；不是产品代码）。
 *
 * 用生产代码 DiffWorkerClient + 一个真实浏览器 Worker（Blob URL 创建），
 * 唯一被桩的部分是 Worker 的响应时机——这正是超时路径要测的条件：
 * - 'never'：Worker 永远不回包，客户端应在 1,500 ms 左右以 TOO_COMPLEX 返回；
 * - 'stale-then-ok'：先回一个 jobId/revision 不符的陈旧结果（必须被丢弃），
 *   再回匹配的结果（应被接受，且只 resolve 一次）；
 * - 'cancel'：先发起一次永不回包的比较，200 ms 后 cancel(jobId)，
 *   应快速以 CANCELLED 返回。
 */
import { DiffWorkerClient, type WorkerLike } from '../../src/workers/client';
import type { AnalyzeRequest } from '../../src/domain/types';

function stubWorkerCode(mode: 'never' | 'stale-then-ok'): string {
  if (mode === 'never') {
    return `onmessage = () => { /* 故意永不回包 */ };`;
  }
  return `
    onmessage = (event) => {
      const msg = event.data;
      if (msg.type !== 'analyze') return;
      const req = msg.request;
      setTimeout(() => {
        postMessage({ type: 'error', errorCode: 'TOO_COMPLEX', revision: req.revision + 1, jobId: 'stale-job-id' });
      }, 100);
      setTimeout(() => {
        postMessage({ type: 'error', errorCode: 'INVALID_INPUT', revision: req.revision, jobId: req.jobId });
      }, 300);
    };
  `;
}

function makeStubWorker(mode: 'never' | 'stale-then-ok'): WorkerLike {
  const blob = new Blob([stubWorkerCode(mode)], { type: 'text/javascript' });
  const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
  return worker as unknown as WorkerLike;
}

function makeRequest(jobId: string, revision: number): AnalyzeRequest {
  return {
    original: '甲乙丙',
    candidate: '甲乙丁',
    protections: [],
    revision,
    jobId,
    engineVersion: '1.0.0+jsdiff-9.0.0',
  };
}

export interface HarnessResult {
  elapsedMs: number;
  resolutions: Array<{ errorCode: string; revision: number; jobId: string }>;
}

function recordStatus(text: string): void {
  const el = document.getElementById('t011-status');
  if (el !== null) el.textContent = text;
}

async function runNever(): Promise<HarnessResult> {
  const client = new DiffWorkerClient({ createWorker: () => makeStubWorker('never') });
  const started = performance.now();
  const result = await client.analyze(makeRequest('job-never', 1));
  const elapsedMs = performance.now() - started;
  const resolutions = result.ok
    ? []
    : [{ errorCode: result.errorCode, revision: result.revision, jobId: result.jobId }];
  recordStatus('ready');
  client.dispose();
  return { elapsedMs, resolutions };
}

async function runStaleThenOk(): Promise<HarnessResult> {
  const client = new DiffWorkerClient({ createWorker: () => makeStubWorker('stale-then-ok') });
  const started = performance.now();
  const result = await client.analyze(makeRequest('job-stale', 7));
  const elapsedMs = performance.now() - started;
  const resolutions = result.ok
    ? []
    : [{ errorCode: result.errorCode, revision: result.revision, jobId: result.jobId }];
  recordStatus('ready');
  client.dispose();
  return { elapsedMs, resolutions };
}

async function runCancel(): Promise<HarnessResult> {
  const client = new DiffWorkerClient({ createWorker: () => makeStubWorker('never') });
  const started = performance.now();
  const pending = client.analyze(makeRequest('job-cancel', 3));
  setTimeout(() => client.cancel('job-cancel'), 200);
  const result = await pending;
  const elapsedMs = performance.now() - started;
  const resolutions = result.ok
    ? []
    : [{ errorCode: result.errorCode, revision: result.revision, jobId: result.jobId }];
  recordStatus('ready');
  client.dispose();
  return { elapsedMs, resolutions };
}

declare global {
  interface Window {
    __t011: {
      runNever: () => Promise<HarnessResult>;
      runStaleThenOk: () => Promise<HarnessResult>;
      runCancel: () => Promise<HarnessResult>;
    };
  }
}

window.__t011 = { runNever, runStaleThenOk, runCancel };
