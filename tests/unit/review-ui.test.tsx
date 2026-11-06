/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  Analysis,
  ComposeSuccess,
  Hunk,
  ProtectedRange,
} from '../../src/domain/types';
import { HunkCard } from '../../src/components/HunkCard';
import { ReviewPanel } from '../../src/components/ReviewPanel';
import { ResultPanel } from '../../src/components/ResultPanel';

// 让 React 的 act 在测试环境生效（React 18 要求显式开启）。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// ---------------------------------------------------------------------------
// 固定 UI 样本（手算坐标，已用 tsx + 真实 splitParagraphs 核对）
// ---------------------------------------------------------------------------

/** F01 同构：三段；保护第 2 段。 */
const F01_ORIGINAL = '请于周五确认。\n人数上限为30人。\n谢谢配合。';
const F01_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p2', start: 8, end: 17 },
];

function f01Hunks(): Hunk[] {
  return [
    {
      id: 'h1',
      start: 0,
      end: 7,
      oldText: '请于周五确认。',
      newText: '请在周五前回复确认。',
      conflicts: [],
      decision: 'pending',
    },
    {
      id: 'h2',
      start: 13,
      end: 15,
      oldText: '30',
      newText: '50',
      conflicts: ['prot-1'],
      decision: 'blocked',
    },
    {
      id: 'h3',
      start: 18,
      end: 23,
      oldText: '谢谢配合。',
      newText: '感谢配合。',
      conflicts: [],
      decision: 'pending',
    },
  ];
}

/** F08 同构：两处纯插入，一处紧贴保护段末（冲突），一处在文末（待审）。 */
const F08_ORIGINAL = '保护段文字。\n普通段文字。';
const F08_PROTECTIONS: ProtectedRange[] = [
  { id: 'prot-1', paragraphId: 'p1', start: 0, end: 6 },
];

function f08Hunks(): Hunk[] {
  return [
    {
      id: 'ins1',
      start: 6,
      end: 6,
      oldText: '',
      newText: '插入受阻。',
      conflicts: ['prot-1'],
      decision: 'blocked',
    },
    {
      id: 'ins2',
      start: 13,
      end: 13,
      oldText: '',
      newText: '追加内容。',
      conflicts: [],
      decision: 'pending',
    },
  ];
}

/** F11 同构：跨两段的整块替换。 */
const F11_ORIGINAL = '首段不变。\n旧第二行内容。\n旧第三行内容。\n尾段不变。';

function f11Hunks(): Hunk[] {
  return [
    {
      id: 'm1',
      start: 6,
      end: 21,
      oldText: '旧第二行内容。\n旧第三行内容。',
      newText: '新第二行内容。\n新第三行内容。',
      conflicts: [],
      decision: 'pending',
    },
  ];
}

/** 长改动：第一段 250 字整段替换。 */
const LONG_PARAGRAPH = '这是一段很长的段落。'.repeat(25);
const LONG_ORIGINAL = `${LONG_PARAGRAPH}\n短段。`;

function longHunks(): Hunk[] {
  return [
    {
      id: 'long1',
      start: 0,
      end: 250,
      oldText: LONG_PARAGRAPH,
      newText: '改短了。',
      conflicts: [],
      decision: 'pending',
    },
  ];
}

function makeAnalysis(
  hunks: Hunk[],
  protections: ProtectedRange[] = [],
): Analysis {
  return {
    schemaVersion: '1.0.0',
    engineVersion: '1.0.0+jsdiff-9.0.0',
    revision: 1,
    jobId: 'job-test-1',
    analysisId: 'analysis-test-1',
    originalHash: '00'.repeat(32),
    candidateHash: '11'.repeat(32),
    protections,
    hunks,
  };
}

