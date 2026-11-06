/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { EditPactApp } from '../../src/app/EditPactApp';
import type { EditPactDeps } from '../../src/app/useEditPact';
import { createDiffWorkerHandler } from '../../src/workers/diff.worker';
import { DiffWorkerClient } from '../../src/workers/client';
import type { WorkerLike } from '../../src/workers/client';
import type { AnalyzeResult } from '../../src/domain/types';

// 让 React 的 act 在测试环境生效（React 18 要求显式开启）。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
const CANDIDATE = '请在周五前回复确认。\n人数上限为50人。\n感谢配合。';
const EXPECTED = '请在周五前回复确认。\n人数上限为30人。\n感谢配合。';

function render(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

function clickButton(container: Element, label: string): boolean {
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label && !b.disabled,
  ) as HTMLButtonElement | undefined;
  if (button === undefined) {
    return false;
  }
  act(() => {
    button.click();
  });
  return true;
}

function queryButton(
  container: Element,
  label: string,
): HTMLButtonElement | null {
  return (
    ([...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined) ?? null
  );
}

function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
}

function setFileInput(
  input: HTMLInputElement,
  file: File,
): void {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  act(() => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

/**
 * 内联假 Worker：走真实 Worker 处理器 + 真实 analyze（主线程执行），
 * 只绕过真实 Worker 线程本身；协议（revision/jobId 校验、迟到丢弃）
 * 仍走 DiffWorkerClient。
 */
function createInlineWorker(): {
  worker: WorkerLike;
  isTerminated: () => boolean;
} {
  let terminated = false;
  let onmessage: WorkerLike['onmessage'] = null;
  let onerror: WorkerLike['onerror'] = null;
  const handler = createDiffWorkerHandler((message) => {
    if (terminated) {
      return;
    }
    onmessage?.({ data: message });
  });
  const worker: WorkerLike = {
    postMessage(message) {
      if (terminated) {
        return;
      }
      void handler(message);
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
    get onerror() {
      return onerror;
    },
    set onerror(fn) {
      onerror = fn;
    },
    terminate() {
      terminated = true;
    },
  };
  return { worker, isTerminated: () => terminated };
}

/** 恒返回 TOO_COMPLEX 的假 Worker（错误恢复路径用）。 */
function createFailingWorker(): { worker: WorkerLike } {
  let onmessage: WorkerLike['onmessage'] = null;
  let onerror: WorkerLike['onerror'] = null;
  const worker: WorkerLike = {
    postMessage(message) {
      if (message.type !== 'analyze') {
        return;
      }
      const result: AnalyzeResult = {
        ok: false,
        errorCode: 'TOO_COMPLEX',
        revision: message.request.revision,
        jobId: message.request.jobId,
      };
      queueMicrotask(() => {
        onmessage?.({ data: { type: 'result', result } });
      });
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
    get onerror() {
      return onerror;
    },
    set onerror(fn) {
      onerror = fn;
    },
    terminate() {},
  };
  return { worker };
}

interface BlobCapture {
  blobs: Blob[];
}

function stubDownloads(capture: BlobCapture): void {
  const urlApi = globalThis.URL as unknown as {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
  };
  urlApi.createObjectURL = (blob: Blob) => {
    capture.blobs.push(blob);
    return 'blob:test-url';
  };
  urlApi.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    () => {},
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T009 应用集成：§11.1 全流程', () => {
  it('准备 → 比较 → 审阅 → 成稿 → 导出，TXT 与预览一致，回执无正文', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    const writeText = vi.fn(async (_text: string) => undefined);
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      // 1. 粘贴原稿。
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      expect(originalInput).not.toBeNull();
      setInputValue(originalInput, ORIGINAL);

      // 2. 保护第 2 段（点击复选框：提交草稿 + 保护变化）。
      const boxes = checkboxes(container);
      expect(boxes.length).toBe(3);
      act(() => {
        boxes[1].click();
      });
      expect(container.textContent).toContain('已保护 1 段');

      // 3. 粘贴改稿。
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      expect(candidateInput).not.toBeNull();
      setInputValue(candidateInput, CANDIDATE);

      // 4. 开始比较。
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.querySelector('.review-panel')).not.toBeNull();
      }, { timeout: 5000 });

      // 5. 接受全部待审项（保护冲突项无接受入口）。
      for (let i = 0; i < 10; i++) {
        if (!clickButton(container, '采用这处修改')) {
          break;
        }
      }
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已按本轮保护范围合成。');
      }, { timeout: 5000 });
      const resultText = container.querySelector('.result-text');
      expect(resultText).not.toBeNull();
      expect(resultText!.textContent).toBe(EXPECTED);
      expect(resultText!.textContent).not.toContain('50人');

      // 6. 复制成稿：剪贴板收到与预览同一文本。
      expect(clickButton(container, '复制成稿')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已复制到剪贴板。');
      }, { timeout: 5000 });
      expect(writeText).toHaveBeenCalledWith(EXPECTED);

      // 7. 下载 TXT：Blob 内容与预览逐字相同。
      expect(clickButton(container, '下载 TXT')).toBe(true);
      expect(capture.blobs.length).toBeGreaterThanOrEqual(1);
      const txtBlob = capture.blobs[capture.blobs.length - 1];
      expect(txtBlob.type).toBe('text/plain;charset=utf-8');
      await expect(txtBlob.text()).resolves.toBe(EXPECTED);

      // 8. 下载回执：JSON 无任何正文字段与正文内容。
      expect(clickButton(container, '下载审阅回执（JSON）')).toBe(true);
      expect(capture.blobs.length).toBeGreaterThanOrEqual(2);
      const receiptBlob = capture.blobs[capture.blobs.length - 1];
      expect(receiptBlob.type).toBe('application/json;charset=utf-8');
      const receiptJson = await receiptBlob.text();
      const receipt = JSON.parse(receiptJson) as Record<string, unknown>;
      expect(receipt.schemaVersion).toBe('1.0.0');
      expect(typeof receipt.analysisId).toBe('string');
      expect(receipt.revision).toBe(3);
      for (const banned of [
        '"original":',
        '"candidate":',
        '"oldText":',
        '"newText":',
        '"goal":',
        '请于周五确认',
        '人数上限为50人',
        '谢谢配合',
        '人数上限为30人',
      ]) {
        expect(receiptJson).not.toContain(banned);
      }
      const counts = receipt.counts as {
        accepted: number;
        rejected: number;
        blocked: number;
      };
      expect(counts.blocked).toBe(1);
      expect(counts.accepted + counts.rejected + counts.blocked).toBe(5);

      // 9. 改决定后旧成稿失效：撤回第一处接受，成稿随之重算。
      expect(clickButton(container, '保留原文')).toBe(true);
      await vi.waitFor(() => {
        const text = container.querySelector('.result-text');
        expect(text).not.toBeNull();
        expect(text!.textContent).toContain('请于周五前回复确认。');
        expect(text!.textContent).not.toContain('请在周五前回复确认。');
      }, { timeout: 5000 });

      // 10. 清空：回到空状态，Worker 已终止。
      expect(clickButton(container, '清空本次内容')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('载入内置虚构例子');
      }, { timeout: 5000 });
      expect(container.querySelector('.review-panel')).toBeNull();
      expect(inline.isTerminated()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('剪贴板失败时显示手动全选回退与 TXT 入口', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: {
        writeText: async () => {
          throw new Error('clipboard denied');
        },
      },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      act(() => {
        checkboxes(container)[1].click();
      });
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, CANDIDATE);
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.querySelector('.review-panel')).not.toBeNull();
      }, { timeout: 5000 });
      for (let i = 0; i < 10; i++) {
        if (!clickButton(container, '采用这处修改')) {
          break;
        }
      }
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已按本轮保护范围合成。');
      }, { timeout: 5000 });
      expect(clickButton(container, '复制成稿')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('复制失败');
      }, { timeout: 5000 });
      const fallback = container.querySelector(
        '#app-fallback-text',
      ) as HTMLTextAreaElement;
      expect(fallback).not.toBeNull();
      expect(fallback.value).toBe(EXPECTED);
      expect(queryButton(container, '下载 TXT')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('返回调整保护：旧决定清空，改保护后回到准备页', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      act(() => {
        checkboxes(container)[1].click();
      });
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, CANDIDATE);
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.querySelector('.review-panel')).not.toBeNull();
      }, { timeout: 5000 });
      // blocked 卡有“返回调整保护”按钮。
      expect(clickButton(container, '返回调整保护')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('你从审阅页返回');
      }, { timeout: 5000 });
      expect(container.textContent).toContain('准备原稿');
      // 取消第 2 段保护：决定清空，回到准备阶段。
      act(() => {
        checkboxes(container)[1].click();
      });
      await vi.waitFor(() => {
        expect(container.textContent).toContain('本轮没有受保护段落');
      }, { timeout: 5000 });
      expect(container.querySelector('.review-panel')).toBeNull();
    } finally {
      cleanup();
    }
  });
});

