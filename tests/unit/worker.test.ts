/**
 * P012 T004 单元测试 — Worker 客户端与 Worker 处理器。
 *
 * 客户端测试用注入的假 Worker（实现 WorkerLike 接口），不启动真实
 * Worker；处理器测试用注入的可控 analyze 实现，精确控制在途时机。
 * 真实 Worker 文件在 Node 环境导入时不注册、不抛错（由导入本测试文件
 * 本身覆盖）；真实浏览器 Worker 的端到端往返属 T011 实测范围。
 */

import { describe, expect, it } from 'vitest';
import type { AnalyzeRequest, AnalyzeResult, WorkerRequest, WorkerResponse } from '../../src/domain/types';
import { ENGINE_VERSION } from '../../src/core/diff';
import { analyze } from '../../src/core/analyze';
import { DiffWorkerClient, type WorkerLike } from '../../src/workers/client';
import { createDiffWorkerHandler, type AnalyzeFn } from '../../src/workers/diff.worker';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeRequest(jobId: string, revision = 1): AnalyzeRequest {
  return {
    original: '保留这句。改这句。',
    candidate: '保留这句。改后。',
    protections: [],
    revision,
    jobId,
    engineVersion: ENGINE_VERSION,
  };
}

/** 可控假 Worker：记录发出的请求，可手动投递响应或报错。 */
class FakeWorker implements WorkerLike {
  posted: WorkerRequest[] = [];
  terminated = false;
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  deliver(response: WorkerResponse): void {
    this.onmessage?.({ data: response });
  }

  fail(error: unknown): void {
    this.onerror?.(error);
  }
}

function makeClient(waitMs?: number): { client: DiffWorkerClient; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const client = new DiffWorkerClient({
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    ...(waitMs === undefined ? {} : { waitMs }),
  });
  return { client, workers };
}

