/**
 * P012 改稿守约 Edit Pact — 剪贴板复制（T009）。
 *
 * 来源：项目书 §7.2（剪贴板失败：展示可手工全选的最终文本和 TXT
 * 下载入口）、实施计划 §9（剪贴板失败回退）。
 *
 * 本模块只返回复制是否成功，不伪造成功。失败时调用方展示手动
 * 全选的最终文本与 TXT 下载入口（回退在 UI 层，不用已废弃的
 * document.execCommand 兜底）。
 */

/** 与 navigator.clipboard 兼容的最小接口（测试可注入假实现）。 */
export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * 复制文本到剪贴板。成功返回 true；剪贴板 API 不可用（例如非安全
 * 上下文）或写入抛错时返回 false，不抛错。
 */
export async function copyToClipboard(
  text: string,
  clipboard?: ClipboardLike | null,
): Promise<boolean> {
  const target =
    clipboard ?? globalThis.navigator?.clipboard ?? null;
  if (target === null || typeof target.writeText !== 'function') {
    return false;
  }
  try {
    await target.writeText(text);
    return true;
  } catch {
    return false;
  }
}