describe('T009 文件导入与错误恢复', () => {
  it('超限文件拒绝导入，保留之前输入', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      // 先提交一份原稿（勾选保护即提交草稿）。
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      act(() => {
        checkboxes(container)[0].click();
      });
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已保护 1 段');
      }, { timeout: 5000 });
      // 超限原稿文件：拒绝，旧原稿保留。
      const originalFileInput = container.querySelector(
        'input[aria-label="选择原稿文件"]',
      ) as HTMLInputElement;
      setFileInput(
        originalFileInput,
        new File(['x'.repeat(100 * 1024 + 1)], 'big.txt', {
          type: 'text/plain',
        }),
      );
      await vi.waitFor(() => {
        expect(container.textContent).toContain('文件超过 100 KiB');
      }, { timeout: 5000 });
      expect(
        (container.querySelector('#prepare-original-input') as HTMLTextAreaElement)
          .value,
      ).toBe(ORIGINAL);
      // 先粘贴一份改稿，再导入超限改稿文件：拒绝，旧改稿保留。
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, '旧改稿。');
      const candidateFileInput = container.querySelector(
        'input[aria-label="选择改稿文件"]',
      ) as HTMLInputElement;
      setFileInput(
        candidateFileInput,
        new File(['y'.repeat(100 * 1024 + 1)], 'big2.txt', {
          type: 'text/plain',
        }),
      );
      await vi.waitFor(() => {
        expect(container.textContent).toContain('文件超过 100 KiB');
      }, { timeout: 5000 });
      expect(
        (container.querySelector('#candidate-input') as HTMLTextAreaElement)
          .value,
      ).toBe('旧改稿。');
    } finally {
      cleanup();
    }
  });

  it('比较失败进入 error 阶段：可返回准备页', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const failing = createFailingWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => failing.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, CANDIDATE);
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('比较未能完成');
      }, { timeout: 5000 });
      expect(container.textContent).toContain('改动过大或比较超时');
      expect(queryButton(container, '重新比较')).not.toBeNull();
      expect(queryButton(container, '返回准备页')).not.toBeNull();
      expect(clickButton(container, '返回准备页')).toBe(true);
      await vi.waitFor(() => {
        expect(
          container.querySelector('#prepare-original-input'),
        ).not.toBeNull();
      }, { timeout: 5000 });
    } finally {
      cleanup();
    }
  });
});

