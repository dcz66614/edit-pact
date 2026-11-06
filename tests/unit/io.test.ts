/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { downloadBlob, exportText, readTextFile } from '../../src/io/files';
import type { AnchorLike, UrlApi } from '../../src/io/files';
import { copyToClipboard } from '../../src/io/clipboard';

describe('readTextFile', () => {
  it('严格 UTF-8 文本读出原文', async () => {
    const file = new File(['你好，世界。\n第二行。'], 'a.txt', {
      type: 'text/plain',
    });
    await expect(readTextFile(file)).resolves.toEqual({
      ok: true,
      text: '你好，世界。\n第二行。',
    });
  });

  it('空文件读出空文本', async () => {
    const file = new File([], 'empty.txt', { type: 'text/plain' });
    await expect(readTextFile(file)).resolves.toEqual({ ok: true, text: '' });
  });

  it('超过 100 KiB → FILE_TOO_LARGE', async () => {
    const file = new File(['x'.repeat(100 * 1024 + 1)], 'big.txt', {
      type: 'text/plain',
    });
    await expect(readTextFile(file)).resolves.toEqual({
      ok: false,
      issueCode: 'FILE_TOO_LARGE',
    });
  });

  it('正好 100 KiB 不超限', async () => {
    const file = new File(['x'.repeat(100 * 1024)], 'edge.txt', {
      type: 'text/plain',
    });
    const result = await readTextFile(file);
    expect(result.ok).toBe(true);
  });

  it('非严格 UTF-8 字节 → INVALID_UTF8', async () => {
    const file = new File([new Uint8Array([0x68, 0x69, 0xff, 0xfe])], 'bad.txt', {
      type: 'text/plain',
    });
    await expect(readTextFile(file)).resolves.toEqual({
      ok: false,
      issueCode: 'INVALID_UTF8',
    });
  });
});

describe('exportText', () => {
  it('生成 text/plain Blob，内容与输入逐字相同', async () => {
    const blob = exportText('请在周五前回复确认。\n人数上限为30人。');
    expect(blob.type).toBe('text/plain;charset=utf-8');
    await expect(blob.text()).resolves.toBe(
      '请在周五前回复确认。\n人数上限为30人。',
    );
  });

  it('空文本也可导出为空 Blob', async () => {
    const blob = exportText('');
    expect(blob.size).toBe(0);
    await expect(blob.text()).resolves.toBe('');
  });
});

describe('downloadBlob', () => {
  it('创建对象 URL、锚点点击、1 秒后释放', () => {
    let capturedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:fake-1';
    });
    const revokeObjectURL = vi.fn();
    const urlApi: UrlApi = { createObjectURL, revokeObjectURL };
    const click = vi.fn();
    const remove = vi.fn();
    const anchor: AnchorLike = { href: '', download: '', click, remove };
    let scheduled: { fn: () => void; ms: number } | null = null;
    const url = downloadBlob(new Blob(['abc']), 'edit-pact-result.txt', {
      urlApi,
      createAnchor: () => anchor,
      setTimeoutFn: (fn, ms) => {
        scheduled = { fn, ms };
        return 0;
      },
    });
    expect(url).toBe('blob:fake-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(capturedBlob).toBeInstanceOf(Blob);
    expect(anchor.href).toBe('blob:fake-1');
    expect(anchor.download).toBe('edit-pact-result.txt');
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(scheduled).not.toBeNull();
    expect(scheduled!.ms).toBe(1000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    scheduled!.fn();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
  });
});

describe('copyToClipboard', () => {
  it('写入成功返回 true', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyToClipboard('你好', { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('你好');
  });

  it('写入抛错返回 false，不抛错', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    await expect(copyToClipboard('你好', { writeText })).resolves.toBe(false);
  });

  it('剪贴板 API 不可用返回 false', async () => {
    await expect(copyToClipboard('你好', null)).resolves.toBe(false);
    await expect(
      copyToClipboard('你好', {} as unknown as { writeText: () => Promise<void> }),
    ).resolves.toBe(false);
  });
});
