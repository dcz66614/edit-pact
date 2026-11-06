/**
 * P012 改稿守约 Edit Pact — 工作流集成 hook（T009）。
 *
 * 来源：项目书 §4（固定流程：原稿 → 保护 → 改稿 → 比较 → 审阅 →
 * 成稿 → 复制/下载/回执 → 清空）、§7.2（状态与文案：比较中可取消、
 * 待审未清时复制禁用、剪贴板失败回退、清空确认一次、原稿改动
 * 清除改稿/保护/决定、IME 组合输入中禁止冻结与计算）、§8.4
 * （合成与授权）、CONTRACT.md §1.1（makeReceipt / exportText /
 * clearSession 冻结签名）、§5（三个标识复核、等待期间变化即丢弃
 * 旧结果）、T006 交接（beginCompare 清空旧分析、error 阶段需提供
 * 重新比较入口；clearSession 只接 onClear 回调）、T007 交接
 * （原稿变化清除旧保护与决定、保护变化清除决定、开始比较冻结
 * 本轮保护契约、内置例子用 DEFAULT_EXAMPLE_TEXT）、T008 交接
 * （待审清零后由 T009 调用 compose；复制/下载/回执前复核三标识；
 * onDecision 接 setDecision、onKeepRemaining 接 keepRemaining）。
 *
 * 本 hook 只做接线，不重新实现任何核心规则：比较走
 * DiffWorkerClient（T004），决定走 reducer（T006），合成走
 * compose（T005），回执走 makeReceipt（T009）。原稿文本用草稿
 * 持有、失焦/比较/改保护前才提交为一次契约原稿变化（避免每次
 * 按键都按“原稿变化”清除改稿与保护；提交时若会丢失内容先确认
 * 一次）。中文输入法组合输入期间禁止冻结与计算。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ENGINE_VERSION } from '../core/diff';
import { compose } from '../core/compose';
import { makeReceipt, ReceiptError } from '../core/receipt';
import {
  applyAnalysisResult,
  beginCompare,
  cancelCompare,
  changeCandidate,
  changeOriginal,
  changeProtections,
  clearSession,
  keepRemaining,
  setDecision,
} from '../core/reducer';
import { canonicalize, splitParagraphs, validateInput } from '../core/text';
import { buildInstructionText } from '../core/instruction';
import type {
  AnalyzeRequest,
  AnalyzeResult,
  ComposeSuccess,
  InputIssue,
  ProtectedRange,
  ReviewReceipt,
  ReviewSession,
} from '../domain/types';
import { countHunks } from '../components/ReviewPanel';
import { DiffWorkerClient } from '../workers/client';
import { copyToClipboard } from '../io/clipboard';
import { downloadBlob, exportText, readTextFile } from '../io/files';

export interface EditPactDeps {
  /** 注入 Worker 客户端工厂（默认 new DiffWorkerClient()，真实 Worker）。 */
  createWorkerClient?: () => DiffWorkerClient;
  /** 注入 jobId 生成器（默认 crypto.randomUUID，有回退）。 */
  generateJobId?: () => string;
  /** 注入确认对话框（默认 window.confirm；测试注入假实现）。 */
  confirm?: (message: string) => boolean;
  /** 注入剪贴板（默认 navigator.clipboard；测试注入假实现）。 */
  clipboard?: { writeText(text: string): Promise<void> } | null;
}

export interface AppError {
  code: string;
  message: string;
}

export type CopyState = 'idle' | 'copied' | 'failed';

export interface EditPactState {
  session: ReviewSession;
  /** 原稿草稿：用户正在输入的文本，提交前不进入 session。 */
  originalDraft: string;
  goal: string;
  candidateProvided: boolean;
  isComposing: boolean;
  composeResult: ComposeSuccess | null;
  receipt: ReviewReceipt | null;
  error: AppError | null;
  copyState: CopyState;
  /** 改稿说明文本（FR03）：只含用户当前看到的内容（目标 + 草稿中
   *  显示为已选的保护段落），不含任何内部标识；复制不发送。 */
  instructionText: string;
  /** 改稿说明的复制状态（与成稿复制分开记）。 */
  instructionCopyState: CopyState;
  /** 从审阅页返回准备页查看/调整保护（session 仍为 review，改动才清决定）。 */
  returningToPrepare: boolean;
  /** 是否有任何内容（控制“清空”按钮可用性）。 */
  hasContent: boolean;
}

