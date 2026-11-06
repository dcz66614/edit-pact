/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProtectedRange } from '../../src/domain/types';
import { hasUnpairedSurrogate, splitParagraphs } from '../../src/core/text';
import { buildInstructionText } from '../../src/core/instruction';
import {
  DEFAULT_EXAMPLE_TEXT,
  GOAL_MAX_UNITS,
  PreparePanel,
} from '../../src/components/PreparePanel';
import { MAX_PROTECTED_PARAGRAPHS } from '../../src/components/ProtectionList';

// 让 React 的 act 在测试环境生效（React 18 要求显式开启）。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SAMPLE_ORIGINAL =
  '第一段文字。\n\n第三段有日期 2026 年 11 月 5 日和人数 12 人。';

interface HarnessProps {
  initialOriginal?: string;
  initialProtections?: ProtectedRange[];
  onOriginalChange?: (text: string) => void;
  onProtectionsChange?: (protections: ProtectedRange[]) => void;
  onGoalChange?: (goal: string) => void;
  onCopyInstruction?: () => void;
  onBeginCompare?: () => void;
}

function Harness({
  initialOriginal = SAMPLE_ORIGINAL,
  initialProtections = [],
  onOriginalChange,
  onProtectionsChange,
  onGoalChange,
  onCopyInstruction,
  onBeginCompare,
}: HarnessProps) {
  const [original, setOriginal] = useState(initialOriginal);
  const [protections, setProtections] = useState<ProtectedRange[]>(
    initialProtections,
  );
  const [goal, setGoal] = useState('');
  const [instructionCopyState, setInstructionCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  return (
    <PreparePanel
      original={original}
      onOriginalChange={(text) => {
        setOriginal(text);
        onOriginalChange?.(text);
      }}
      protections={protections}
      onProtectionsChange={(next) => {
        setProtections(next);
        onProtectionsChange?.(next);
      }}
      goal={goal}
      onGoalChange={(next) => {
        setGoal(next);
        onGoalChange?.(next);
      }}
      instructionText={buildInstructionText({
        goal,
        original,
        protections,
      })}
      onCopyInstruction={() => {
        setInstructionCopyState('copied');
        onCopyInstruction?.();
      }}
      instructionCopyState={instructionCopyState}
      onBeginCompare={onBeginCompare}
    />
  );
}

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

function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
}