describe('DiffWorkerClient', () => {
  it('正常路径：发出 analyze 请求，收到结果后 resolve 并终止 Worker', async () => {
    const { client, workers } = makeClient();
    const request = makeRequest('job-ok');
    const expected = await analyze(request);
    const pending = client.analyze(request);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toEqual([{ type: 'analyze', request }]);
    workers[0].deliver({ type: 'result', result: expected });
    await expect(pending).resolves.toEqual(expected);
    expect(workers[0].terminated).toBe(true);
  });

  it('迟到 jobId 的结果直接丢弃，不 resolve；正确结果到达后才 resolve', async () => {
    const { client, workers } = makeClient();
    const request = makeRequest('job-good');
    const expected = await analyze(request);
    let resolved = false;
    const pending = client.analyze(request).then((r) => {
      resolved = true;
      return r;
    });
    const stale = { ...expected, ok: false, errorCode: 'INVALID_PATCH', jobId: 'job-stale' } as AnalyzeResult;
    workers[0].deliver({ type: 'result', result: stale });
    await sleep(50);
    expect(resolved).toBe(false);
    workers[0].deliver({ type: 'result', result: expected });
    await expect(pending).resolves.toEqual(expected);
    expect(resolved).toBe(true);
  });

  it('迟到 revision 的结果直接丢弃', async () => {
    const { client, workers } = makeClient();
    const request = makeRequest('job-rev', 3);
    const expected = await analyze(request);
    let resolved = false;
    const pending = client.analyze(request).then((r) => {
      resolved = true;
      return r;
    });
    const stale = await analyze(makeRequest('job-rev', 2));
    workers[0].deliver({ type: 'result', result: stale });
    await sleep(50);
    expect(resolved).toBe(false);
    workers[0].deliver({ type: 'result', result: expected });
    await expect(pending).resolves.toEqual(expected);
  });

  it('Worker 的 error 响应按原样返回（INVALID_PATCH）', async () => {
    const { client, workers } = makeClient();
    const pending = client.analyze(makeRequest('job-err', 4));
    workers[0].deliver({
      type: 'error',
      errorCode: 'INVALID_PATCH',
      revision: 4,
      jobId: 'job-err',
    });
    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: 'INVALID_PATCH',
      revision: 4,
      jobId: 'job-err',
    });
    expect(workers[0].terminated).toBe(true);
  });

  it('1500 ms 真实等待路径：无响应时返回 TOO_COMPLEX 并终止 Worker', async () => {
    const { client, workers } = makeClient(); // 默认 waitMs = 1500
    const started = Date.now();
    const result = await client.analyze(makeRequest('job-timeout', 5));
    const elapsed = Date.now() - started;
    expect(result).toEqual({
      ok: false,
      errorCode: 'TOO_COMPLEX',
      revision: 5,
      jobId: 'job-timeout',
    });
    console.log(`[T004] worker 1500ms timeout elapsed=${elapsed}ms`);
    expect(elapsed).toBeGreaterThanOrEqual(1400);
    expect(elapsed).toBeLessThan(4000);
    expect(workers[0].terminated).toBe(true);
  });

  it('注入短超时同样走 TOO_COMPLEX 路径（快速验证用）', async () => {
    const { client } = makeClient(50);
    const started = Date.now();
    const result = await client.analyze(makeRequest('job-short', 6));
    const elapsed = Date.now() - started;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('TOO_COMPLEX');
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2000);
  });

  it('cancel：待处理 job 以 CANCELLED 返回，Worker 被终止；迟到结果无效', async () => {
    const { client, workers } = makeClient();
    const request = makeRequest('job-cancel', 7);
    const expected = await analyze(request);
    const pending = client.analyze(request);
    client.cancel('job-cancel');
    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: 'CANCELLED',
      revision: 7,
      jobId: 'job-cancel',
    });
    expect(workers[0].terminated).toBe(true);
    workers[0].deliver({ type: 'result', result: expected }); // 迟到，无影响
    await sleep(20);
  });

  it('cancel 的 jobId 与当前 job 不符时不做任何事', async () => {
    const { client, workers } = makeClient();
    const request = makeRequest('job-keep', 8);
    const expected = await analyze(request);
    const pending = client.analyze(request);
    client.cancel('job-other');
    expect(workers[0].terminated).toBe(false);
    workers[0].deliver({ type: 'result', result: expected });
    await expect(pending).resolves.toEqual(expected);
  });

  it('新 analyze 取代旧 job：旧 job 以 CANCELLED 返回，新 job 正常跑', async () => {
    const { client, workers } = makeClient();
    const first = client.analyze(makeRequest('job-first', 9));
    const secondRequest = makeRequest('job-second', 10);
    const secondExpected = await analyze(secondRequest);
    const second = client.analyze(secondRequest);
    await expect(first).resolves.toEqual({
      ok: false,
      errorCode: 'CANCELLED',
      revision: 9,
      jobId: 'job-first',
    });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[1].deliver({ type: 'result', result: secondExpected });
    await expect(second).resolves.toEqual(secondExpected);
  });

  it('Worker onerror：返回 TOO_COMPLEX 并终止 Worker', async () => {
    const { client, workers } = makeClient();
    const pending = client.analyze(makeRequest('job-onerror', 11));
    workers[0].fail(new Error('worker crashed'));
    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: 'TOO_COMPLEX',
      revision: 11,
      jobId: 'job-onerror',
    });
    expect(workers[0].terminated).toBe(true);
  });

  it('dispose：结束待处理 job（CANCELLED）并终止 Worker', async () => {
    const { client, workers } = makeClient();
    const pending = client.analyze(makeRequest('job-dispose', 12));
    client.dispose();
    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: 'CANCELLED',
      revision: 12,
      jobId: 'job-dispose',
    });
    expect(workers[0].terminated).toBe(true);
  });

  it('FIX-T013-03：Worker 构造失败不抛同步错误，以 UNSUPPORTED_ENV 结果兑现', async () => {
    const client = new DiffWorkerClient({
      createWorker: () => {
        throw new Error('Worker construction failed');
      },
    });
    // 关键断言：analyze() 必须返回 Promise，而不是同步抛出——
    // 调用方（useEditPact）按 Promise 结果驱动状态机，同步抛错会
    // 绕过结果处理、让会话卡在 comparing。
    let pending: Promise<AnalyzeResult> | null = null;
    expect(() => {
      pending = client.analyze(makeRequest('job-no-worker', 13));
    }).not.toThrow();
    await expect(pending).resolves.toEqual({
      ok: false,
      errorCode: 'UNSUPPORTED_ENV',
      revision: 13,
      jobId: 'job-no-worker',
    });
  });

  it('FIX-T013-03：构造失败时旧待处理 job 仍先以 CANCELLED 结束', async () => {
    const { client, workers } = makeClient();
    const first = client.analyze(makeRequest('job-first', 14));
    // 把工厂换成抛错实现：第二次 analyze 构造失败。
    (client as unknown as { createWorker: () => WorkerLike }).createWorker =
      () => {
        throw new Error('Worker construction failed');
      };
    const second = client.analyze(makeRequest('job-second', 15));
    await expect(first).resolves.toEqual({
      ok: false,
      errorCode: 'CANCELLED',
      revision: 14,
      jobId: 'job-first',
    });
    await expect(second).resolves.toEqual({
      ok: false,
      errorCode: 'UNSUPPORTED_ENV',
      revision: 15,
      jobId: 'job-second',
    });
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
  });
});