export interface EditPactActions {
  setOriginalDraft(text: string): void;
  commitOriginalDraft(): boolean;
  setCandidate(text: string): void;
  setGoal(goal: string): void;
  setProtections(protections: ProtectedRange[]): void;
  importOriginalFile(file: File): Promise<void>;
  importCandidateFile(file: File): Promise<void>;
  beginCompare(): void;
  cancelCompare(): void;
  retryCompare(): void;
  decide(hunkId: string, decision: 'accepted' | 'rejected'): void;
  keepRemaining(): void;
  backToProtections(): void;
  /** 返回审阅页（仅当本轮分析仍在时可用）：只清 UI 状态，不碰
   *  session，决定全部保留（FIX-T013-05）。 */
  backToReview(): void;
  copyResult(): Promise<void>;
  copyInstruction(): Promise<void>;
  downloadResult(): void;
  downloadReceipt(): void;
  clear(): void;
  dismissError(): void;
  onCompositionStart(): void;
  onCompositionEnd(): void;
}

/** 错误码/问题码对应的人类可读文案（不拼入私人全文）。 */
export function describeErrorCode(code: string): string {
  switch (code) {
    case 'INVALID_INPUT':
      return '输入不符合要求，请按提示修正后再比较。';
    case 'TOO_COMPLEX':
      return '改动过大或比较超时，已保留当前输入。请缩短为一段再比较，不要产出近似结果。';
    case 'CANCELLED':
      return '比较已取消，输入已保留。';
    case 'UNSUPPORTED_ENV':
      // 覆盖全部三类实际失败场景：Worker 无法创建（构造失败）、Web Crypto
      // 缺失、Intl.Segmenter 缺失。旧文案只写后两类，Worker 构造失败时
      // 提示与实际原因不符（FIX-R1 P2-05）。
      return '当前环境无法创建比较所需的浏览器能力（Web Worker、Web Crypto 或文字分段功能），无法比较。';
    case 'INVALID_PATCH':
      return '比较结果校验失败，已保留当前输入。请重新比较。';
    case 'STALE_ANALYSIS':
      return '这轮审阅已过期，请重新比较。';
    case 'PENDING_REVIEW':
      return '仍有待审项，成稿暂不可用。';
    case 'PROTECTED_CHANGE':
      return '这处修改碰到了保护段，不能接受。';
    case 'UNKNOWN_HUNK':
      return '这处改动已不在本轮审阅中，请重新比较。';
    case 'EMPTY_ORIGINAL':
      return '原稿为空。';
    case 'TOO_LONG':
      return '输入超过 12000 字上限，请缩短后再比较。';
    case 'TOO_MANY_PARAGRAPHS':
      return '输入超过 200 段上限，请合并段落后再比较。';
    case 'INVALID_UNICODE':
      return '输入含有不成对的代理字符，请修正后再比较。';
    case 'INVALID_UTF8':
      return '文件不是严格 UTF-8 文本，已保留之前输入。';
    case 'FILE_TOO_LARGE':
      return '文件超过 100 KiB，已保留之前输入。';
    case 'MISSING_CANDIDATE':
      return '请先粘贴改稿。';
    default:
      return '操作未能完成，已保留当前输入。';
  }
}

function issueMessage(issue: InputIssue): string {
  const who = issue.field === 'original' ? '原稿' : '改稿';
  switch (issue.code) {
    case 'EMPTY_ORIGINAL':
      return '原稿为空。';
    case 'TOO_LONG':
      return `${who}共 ${issue.actual ?? '?'} 字，超过上限 ${issue.limit ?? 12000} 字，请缩短后再比较。`;
    case 'TOO_MANY_PARAGRAPHS':
      return `${who}共 ${issue.actual ?? '?'} 段，超过上限 ${issue.limit ?? 200} 段，请合并段落后再比较。`;
    case 'INVALID_UNICODE':
      return `${who}含有不成对的代理字符（位置 ${issue.actual ?? '?'}），请修正后再比较。`;
    default:
      return describeErrorCode(issue.code);
  }
}