function makeResult(text: string): ComposeSuccess {
  return {
    ok: true,
    text,
    outputHash: '22'.repeat(32),
    analysisId: 'analysis-test-1',
    revision: 1,
    decisionRevision: 2,
    protectedMappings: [],
  };
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

function queryButton(container: Element, label: string): HTMLButtonElement | null {
  const buttons = [...container.querySelectorAll('button')];
  return (
    (buttons.find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined) ?? null
  );
}

/** 带状态的父组件挂载：决定与“其余保留原文”真实改变 Analysis。 */
function StatefulReviewPanel({
  initialHunks,
  original,
  protections,
  onBackToProtections,
}: {
  initialHunks: Hunk[];
  original: string;
  protections: ProtectedRange[];
  onBackToProtections?: () => void;
}) {
  const [hunks, setHunks] = useState<Hunk[]>(initialHunks);
  return (
    <ReviewPanel
      original={original}
      analysis={makeAnalysis(hunks, protections)}
      onDecision={(hunkId, decision) => {
        setHunks((prev) =>
          prev.map((h) => (h.id === hunkId ? { ...h, decision } : h)),
        );
      }}
      onKeepRemaining={() => {
        setHunks((prev) =>
          prev.map((h) =>
            h.decision === 'pending' ? { ...h, decision: 'rejected' } : h,
          ),
        );
      }}
      onBackToProtections={onBackToProtections}
    />
  );
}

// ---------------------------------------------------------------------------
// HunkCard
// ---------------------------------------------------------------------------

describe('HunkCard', () => {
  it('待审替换：显示段号、新旧文字与两个决定按钮，点击回传决定', () => {
    const onDecision = vi.fn();
    const { container, cleanup } = render(
      <HunkCard
        hunk={f01Hunks()[0]}
        index={1}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={onDecision}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('第 1 处改动');
      expect(text).toContain('原稿第 1 段');
      expect(text).toContain('替换');
      expect(text).toContain('请于周五确认。');
      expect(text).toContain('请在周五前回复确认。');
      expect(text).toContain('待审');
      const accept = queryButton(container, '采用这处修改');
      const reject = queryButton(container, '保留原文');
      expect(accept).not.toBeNull();
      expect(reject).not.toBeNull();
      act(() => {
        accept!.click();
      });
      expect(onDecision).toHaveBeenCalledWith('h1', 'accepted');
      act(() => {
        reject!.click();
      });
      expect(onDecision).toHaveBeenCalledWith('h1', 'rejected');
    } finally {
      cleanup();
    }
  });

  it('纯换行 Hunk：删除文字栏与上下文变更片段显示“（换行符）”，不留空白（FIX-T013-09）', () => {
    const onDecision = vi.fn();
    const newlineHunk: Hunk = {
      id: 'h-newline',
      start: 4,
      end: 5,
      oldText: '\n',
      newText: '',
      conflicts: [],
      decision: 'pending',
    };
    const { container, cleanup } = render(
      <HunkCard
        hunk={newlineHunk}
        index={1}
        original={'第一段。\n第二段。'}
        protections={[]}
        onDecision={onDecision}
      />,
    );
    try {
      const text = container.textContent ?? '';
      // 删除文字栏不再是空白；上下文变更片段也不再是空白。
      expect(text).toContain('（换行符）');
      // 仍是删除类型、可审：保留原文按钮存在。
      expect(text).toContain('删除');
      expect(queryButton(container, '保留原文')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('blocked：显示保护段号与保留原文说明，无接受入口；返回调整保护可点击', () => {
    const onDecision = vi.fn();
    const onBack = vi.fn();
    const { container, cleanup } = render(
      <HunkCard
        hunk={f01Hunks()[1]}
        index={2}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={onDecision}
        onBackToProtections={onBack}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('这处修改碰到了你保护的第 2 段，成稿保留原文。');
      expect(text).toContain('保护冲突，已保留原文');
      expect(queryButton(container, '采用这处修改')).toBeNull();
      expect(queryButton(container, '保留原文')).toBeNull();
      const back = queryButton(container, '返回调整保护');
      expect(back).not.toBeNull();
      act(() => {
        back!.click();
      });
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onDecision).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('blocked 且不传 onBackToProtections 时不渲染返回按钮', () => {
    const { container, cleanup } = render(
      <HunkCard
        hunk={f01Hunks()[1]}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(queryButton(container, '返回调整保护')).toBeNull();
      expect(container.querySelectorAll('button').length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('已采用/已保留原文：显示状态，当前决定按钮禁用，另一按钮仍可改决定', () => {
    const onDecision = vi.fn();
    const accepted = { ...f01Hunks()[0], decision: 'accepted' as const };
    const { container, cleanup } = render(
      <HunkCard
        hunk={accepted}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={onDecision}
      />,
    );
    try {
      expect(container.textContent).toContain('已采用');
      expect(queryButton(container, '采用这处修改')!.disabled).toBe(true);
      expect(queryButton(container, '保留原文')!.disabled).toBe(false);
      act(() => {
        queryButton(container, '保留原文')!.click();
      });
      expect(onDecision).toHaveBeenCalledWith('h1', 'rejected');
    } finally {
      cleanup();
    }
    const rejected = { ...f01Hunks()[0], decision: 'rejected' as const };
    const second = render(
      <HunkCard
        hunk={rejected}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(second.container.textContent).toContain('已保留原文');
      expect(
        queryButton(second.container, '保留原文')!.disabled,
      ).toBe(true);
      expect(
        queryButton(second.container, '采用这处修改')!.disabled,
      ).toBe(false);
    } finally {
      second.cleanup();
    }
  });

  it('纯插入：标明纯插入与插入点，段末插入归属到该段', () => {
    const { container, cleanup } = render(
      <HunkCard
        hunk={f08Hunks()[1]}
        index={2}
        original={F08_ORIGINAL}
        protections={F08_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('纯插入');
      // [13,13) 在文末，归属第 2 段。
      expect(text).toContain('原稿第 2 段');
      expect(text).toContain('【插入点】');
      expect(text).toContain('普通段文字。');
      expect(text).toContain('追加内容。');
      expect(text).toContain('（无，纯插入）');
      expect(queryButton(container, '采用这处修改')).not.toBeNull();
    } finally {
      cleanup();
    }
    // [6,6) 紧贴第 1 段末，归属第 1 段而非第 2 段。
    const blocked = render(
      <HunkCard
        hunk={f08Hunks()[0]}
        original={F08_ORIGINAL}
        protections={F08_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(blocked.container.textContent).toContain('原稿第 1 段');
      expect(blocked.container.textContent).toContain(
        '这处修改碰到了你保护的第 1 段，成稿保留原文。',
      );
    } finally {
      blocked.cleanup();
    }
  });

  it('长改动：新旧文字超过 200 字先折叠，展开后显示全文', () => {
    const { container, cleanup } = render(
      <HunkCard
        hunk={longHunks()[0]}
        original={LONG_ORIGINAL}
        protections={[]}
        onDecision={vi.fn()}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('……');
      expect(text).toContain('展开全文（共 250 字）');
      // 折叠时只显示前 200 字：全文第 201 个字之后的片段不应出现。
      // 旧文字由“这是一段很长的段落。”重复 25 次；前 200 字恰好是 20 次，
      // 因此折叠态不应出现第 21 次重复的完整片段——用总长度判定更直接：
      const folded = container.querySelector('.hunk-foldable-text');
      expect(folded).not.toBeNull();
      expect(folded!.textContent!.length).toBeLessThanOrEqual(202);
      act(() => {
        queryButton(container, '展开全文（共 250 字）')!.click();
      });
      const expanded = container.querySelector('.hunk-foldable-text');
      expect(expanded!.textContent).toBe(LONG_PARAGRAPH);
      expect(container.textContent).toContain('收起');
    } finally {
      cleanup();
    }
  });

  it('跨段替换：展示全部受影响段落上下文，变更片段有标记', () => {
    const { container, cleanup } = render(
      <HunkCard
        hunk={f11Hunks()[0]}
        original={F11_ORIGINAL}
        protections={[]}
        onDecision={vi.fn()}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain('原稿第 2 段、第 3 段');
      const marks = [...container.querySelectorAll('mark.hunk-context-changed')];
      expect(marks.length).toBe(2);
      expect(marks[0].textContent).toBe('旧第二行内容。');
      expect(marks[1].textContent).toBe('旧第三行内容。');
    } finally {
      cleanup();
    }
  });

  it('删除：新文字为空时标明整处删除', () => {
    const deletion: Hunk = {
      id: 'd1',
      start: 0,
      end: 7,
      oldText: '请于周五确认。',
      newText: '',
      conflicts: [],
      decision: 'pending',
    };
    const { container, cleanup } = render(
      <HunkCard
        hunk={deletion}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(container.textContent).toContain('删除');
      expect(container.textContent).toContain('（无，整处删除）');
    } finally {
      cleanup();
    }
  });

  it('冲突但 decision 被篡改为 pending：仍无接受入口，按 blocked 显示', () => {
    const tampered: Hunk = {
      ...f01Hunks()[1],
      decision: 'pending',
    };
    const { container, cleanup } = render(
      <HunkCard
        hunk={tampered}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(queryButton(container, '采用这处修改')).toBeNull();
      expect(container.textContent).toContain('保护冲突，已保留原文');
    } finally {
      cleanup();
    }
  });

  it('多处冲突：列出全部受保护段号', () => {
    const original = '甲段文字。\n乙段文字。\n丙段文字。';
    const protections: ProtectedRange[] = [
      { id: 'prot-1', paragraphId: 'p2', start: 6, end: 11 },
      { id: 'prot-2', paragraphId: 'p3', start: 12, end: 17 },
    ];
    const hunk: Hunk = {
      id: 'x1',
      start: 8,
      end: 14,
      oldText: '段文字。\n丙',
      newText: '改写。',
      conflicts: ['prot-1', 'prot-2'],
      decision: 'blocked',
    };
    const { container, cleanup } = render(
      <HunkCard
        hunk={hunk}
        original={original}
        protections={protections}
        onDecision={vi.fn()}
      />,
    );
    try {
      expect(container.textContent).toContain(
        '这处修改碰到了你保护的第 2 段、第 3 段，成稿保留原文。',
      );
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// ReviewPanel
// ---------------------------------------------------------------------------

describe('ReviewPanel', () => {
  it('计数正确：全部 Hunk 都渲染，不隐藏任何一项', () => {
    const { container, cleanup } = render(
      <ReviewPanel
        original={F01_ORIGINAL}
        analysis={makeAnalysis(f01Hunks(), F01_PROTECTIONS)}
        onDecision={vi.fn()}
        onKeepRemaining={vi.fn()}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).toContain(
        '待审 2 项 · 已采用 0 项 · 已保留原文 0 项 · 保护冲突 1 项',
      );
      expect(container.querySelectorAll('.hunk-card').length).toBe(3);
      // 左栏原稿标记：第 2 段标已保护。
      expect(text).toContain('第 2 段');
      expect(container.querySelectorAll('.review-paragraph--protected').length).toBe(1);
      // 待审未清：提示与“其余保留原文”按钮。
      expect(text).toContain('处理完剩余 2 项后生成全文');
      expect(queryButton(container, '其余保留原文')).not.toBeNull();
      expect(text).toContain(
        '把其余待审项全部改为保留原文；已采用的改动不受影响。',
      );
    } finally {
      cleanup();
    }
  });

  it('其余保留原文：只改 pending，已采用项不受影响；清零后显示可生成成稿', () => {
    const { container, cleanup } = render(
      <StatefulReviewPanel
        initialHunks={f01Hunks()}
        original={F01_ORIGINAL}
        protections={F01_PROTECTIONS}
      />,
    );
    try {
      // 先采用 h1。
      act(() => {
        queryButton(container, '采用这处修改')!.click();
      });
      expect(container.textContent).toContain(
        '待审 1 项 · 已采用 1 项 · 已保留原文 0 项 · 保护冲突 1 项',
      );
      // 再点“其余保留原文”。
      act(() => {
        queryButton(container, '其余保留原文')!.click();
      });
      const text = container.textContent ?? '';
      expect(text).toContain(
        '待审 0 项 · 已采用 1 项 · 已保留原文 1 项 · 保护冲突 1 项',
      );
      expect(text).toContain('待审已清，可以生成成稿。');
      expect(queryButton(container, '其余保留原文')).toBeNull();
      // h1 仍为已采用，h3 变为已保留原文。
      const cards = [...container.querySelectorAll('.hunk-card')];
      expect(cards[0].textContent).toContain('已采用');
      expect(cards[2].textContent).toContain('已保留原文');
    } finally {
      cleanup();
    }
  });

  it('无差异：显示“未发现文字改动”，不渲染变更卡', () => {
    const { container, cleanup } = render(
      <ReviewPanel
        original={F01_ORIGINAL}
        analysis={makeAnalysis([], F01_PROTECTIONS)}
        onDecision={vi.fn()}
        onKeepRemaining={vi.fn()}
      />,
    );
    try {
      expect(container.textContent).toContain('未发现文字改动');
      expect(container.querySelectorAll('.hunk-card').length).toBe(0);
      expect(queryButton(container, '其余保留原文')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('不显示真实性评分或伪百分比进度', () => {
    const { container, cleanup } = render(
      <ReviewPanel
        original={F01_ORIGINAL}
        analysis={makeAnalysis(f01Hunks(), F01_PROTECTIONS)}
        onDecision={vi.fn()}
        onKeepRemaining={vi.fn()}
      />,
    );
    try {
      const text = container.textContent ?? '';
      expect(text).not.toContain('%');
      expect(text).not.toContain('真实性');
      expect(text).not.toContain('评分');
      expect(text).not.toContain('准确率');
    } finally {
      cleanup();
    }
  });

  it('决定按钮是原生 button，可聚焦；返回调整保护回传', () => {
    const onBack = vi.fn();
    const { container, cleanup } = render(
      <ReviewPanel
        original={F01_ORIGINAL}
        analysis={makeAnalysis(f01Hunks(), F01_PROTECTIONS)}
        onDecision={vi.fn()}
        onKeepRemaining={vi.fn()}
        onBackToProtections={onBack}
      />,
    );
    try {
      const accept = queryButton(container, '采用这处修改')!;
      expect(accept.tagName.toLowerCase()).toBe('button');
      act(() => {
        accept.focus();
      });
      expect(document.activeElement).toBe(accept);
      act(() => {
        queryButton(container, '返回调整保护')!.click();
      });
      expect(onBack).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// ResultPanel
// ---------------------------------------------------------------------------

describe('ResultPanel', () => {
  it('尚未生成成稿时只显示占位提示，不显示成稿全文', () => {
    const { container, cleanup } = render(
      <ResultPanel
        result={null}
        acceptedCount={0}
        rejectedCount={0}
        blockedCount={0}
        protectedCount={0}
      />,
    );
    try {
      expect(container.textContent).toContain('尚未生成成稿');
      expect(container.querySelector('.result-text')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('有成稿时显示全文、计数与两句固定文案，不显示百分比', () => {
    const text = '请在周五前回复确认。\n人数上限为30人。\n感谢配合。';
    const { container, cleanup } = render(
      <ResultPanel
        result={makeResult(text)}
        acceptedCount={2}
        rejectedCount={0}
        blockedCount={1}
        protectedCount={1}
      />,
    );
    try {
      const content = container.textContent ?? '';
      expect(container.querySelector('.result-text')!.textContent).toBe(text);
      expect(content).toContain(
        '受保护 1 段 · 已采用 2 处 · 已保留原文 0 处 · 保护冲突 1 处',
      );
      expect(content).toContain('已按本轮保护范围合成。');
      expect(content).toContain('文字保留不代表语义或事实已经核查。');
      expect(content).not.toContain('%');
      expect(content).not.toContain('真实性');
    } finally {
      cleanup();
    }
  });

  it('合法空成稿：标明已接受整篇删除', () => {
    const { container, cleanup } = render(
      <ResultPanel
        result={makeResult('')}
        acceptedCount={1}
        rejectedCount={0}
        blockedCount={0}
        protectedCount={0}
      />,
    );
    try {
      expect(container.textContent).toContain('成稿为空：已接受整篇删除。');
    } finally {
      cleanup();
    }
  });
});