describe('createDiffWorkerHandler', () => {
  it('analyze 消息：回发真实 analyze 结果', async () => {
    const posted: WorkerResponse[] = [];
    const handler = createDiffWorkerHandler((m) => posted.push(m));
    const request = makeRequest('job-handler', 13);
    await handler({ type: 'analyze', request });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({ type: 'result', result: await analyze(request) });
  });

  it('在途 job 被 cancel 后，其结果不回发', async () => {
    let resolveDeferred!: (result: AnalyzeResult) => void;
    const deferred = new Promise<AnalyzeResult>((resolve) => {
      resolveDeferred = resolve;
    });
    const runAnalyze: AnalyzeFn = () => deferred;
    const posted: WorkerResponse[] = [];
    const handler = createDiffWorkerHandler((m) => posted.push(m), runAnalyze);
    const request = makeRequest('job-flight', 14);
    const inFlight = handler({ type: 'analyze', request });
    await handler({ type: 'cancel', jobId: 'job-flight' });
    resolveDeferred({ ok: false, errorCode: 'TOO_COMPLEX', revision: 14, jobId: 'job-flight' });
    await inFlight;
    expect(posted).toEqual([]);
  });

  it('在途 job 被新 job 取代后，其结果不回发，只回发新 job 的结果', async () => {
    let resolveFirst!: (result: AnalyzeResult) => void;
    const firstDeferred = new Promise<AnalyzeResult>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult: AnalyzeResult = {
      ok: false,
      errorCode: 'INVALID_INPUT',
      revision: 15,
      jobId: 'job-second',
    };
    let calls = 0;
    const runAnalyze: AnalyzeFn = (_request) => {
      calls += 1;
      return calls === 1 ? firstDeferred : Promise.resolve(secondResult);
    };
    const posted: WorkerResponse[] = [];
    const handler = createDiffWorkerHandler((m) => posted.push(m), runAnalyze);
    const first = handler({ type: 'analyze', request: makeRequest('job-first', 15) });
    const second = handler({ type: 'analyze', request: makeRequest('job-second', 15) });
    await second;
    resolveFirst({ ok: false, errorCode: 'TOO_COMPLEX', revision: 15, jobId: 'job-first' });
    await first;
    expect(posted).toEqual([{ type: 'result', result: secondResult }]);
  });

  it('analyze 抛非契约异常时回发 TOO_COMPLEX 错误，不静默', async () => {
    const runAnalyze: AnalyzeFn = () => Promise.reject(new Error('boom'));
    const posted: WorkerResponse[] = [];
    const handler = createDiffWorkerHandler((m) => posted.push(m), runAnalyze);
    await handler({ type: 'analyze', request: makeRequest('job-throw', 16) });
    expect(posted).toEqual([
      { type: 'error', errorCode: 'TOO_COMPLEX', revision: 16, jobId: 'job-throw' },
    ]);
  });

  it('cancel 未知 jobId 时不做任何事', async () => {
    const posted: WorkerResponse[] = [];
    const handler = createDiffWorkerHandler((m) => posted.push(m));
    await handler({ type: 'cancel', jobId: 'job-unknown' });
    expect(posted).toEqual([]);
  });
});