describe('FIX-T013 修复回归', () => {
  it('P1-03：Worker 构造失败进 error 阶段并提示，不卡在 comparing', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => {
            throw new Error('Worker construction failed');
          },
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, CANDIDATE);
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('比较未能完成');
      }, { timeout: 5000 });
      expect(container.textContent).toContain(
        '当前环境无法创建比较所需的浏览器能力（Web Worker、Web Crypto 或文字分段功能），无法比较。',
      );
      // 不卡在 comparing 转圈：无比较中界面，有重试入口。
      expect(container.querySelector('.app-comparing')).toBeNull();
      expect(queryButton(container, '重新比较')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('P1-01：复制改稿说明收到当前目标与保护段落原文', async () => {
    const inline = createInlineWorker();
    const writeText = vi.fn(async (_text: string) => undefined);
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      act(() => {
        checkboxes(container)[1].click();
      });
      const goalInput = container.querySelector(
        '#prepare-goal-input',
      ) as HTMLInputElement;
      setInputValue(goalInput, '语气更正式');
      expect(clickButton(container, '复制改稿说明')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已复制改稿说明。');
      }, { timeout: 5000 });
      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0][0] as string;
      expect(copied).toContain('修改目标：语气更正式');
      expect(copied).toContain('第 2 段：人数上限为30人。');
      expect(copied).not.toContain('prot-1');
      expect(copied).not.toContain('analysisId');
    } finally {
      cleanup();
    }
  });

  it('P1-01：复制改稿说明失败时提示手动复制，不伪造成功', async () => {
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: {
        writeText: async () => {
          throw new Error('clipboard denied');
        },
      },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      expect(clickButton(container, '复制改稿说明')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain(
          '复制失败，请手动全选上面文本复制。',
        );
      }, { timeout: 5000 });
    } finally {
      cleanup();
    }
  });

  it('P2-05：返回审阅（保留决定）：已做决定不受影响', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      act(() => {
        checkboxes(container)[1].click();
      });
      const candidateInput = container.querySelector(
        '#candidate-input',
      ) as HTMLTextAreaElement;
      setInputValue(candidateInput, CANDIDATE);
      expect(clickButton(container, '开始比较')).toBe(true);
      await vi.waitFor(() => {
        expect(container.querySelector('.review-panel')).not.toBeNull();
      }, { timeout: 5000 });
      // 先采用一处改动。
      expect(clickButton(container, '采用这处修改')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已采用 1 项');
      }, { timeout: 5000 });
      // 返回准备页，再点“返回审阅（保留决定）”。
      expect(clickButton(container, '返回调整保护')).toBe(true);
      await vi.waitFor(() => {
        expect(container.textContent).toContain('你从审阅页返回');
      }, { timeout: 5000 });
      expect(queryButton(container, '返回审阅（保留决定）')).not.toBeNull();
      expect(clickButton(container, '返回审阅（保留决定）')).toBe(true);
      await vi.waitFor(() => {
        expect(container.querySelector('.review-panel')).not.toBeNull();
      }, { timeout: 5000 });
      // 决定保留：仍为已采用 1 项，未被清空。
      expect(container.textContent).toContain('已采用 1 项');
    } finally {
      cleanup();
    }
  });

  it('P2-06：组合输入中点保护复选框不冻结半成品草稿，结束后恢复', async () => {
    const capture: BlobCapture = { blobs: [] };
    stubDownloads(capture);
    const inline = createInlineWorker();
    let jobCounter = 0;
    const deps: EditPactDeps = {
      createWorkerClient: () =>
        new DiffWorkerClient({
          createWorker: () => inline.worker,
        }),
      generateJobId: () => `job-${++jobCounter}`,
      confirm: () => true,
      clipboard: { writeText: async () => undefined },
    };
    const { container, cleanup } = render(<EditPactApp deps={deps} />);
    try {
      const originalInput = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(originalInput, ORIGINAL);
      // 模拟 IME 组合输入进行中（与 E2E 同一事件序列）。
      act(() => {
        originalInput.dispatchEvent(
          new window.CompositionEvent('compositionstart', {
            bubbles: true,
          }),
        );
      });
      act(() => {
        checkboxes(container)[1].click();
      });
      // 保护未勾上，组合未结束有明确提示。
      expect(container.textContent).toContain('本轮没有受保护段落');
      expect(container.textContent).toContain('输入法组合输入尚未结束');
      // 结束组合后，勾选正常生效。
      act(() => {
        originalInput.dispatchEvent(
          new window.CompositionEvent('compositionend', {
            bubbles: true,
            data: '人',
          }),
        );
      });
      act(() => {
        checkboxes(container)[1].click();
      });
      await vi.waitFor(() => {
        expect(container.textContent).toContain('已保护 1 段');
      }, { timeout: 5000 });
    } finally {
      cleanup();
    }
  });
});