describe('PreparePanel', () => {
  it('按换行展示段落：段号、全文与空白段', () => {
    const { container, cleanup } = render(<Harness />);
    try {
      const boxes = checkboxes(container);
      expect(boxes).toHaveLength(3);
      expect(container.textContent).toContain('第 1 段');
      expect(container.textContent).toContain('第 2 段');
      expect(container.textContent).toContain('第 3 段');
      expect(container.textContent).toContain('第一段文字。');
      expect(container.textContent).toContain(
        '第三段有日期 2026 年 11 月 5 日和人数 12 人。',
      );
      // 第 2 段是空白段：展示但不可保护。
      expect(boxes[1].disabled).toBe(true);
      expect(boxes[1].getAttribute('aria-label')).toContain('空白段');
      expect(boxes[0].disabled).toBe(false);
      expect(boxes[2].disabled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('不自动猜测敏感信息：含日期与人数的段落默认不选中', () => {
    const { container, cleanup } = render(<Harness />);
    try {
      const boxes = checkboxes(container);
      expect(boxes.every((b) => !b.checked)).toBe(true);
      expect(container.textContent).toContain('只保护你亲手勾选的段落');
    } finally {
      cleanup();
    }
  });

  it('勾选回传正确的保护范围（规范化坐标，不含段末 LF）', () => {
    const onProtectionsChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onProtectionsChange={onProtectionsChange} />,
    );
    try {
      act(() => {
        checkboxes(container)[2].click();
      });
      expect(onProtectionsChange).toHaveBeenCalledTimes(1);
      expect(onProtectionsChange).toHaveBeenCalledWith([
        { id: 'prot-1', paragraphId: 'p3', start: 8, end: 39 },
      ]);
      // 再次点击取消选择。
      act(() => {
        checkboxes(container)[2].click();
      });
      expect(onProtectionsChange).toHaveBeenCalledTimes(2);
      expect(onProtectionsChange).toHaveBeenLastCalledWith([]);
    } finally {
      cleanup();
    }
  });

  it('保护 id 按原文顺序编号，与点击顺序无关', () => {
    const onProtectionsChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onProtectionsChange={onProtectionsChange} />,
    );
    try {
      act(() => {
        checkboxes(container)[2].click(); // 先点第 3 段
      });
      act(() => {
        checkboxes(container)[0].click(); // 再点第 1 段
      });
      expect(onProtectionsChange).toHaveBeenLastCalledWith([
        { id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 },
        { id: 'prot-2', paragraphId: 'p3', start: 8, end: 39 },
      ]);
    } finally {
      cleanup();
    }
  });

  it('空白段复选框被禁用，点击不回传', () => {
    const onProtectionsChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onProtectionsChange={onProtectionsChange} />,
    );
    try {
      act(() => {
        checkboxes(container)[1].click();
      });
      expect(onProtectionsChange).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('20 段上限：选满后其余复选框禁用，取消一段后恢复', () => {
    const original = Array.from({ length: 21 }, (_, i) => `第${i + 1}段`).join(
      '\n',
    );
    const { container, cleanup } = render(
      <Harness initialOriginal={original} />,
    );
    try {
      expect(checkboxes(container)).toHaveLength(21);
      for (let i = 0; i < MAX_PROTECTED_PARAGRAPHS; i++) {
        act(() => {
          checkboxes(container)[i].click();
        });
      }
      const boxes = checkboxes(container);
      expect(boxes[20].disabled).toBe(true);
      expect(container.textContent).toContain(
        `已达到最多 ${MAX_PROTECTED_PARAGRAPHS} 段保护`,
      );
      // 取消一段，第 21 段恢复可选。
      act(() => {
        boxes[0].click();
      });
      expect(checkboxes(container)[20].disabled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('长段先显示前 200 字预览，展开后显示全文', () => {
    const longText = '长'.repeat(250);
    const { container, cleanup } = render(
      <Harness initialOriginal={`短段。\n${longText}`} />,
    );
    try {
      const expandButton = container.querySelector(
        '.protection-expand',
      ) as HTMLButtonElement;
      expect(expandButton).not.toBeNull();
      expect(expandButton.textContent).toContain('展开全文（共 250 字）');
      // 折叠态只显示前 200 字加省略号，不显示完整 250 字。
      expect(container.textContent).toContain('长'.repeat(200) + '……');
      act(() => {
        expandButton.click();
      });
      expect(expandButton.textContent).toBe('收起');
      expect(
        container.querySelector('.protection-text')?.textContent,
      ).not.toBeNull();
      // 展开后第二段的完整文本出现在文档中（250 字无省略号截断）。
      const rows = container.querySelectorAll('.protection-text');
      expect(rows[1].textContent).toBe(longText);
    } finally {
      cleanup();
    }
  });

  it('修改目标输入截断到 120 UTF-16 单元并显示计数', () => {
    const onGoalChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onGoalChange={onGoalChange} />,
    );
    try {
      const goalInput = container.querySelector(
        '#prepare-goal-input',
      ) as HTMLInputElement;
      expect(goalInput.getAttribute('maxlength')).toBe(
        String(GOAL_MAX_UNITS),
      );
      setInputValue(goalInput, '目'.repeat(130));
      expect(onGoalChange).toHaveBeenCalledWith('目'.repeat(120));
      expect(container.textContent).toContain('120/120 字');
    } finally {
      cleanup();
    }
  });

  it('原稿为空时显示虚构例子入口：不自动加载，点击才载入例子', () => {
    const onOriginalChange = vi.fn();
    const { container, cleanup } = render(
      <Harness initialOriginal="" onOriginalChange={onOriginalChange} />,
    );
    try {
      const button = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '载入内置虚构例子',
      );
      expect(button).not.toBeUndefined();
      expect(container.textContent).toContain('不会加载你的私人内容');
      // 内置例子全文在 80 字以内。
      expect(DEFAULT_EXAMPLE_TEXT.length).toBeLessThanOrEqual(80);
      expect(splitParagraphs(DEFAULT_EXAMPLE_TEXT)).toHaveLength(3);
      // 渲染时不自动加载。
      expect(onOriginalChange).not.toHaveBeenCalled();
      act(() => {
        button!.click();
      });
      expect(onOriginalChange).toHaveBeenCalledTimes(1);
      expect(onOriginalChange).toHaveBeenCalledWith(DEFAULT_EXAMPLE_TEXT);
    } finally {
      cleanup();
    }
  });

  it('刷新丢失提示、段落含义与无保护状态说明齐全', () => {
    const { container, cleanup } = render(<Harness />);
    try {
      expect(container.textContent).toContain(
        '内容仅在本页处理，不上传、不保存；刷新页面后会丢失。',
      );
      expect(container.textContent).toContain('段落按换行切分');
      expect(container.textContent).toContain('本轮没有受保护段落');
      // 选一段后，无保护提示消失，改为已保护计数。
      act(() => {
        checkboxes(container)[0].click();
      });
      expect(container.textContent).not.toContain('本轮没有受保护段落');
      expect(container.textContent).toContain('已保护 1 段');
    } finally {
      cleanup();
    }
  });

  it('键盘：聚焦复选框后按空格切换且只切换一次；回车不切换', () => {
    const onProtectionsChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onProtectionsChange={onProtectionsChange} />,
    );
    try {
      const box = checkboxes(container)[0];
      box.focus();
      expect(document.activeElement).toBe(box);
      act(() => {
        box.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: ' ',
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(onProtectionsChange).toHaveBeenCalledTimes(1);
      expect(onProtectionsChange).toHaveBeenCalledWith([
        { id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 },
      ]);
      act(() => {
        box.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(onProtectionsChange).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('陈旧保护范围（段落 id 相同但坐标不符）不显示为已选', () => {
    const stale: ProtectedRange[] = [
      { id: 'prot-1', paragraphId: 'p1', start: 0, end: 999 },
    ];
    const { container, cleanup } = render(
      <Harness initialProtections={stale} />,
    );
    try {
      expect(checkboxes(container)[0].checked).toBe(false);
      expect(container.textContent).toContain('本轮没有受保护段落');
    } finally {
      cleanup();
    }
  });

  it('超长原稿显示 TOO_LONG 错误，开始比较按钮禁用', () => {
    const onBeginCompare = vi.fn();
    const { container, cleanup } = render(
      <Harness
        initialOriginal={'原'.repeat(12001)}
        onBeginCompare={onBeginCompare}
      />,
    );
    try {
      expect(container.textContent).toContain('超过上限 12000 字');
      const beginButton = Array.from(
        container.querySelectorAll('button'),
      ).find((b) => b.textContent === '开始比较') as HTMLButtonElement;
      expect(beginButton.disabled).toBe(true);
      act(() => {
        beginButton.click();
      });
      expect(onBeginCompare).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('有效原稿时开始比较按钮可用，点击回传', () => {
    const onBeginCompare = vi.fn();
    const { container, cleanup } = render(
      <Harness onBeginCompare={onBeginCompare} />,
    );
    try {
      const beginButton = Array.from(
        container.querySelectorAll('button'),
      ).find((b) => b.textContent === '开始比较') as HTMLButtonElement;
      expect(beginButton.disabled).toBe(false);
      act(() => {
        beginButton.click();
      });
      expect(onBeginCompare).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('原稿输入变化回传完整新文本', () => {
    const onOriginalChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onOriginalChange={onOriginalChange} />,
    );
    try {
      const textarea = container.querySelector(
        '#prepare-original-input',
      ) as HTMLTextAreaElement;
      setInputValue(textarea, '新原稿第一段。\n新原稿第二段。');
      expect(onOriginalChange).toHaveBeenCalledWith(
        '新原稿第一段。\n新原稿第二段。',
      );
      // 新原稿的段落列表随之更新。
      expect(container.textContent).toContain('新原稿第二段。');
    } finally {
      cleanup();
    }
  });

  it('修改目标输入不断开代理对：119 个 a + 家庭表情，超限的表情整个舍弃（FIX-T013-08）', () => {
    const onGoalChange = vi.fn();
    const { container, cleanup } = render(
      <Harness onGoalChange={onGoalChange} />,
    );
    try {
      const goalInput = container.querySelector(
        '#prepare-goal-input',
      ) as HTMLInputElement;
      setInputValue(goalInput, 'a'.repeat(119) + '👨‍👩‍👧‍👦');
      // 119 个 a（119 单元）+ 家庭表情（11 单元）= 130 单元 > 120：
      // 表情整个舍弃，不取其前半部分；结果无不成对 surrogate。
      expect(onGoalChange).toHaveBeenCalledWith('a'.repeat(119));
      expect(hasUnpairedSurrogate(goalInput.value)).toBe(false);
      expect(goalInput.value.length).toBeLessThanOrEqual(120);
    } finally {
      cleanup();
    }
  });

  it('改稿说明区：显示当前目标与保护段落，点复制回传并显示已复制（FIX-T013-01）', () => {
    const onCopyInstruction = vi.fn();
    const { container, cleanup } = render(
      <Harness
        initialProtections={[
          { id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 },
        ]}
        onCopyInstruction={onCopyInstruction}
      />,
    );
    try {
      const goalInput = container.querySelector(
        '#prepare-goal-input',
      ) as HTMLInputElement;
      setInputValue(goalInput, '语气更正式');
      const instructionBox = container.querySelector(
        '#prepare-instruction-text',
      ) as HTMLTextAreaElement;
      expect(instructionBox.value).toContain('修改目标：语气更正式');
      expect(instructionBox.value).toContain('第 1 段：第一段文字。');
      expect(instructionBox.value).toContain('不会发送任何内容');
      const button = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === '复制改稿说明',
      ) as HTMLButtonElement;
      expect(button).not.toBeUndefined();
      act(() => {
        button.click();
      });
      expect(onCopyInstruction).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('已复制改稿说明。');
    } finally {
      cleanup();
    }
  });
});
