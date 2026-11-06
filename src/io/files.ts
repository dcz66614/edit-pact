/**
 * P012 改稿守约 Edit Pact — 本地文件导入与导出（T009）。
 *
 * 来源：项目书 §8.1（输入限制：单个导入文件最多 100 KiB，只接受 UTF-8
 * 严格解码，不猜测 GBK；超限拒绝本次导入，保留之前输入）、§9.2
 * （exportText 签名）、CONTRACT.md §1.1（exportText 冻结签名）、
 * §3（InputIssue.code：FILE_TOO_LARGE / INVALID_UTF8 / INVALID_UNICODE）。
 *
 * 本模块只做本地 I/O：不联网、不写浏览器存储、不调用任何模型。
 * 导出只接受 compose 的成功文本（调用方负责复核三标识），本模块
 * 不直接下载 candidate，不绕过 compose。
 */

import { MAX_FILE_BYTES } from '../domain/types';
import type { InputIssueCode } from '../domain/types';
import { hasUnpairedSurrogate } from '../core/text';

export type ReadTextFileResult =
  | { ok: true; text: string }
  | { ok: false; issueCode: InputIssueCode };

/**
 * 严格读取一个纯文本文件。
 *  - 文件超过 100 KiB → FILE_TOO_LARGE；
 *  - 非严格 UTF-8（TextDecoder fatal 解码失败）→ INVALID_UTF8；
 *  - 含不成对 surrogate → INVALID_UNICODE。
 * 任一失败都返回错误码，不抛错；调用方保留之前输入。
 */
export async function readTextFile(file: File): Promise<ReadTextFileResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, issueCode: 'FILE_TOO_LARGE' };
  }
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, issueCode: 'INVALID_UTF8' };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return { ok: false, issueCode: 'INVALID_UTF8' };
  }
  if (hasUnpairedSurrogate(text)) {
    return { ok: false, issueCode: 'INVALID_UNICODE' };
  }
  return { ok: true, text };
}

/**
 * 按冻结签名交付：把最终文本包成 Blob（text/plain; charset=utf-8）。
 * 只接受 compose 的成功结果文本；调用方在调用前复核三标识。
 */
export function exportText(text: string): Blob {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

/** 与真实 URL 兼容的最小接口（测试可注入假实现）。 */
export interface UrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/** 与真实 <a> 元素兼容的最小接口（测试可注入假实现）。 */
export interface AnchorLike {
  href: string;
  download: string;
  click(): void;
  remove(): void;
}

export interface DownloadDeps {
  /** 注入 URL 实现（默认 globalThis.URL）。 */
  urlApi?: UrlApi;
  /** 注入 <a> 工厂（默认创建真实 <a> 并挂到 body，点击后移除）。 */
  createAnchor?: () => AnchorLike;
  /** 注入定时器（默认 setTimeout；用于测试中断言释放时序）。 */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
}

/**
 * 下载一个 Blob：创建对象 URL → 锚点点击 → 1 秒后释放 URL。
 * 返回本次的对象 URL（调用方可据此核对 TXT 与预览是否同一文本）。
 * Blob URL 一定会被释放：释放定时器在点击后立即安排，不依赖调用方。
 */
export function downloadBlob(
  blob: Blob,
  filename: string,
  deps: DownloadDeps = {},
): string {
  const urlApi: UrlApi = deps.urlApi ?? globalThis.URL;
  const url = urlApi.createObjectURL(blob);
  const anchor: AnchorLike =
    deps.createAnchor !== undefined
      ? deps.createAnchor()
      : (() => {
          const a = document.createElement('a');
          document.body.appendChild(a);
          return a;
        })();
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  anchor.remove();
  const schedule = deps.setTimeoutFn ?? setTimeout;
  schedule(() => {
    urlApi.revokeObjectURL(url);
  }, 1000);
  return url;
}