function defaultGenerateJobId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

const EMPTY_SESSION: ReviewSession = {
  original: '',
  candidate: '',
  revision: 0,
  decisionRevision: 0,
  phase: 'prepare',
  protections: [],
  analysis: null,
};

export function useEditPact(deps: EditPactDeps = {}): {
  state: EditPactState;
  actions: EditPactActions;
  canCompare: boolean;
  compareBlockedReason: string | null;
} {
  const [session, setSession] = useState<ReviewSession>(EMPTY_SESSION);
  const [originalDraft, setOriginalDraft] = useState('');
  const [goal, setGoal] = useState('');
  const [candidateProvided, setCandidateProvided] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<ComposeSuccess | null>(null);
  const [receipt, setReceipt] = useState<ReviewReceipt | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [instructionCopyState, setInstructionCopyState] =
    useState<CopyState>('idle');
  const [returningToPrepare, setReturningToPrepare] = useState(false);

  const sessionRef = useRef(session);
  const draftRef = useRef(originalDraft);
  const goalRef = useRef(goal);
  const candidateProvidedRef = useRef(candidateProvided);
  const isComposingRef = useRef(isComposing);
  const composeResultRef = useRef(composeResult);
  const clientRef = useRef<DiffWorkerClient | null>(null);
  const activeJobRef = useRef<{ jobId: string; revision: number } | null>(null);

  const confirmFn =
    deps.confirm ??
    ((message: string) =>
      typeof globalThis.window?.confirm === 'function'
        ? globalThis.window.confirm(message)
        : false);

  // 草稿与 session.original 同步：session 原稿只经提交/清空/导入变化，
  // 同步时草稿与之相等，不会打断用户正在输入的草稿。
  useEffect(() => {
    setOriginalDraft(session.original);
  }, [session.original]);

  /**
   * 应用一次 session 变化。任何新 session 引用都使已缓存的成稿、
   * 回执与复制状态失效（决定/输入/分析任一变化都不能再用旧结果导出）。
   */
  const updateSession = useCallback((next: ReviewSession) => {
    if (next === sessionRef.current) {
      return;
    }
    sessionRef.current = next;
    setSession(next);
    setComposeResult(null);
    composeResultRef.current = null;
    setReceipt(null);
    setCopyState('idle');
    setInstructionCopyState('idle');
    if (next.phase === 'prepare') {
      setReturningToPrepare(false);
    }
  }, []);

  const setDraft = useCallback((text: string) => {
    draftRef.current = text;
    setOriginalDraft(text);
  }, []);

  /**
   * 提交原稿草稿为一次契约原稿变化。草稿规范化后与现原稿相同则
   * 不提交；会丢失改稿/保护/决定时先确认一次，取消则把草稿恢复
   * 为现原稿。返回是否已提交（或无需提交）。
   *
   * 组合输入（IME）未结束时不冻结草稿（项目书 §8.5）：只有在草稿
   * 确实与现原稿不同、即将真正提交时才拒绝；草稿无变化时直接放行，
   * 不影响保护勾选等不冻结任何内容的操作。
   * （FIX-T013-06：原实现只在“开始比较”入口检查组合状态，保护勾选
   * 经 setProtections → commitOriginalDraft 会冻结半成品草稿。）
   */
  const commitOriginalDraft = useCallback((): boolean => {
    const current = sessionRef.current;
    const draft = draftRef.current;
    if (canonicalize(draft) === current.original) {
      if (draft !== current.original) {
        draftRef.current = current.original;
        setOriginalDraft(current.original);
      }
      return true;
    }
    if (isComposingRef.current) {
      setError({
        code: 'COMPOSING',
        message: '输入法组合输入尚未结束，请先完成输入再继续。',
      });
      return false;
    }
    const willLose =
      current.candidate !== '' ||
      current.protections.length > 0 ||
      current.analysis !== null;
    if (willLose) {
      const ok = confirmFn(
        '修改原稿将清除改稿、保护和决定，确定吗？',
      );
      if (!ok) {
        draftRef.current = current.original;
        setOriginalDraft(current.original);
        return false;
      }
    }
    updateSession(
      changeOriginal(current, draft, current.revision + 1),
    );
    return true;
  }, [confirmFn, updateSession]);

  const ensureClient = useCallback((): DiffWorkerClient => {
    if (clientRef.current === null) {
      clientRef.current = deps.createWorkerClient
        ? deps.createWorkerClient()
        : new DiffWorkerClient();
    }
    return clientRef.current;
  }, [deps.createWorkerClient]);

  const beginCompareFlow = useCallback(() => {
    if (isComposingRef.current) {
      setError({
        code: 'COMPOSING',
        message: '输入法组合输入尚未结束，请先完成输入再比较。',
      });
      return;
    }
    if (!commitOriginalDraft()) {
      return;
    }
    const current = sessionRef.current;
    if (current.phase === 'comparing') {
      return;
    }
    const issues = [
      ...validateInput(current.original, 'original'),
      ...validateInput(current.candidate, 'candidate'),
    ];
    if (issues.length > 0) {
      setError({ code: issues[0].code, message: issueMessage(issues[0]) });
      return;
    }
    if (!candidateProvidedRef.current) {
      setError({
        code: 'MISSING_CANDIDATE',
        message: describeErrorCode('MISSING_CANDIDATE'),
      });
      return;
    }
    const comparing = beginCompare(current, { isComposing: false });
    if (comparing === current) {
      return;
    }
    setReturningToPrepare(false);
    updateSession(comparing);
    const jobId = (deps.generateJobId ?? defaultGenerateJobId)();
    activeJobRef.current = { jobId, revision: comparing.revision };
    const request: AnalyzeRequest = {
      original: comparing.original,
      candidate: comparing.candidate,
      protections: comparing.protections,
      revision: comparing.revision,
      jobId,
      engineVersion: ENGINE_VERSION,
    };
    let client: DiffWorkerClient;
    try {
      client = ensureClient();
    } catch {
      activeJobRef.current = null;
      updateSession({ ...comparing, phase: 'error' });
      setError({
        code: 'UNSUPPORTED_ENV',
        message: describeErrorCode('UNSUPPORTED_ENV'),
      });
      return;
    }
    // analyze() 本身恒返回 Promise（构造失败以 UNSUPPORTED_ENV 结果兑现，
    // 见 client.ts FIX-T013-03）；此处仍包 try/catch 并接 .catch，作为
    // 纵深防御：任何同步抛错或 Promise 拒绝都进 error 阶段，不卡 comparing。
    let analyzePromise: Promise<AnalyzeResult>;
    try {
      analyzePromise = client.analyze(request);
    } catch {
      activeJobRef.current = null;
      updateSession({ ...comparing, phase: 'error' });
      setError({
        code: 'UNSUPPORTED_ENV',
        message: describeErrorCode('UNSUPPORTED_ENV'),
      });
      return;
    }
    void analyzePromise
      .then((result) => {
        const active = activeJobRef.current;
        if (active === null || active.jobId !== jobId) {
          return; // 已取消或被新一轮比较取代：迟到结果直接丢弃。
        }
        activeJobRef.current = null;
        const latest = sessionRef.current;
        const applied = applyAnalysisResult(latest, result, jobId, {
          isComposing: isComposingRef.current,
        });
        if (!applied.applied) {
          // 结果被丢弃且会话仍在 comparing：没有任何后续动作会再推动
          // 它（activeJob 已清），必须主动离开 comparing，否则会话
          // 永久转圈、只能靠“取消比较”恢复。
          // （FIX-T013-07：原实现直接 return，丢弃分支可卡 comparing。
          // 正常接线下该分支不可达——比较中准备页已卸载、无可输入字段
          // 能开启新组合；此处是纵深防御。）
          if (sessionRef.current.phase === 'comparing') {
            updateSession({ ...sessionRef.current, phase: 'error' });
            setError({
              code: 'COMPOSING',
              message:
                '比较结果到达时输入尚未完成，已保留输入，请重新比较。',
            });
          }
          return;
        }
        updateSession(applied.session);
        if (!result.ok) {
          setError({
            code: result.errorCode,
            message: describeErrorCode(result.errorCode),
          });
        }
      })
      .catch(() => {
        if (activeJobRef.current?.jobId !== jobId) {
          return;
        }
        activeJobRef.current = null;
        if (sessionRef.current.phase === 'comparing') {
          updateSession({ ...sessionRef.current, phase: 'error' });
          setError({
            code: 'UNSUPPORTED_ENV',
            message: describeErrorCode('UNSUPPORTED_ENV'),
          });
        }
      });
  }, [commitOriginalDraft, deps.generateJobId, ensureClient, updateSession]);

  const cancelCompareFlow = useCallback(() => {
    const jobId = activeJobRef.current?.jobId;
    if (jobId !== undefined) {
      try {
        clientRef.current?.cancel(jobId);
      } catch {
        // 取消失败不影响回到准备页。
      }
    }
    activeJobRef.current = null;
    const next = cancelCompare(sessionRef.current);
    if (next !== sessionRef.current) {
      updateSession(next);
    }
  }, [updateSession]);

  const setCandidate = useCallback(
    (text: string) => {
      const current = sessionRef.current;
      if (text === current.candidate) {
        if (!candidateProvidedRef.current) {
          candidateProvidedRef.current = true;
          setCandidateProvided(true);
        }
        return;
      }
      candidateProvidedRef.current = true;
      setCandidateProvided(true);
      updateSession(
        changeCandidate(current, text, current.revision + 1),
      );
    },
    [updateSession],
  );

  const setProtections = useCallback(
    (protections: ProtectedRange[]) => {
      if (!commitOriginalDraft()) {
        return;
      }
      const current = sessionRef.current;
      updateSession(
        changeProtections(current, protections, current.revision + 1),
      );
    },
    [commitOriginalDraft, updateSession],
  );

  const setGoalState = useCallback((next: string) => {
    goalRef.current = next;
    setGoal(next);
  }, []);

  const importFile = useCallback(
    async (file: File, field: 'original' | 'candidate') => {
      const read = await readTextFile(file);
      if (!read.ok) {
        setError({
          code: read.issueCode,
          message: describeErrorCode(read.issueCode),
        });
        return;
      }
      const issues = validateInput(read.text, field);
      if (issues.length > 0) {
        setError({ code: issues[0].code, message: issueMessage(issues[0]) });
        return;
      }
      if (field === 'original') {
        // 导入新原稿即一次原稿变化：先确认会丢失的内容，再提交。
        draftRef.current = read.text;
        setOriginalDraft(read.text);
        if (!commitOriginalDraft()) {
          return;
        }
      } else {
        const current = sessionRef.current;
        candidateProvidedRef.current = true;
        setCandidateProvided(true);
        updateSession(
          changeCandidate(current, read.text, current.revision + 1),
        );
      }
      setError(null);
    },
    [commitOriginalDraft, updateSession],
  );

  const decide = useCallback(
    (hunkId: string, decision: 'accepted' | 'rejected') => {
      const current = sessionRef.current;
      const analysis = current.analysis;
      if (analysis === null) {
        return;
      }
      const result = setDecision(
        current,
        analysis.analysisId,
        hunkId,
        decision,
      );
      if (!result.ok) {
        setError({
          code: result.errorCode,
          message: describeErrorCode(result.errorCode),
        });
        return;
      }
      if (result.session !== current) {
        updateSession(result.session);
      }
    },
    [updateSession],
  );

  const keepRemainingFlow = useCallback(() => {
    const current = sessionRef.current;
    const analysis = current.analysis;
    if (analysis === null) {
      return;
    }
    const result = keepRemaining(current, analysis.analysisId);
    if (!result.ok) {
      setError({
        code: result.errorCode,
        message: describeErrorCode(result.errorCode),
      });
      return;
    }
    if (result.session !== current) {
      updateSession(result.session);
    }
  }, [updateSession]);

  const backToProtections = useCallback(() => {
    // error 阶段经此返回准备页时，旧错误横幅一并清除（T013 注记）；
    // 否则横幅会残留在准备页顶部，与当前页无关。
    setError(null);
    setReturningToPrepare(true);
  }, []);

  const backToReview = useCallback(() => {
    // 只清 UI 状态：session.analysis 与决定原样保留。调用方
    // （EditPactApp）只在 analysis 仍存在时渲染本入口；保护或原稿
    // 一旦改动，reducer 已清空 analysis，入口随之消失，不会误回。
    setReturningToPrepare(false);
  }, []);

  /**
   * 待审清零后调用 compose 生成成稿；生成前复核三个标识，等待
   * 期间输入或决定变化则丢弃结果。成稿与回执一起缓存。
   */
  useEffect(() => {
    if (session.phase !== 'review' || session.analysis === null) {
      return;
    }
    const counts = countHunks(session.analysis.hunks);
    if (counts.pending > 0) {
      return;
    }
    const cached = composeResultRef.current;
    if (
      cached !== null &&
      cached.analysisId === session.analysis.analysisId &&
      cached.revision === session.revision &&
      cached.decisionRevision === session.decisionRevision
    ) {
      return;
    }
    let cancelled = false;
    const snapshot = session;
    void compose(snapshot).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setError({
          code: result.errorCode,
          message: describeErrorCode(result.errorCode),
        });
        return;
      }
      const current = sessionRef.current;
      if (
        result.analysisId !== current.analysis?.analysisId ||
        result.revision !== current.revision ||
        result.decisionRevision !== current.decisionRevision
      ) {
        return; // 等待期间输入或决定已变：丢弃旧结果。
      }
      composeResultRef.current = result;
      setComposeResult(result);
      try {
        setReceipt(makeReceipt(current, result));
      } catch (error) {
        if (error instanceof ReceiptError) {
          setError({
            code: error.errorCode,
            message: describeErrorCode(error.errorCode),
          });
        }
        setReceipt(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // 卸载时终止 Worker。
  useEffect(
    () => () => {
      try {
        clientRef.current?.dispose();
      } catch {
        // 卸载时释放失败不影响页面。
      }
      clientRef.current = null;
    },
    [],
  );

  /**
   * 改稿说明文本（FR03）：从用户当前看到的内容生成——修改目标、
   * 当前原稿草稿、草稿中显示为已选的保护范围。保护范围须与草稿段落
   * 的 id/起止三者一致才算“当前显示为已选”（与 PreparePanel 的
   * 选中判定同一口径）；原稿改动后坐标已变、未再选中的陈旧保护
   * 不进入说明。说明生成是纯字符串拼接，不读任何内部标识。
   */
  const draftParagraphs = splitParagraphs(originalDraft);
  const visibleProtections = session.protections.filter((prot) =>
    draftParagraphs.some(
      (p) =>
        p.id === prot.paragraphId &&
        p.start === prot.start &&
        p.end === prot.end,
    ),
  );
  const instructionText = buildInstructionText({
    goal,
    original: originalDraft,
    protections: visibleProtections,
  });

  /** 显示/复制/下载/回执前复核：缓存结果必须与当前 session 三标识一致。 */
  const verifiedResult = useCallback((): ComposeSuccess | null => {
    const cached = composeResultRef.current;
    const current = sessionRef.current;
    if (
      cached === null ||
      current.analysis === null ||
      cached.analysisId !== current.analysis.analysisId ||
      cached.revision !== current.revision ||
      cached.decisionRevision !== current.decisionRevision
    ) {
      return null;
    }
    return cached;
  }, []);

  const copyResult = useCallback(async () => {
    const result = verifiedResult();
    if (result === null) {
      return;
    }
    const ok = await copyToClipboard(result.text, deps.clipboard);
    setCopyState(ok ? 'copied' : 'failed');
  }, [deps.clipboard, verifiedResult]);

  /**
   * 复制改稿说明（FR03，项目书 §4 第 3 步）：只复制上面 instructionText
   * 的文本，经既有剪贴板路径，不发送任何内容、不产生网络请求。
   */
  const copyInstruction = useCallback(async () => {
    const ok = await copyToClipboard(instructionText, deps.clipboard);
    setInstructionCopyState(ok ? 'copied' : 'failed');
  }, [deps.clipboard, instructionText]);

  const downloadResult = useCallback(() => {
    const result = verifiedResult();
    if (result === null) {
      return;
    }
    downloadBlob(exportText(result.text), 'edit-pact-result.txt');
  }, [verifiedResult]);

  const downloadReceipt = useCallback(() => {
    const result = verifiedResult();
    const current = sessionRef.current;
    if (result === null) {
      return;
    }
    let receiptToDownload = receipt;
    if (
      receiptToDownload === null ||
      receiptToDownload.analysisId !== result.analysisId ||
      receiptToDownload.revision !== current.revision ||
      receiptToDownload.decisionRevision !== current.decisionRevision
    ) {
      try {
        receiptToDownload = makeReceipt(current, result);
        setReceipt(receiptToDownload);
      } catch (error) {
        if (error instanceof ReceiptError) {
          setError({
            code: error.errorCode,
            message: describeErrorCode(error.errorCode),
          });
        }
        return;
      }
    }
    downloadBlob(
      new Blob([JSON.stringify(receiptToDownload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
      'edit-pact-receipt.json',
    );
  }, [receipt, verifiedResult]);

  const clear = useCallback(() => {
    const current = sessionRef.current;
    const hasContent =
      current.original !== '' ||
      current.candidate !== '' ||
      current.protections.length > 0 ||
      current.analysis !== null ||
      goalRef.current !== '';
    if (hasContent) {
      const ok = confirmFn(
        '确定要清空本次全部内容吗？清空后回到空状态，正在进行的比较也会终止。',
      );
      if (!ok) {
        return;
      }
    }
    activeJobRef.current = null;
    try {
      clientRef.current?.dispose();
    } catch {
      // 清空时终止 Worker 失败不影响回到空状态。
    }
    clientRef.current = null;
    updateSession(clearSession(current));
    draftRef.current = '';
    setOriginalDraft('');
    goalRef.current = '';
    setGoal('');
    candidateProvidedRef.current = false;
    setCandidateProvided(false);
    setReturningToPrepare(false);
    setError(null);
    setCopyState('idle');
    setInstructionCopyState('idle');
  }, [confirmFn, updateSession]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const onCompositionStart = useCallback(() => {
    isComposingRef.current = true;
    setIsComposing(true);
  }, []);

  const onCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    setIsComposing(false);
  }, []);

  const hasContent =
    session.original !== '' ||
    session.candidate !== '' ||
    session.protections.length > 0 ||
    session.analysis !== null ||
    goal !== '';

  const canCompare =
    session.phase !== 'comparing' &&
    !isComposing &&
    canonicalize(originalDraft).length > 0 &&
    validateInput(originalDraft, 'original').filter(
      (issue) => issue.code !== 'EMPTY_ORIGINAL',
    ).length === 0 &&
    candidateProvided;

  return {
    state: {
      session,
      originalDraft,
      goal,
      candidateProvided,
      isComposing,
      composeResult,
      receipt,
      error,
      copyState,
      instructionText,
      instructionCopyState,
      returningToPrepare,
      hasContent,
    },
    actions: {
      setOriginalDraft: setDraft,
      commitOriginalDraft,
      setCandidate,
      setGoal: setGoalState,
      setProtections,
      importOriginalFile: (file: File) => importFile(file, 'original'),
      importCandidateFile: (file: File) => importFile(file, 'candidate'),
      beginCompare: beginCompareFlow,
      cancelCompare: cancelCompareFlow,
      retryCompare: beginCompareFlow,
      decide,
      keepRemaining: keepRemainingFlow,
      backToProtections,
      backToReview,
      copyResult,
      copyInstruction,
      downloadResult,
      downloadReceipt,
      clear,
      dismissError,
      onCompositionStart,
      onCompositionEnd,
    },
    // 供面板判断“开始比较”是否可用（不在 state 内，避免重复渲染源）。
    canCompare,
    compareBlockedReason: canCompare
      ? null
      : session.phase === 'comparing'
        ? '正在比较，请稍候。'
        : isComposing
          ? '输入法组合输入尚未结束，请先完成输入。'
          : canonicalize(originalDraft).length === 0
            ? '请先粘贴原稿。'
            : validateInput(originalDraft, 'original').filter(
                (issue) => issue.code !== 'EMPTY_ORIGINAL',
              ).length > 0
              ? '原稿有问题，请按提示修正后再比较。'
              : !candidateProvided
                ? '请先粘贴改稿。'
                : null,
  };
}
