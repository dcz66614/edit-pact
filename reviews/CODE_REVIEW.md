# P012-T013 独立源码与交付预审：源码审查报告

- **任务**：P012-T013（独立源码与交付预审），PLAN §7，预算 3 h
- **审查方**：独立审查者（与 T001–T012 构建者不同视角）。本报告只认自己读到的
  代码、自己跑出来的命令和自己写的探针；构建者的自评（各任务交接中的“已验证”
  结论）一律只当作待核对的断言，不当作证据。
- **基线**：T012 提交后版本（T001–T012 全部完成；FIX-T010-01 已修复 F07 金标准）
- **审查时间**：2026-11-05 21:06–21:25 GMT
- **环境**：Node v24.22.1，npm 10.9.4，Playwright 1.64.1 / Chromium 156.0.8078.4
  （见 `~/workspace/evidence/P012/T013/environment.md`）
- **禁止项遵守情况**：未改任何实现与测试。开工前拍全部第一方文件 SHA-256 快照
  （133 个文件），收工后重算：唯一差异是 `tests/performance/results.json`
  （benchmark 每次运行重写的测量结果，仅时长数字变化；见 environment.md）。
  审查中写的一次性探针 `tests/unit/__t013-probe.test.ts`（8 个）跑完即删，
  已确认不存在。`git diff --exit-code` 不可用（工作区无 .git），
  以前后快照 diff 作为等效未修改证明。

## 结论（先说）

**未通过：发现 3 个 P1、8 个 P2。P0 为零。**

- 3 个 P1 均未解决，按任务卡完成定义（未解决 P0/P1 为零）本轮**不能标通过**，
  须另派修复会话处理（修复后重新核对最终实际文件与相关回归；审查者保持独立）。
- P1 清单：
  - **FINDING-T013-01**：FR03“生成可选改稿说明”（P1）未实现，且无删减记录。
  - **FINDING-T013-02**：`npm run verify` 脚本缺失，任务卡与 T014 的验收命令跑不起来。
  - **FINDING-T013-03**：Worker 构造失败时 `DiffWorkerClient.analyze()` 同步抛错，
    应用无错误面，会话卡在比较中转圈。
- 其余核心不变量经本轮独立复核全部成立：保护冲突、合成、重建、陈旧批准、
  待审导出、Worker 迟到/取消/超时、零外部请求、无存储残留、回执无正文。
  9 条 verify 子命令我亲自按 §10 顺序跑过，全部 exit 0（见“验收命令”一节）。
- **不只写“整体良好”**：下面逐文件阅读清单、逐项问题（含复现步骤、位置、
  严重级别、是否阻断）与已验证通过的部分。

## 验收命令（我亲自跑的真实结果）

任务卡写 `npm run verify` + `git diff --exit-code`，两条都跑不起来：

```
$ npm run verify
npm error Missing script: "verify"
$ git status
fatal: not a git repository (or any parent up to mount point /home)
```

`verify` 缺失即 FINDING-T013-02。按实施计划 §10 固定顺序，我手动串行跑了
9 条子命令（两轮；第二轮逐条记真实退出码）：

| 子命令 | 结果 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run fixtures:check` | 25/25 passed |
| `npm run test` | 268/268 passed（14 个文件） |
| `npm run test:invariants` | 41/41 passed |
| `npm run build` | exit 0（83 模块；dist 产物哈希见 environment.md） |
| `npm run test:e2e` | 17/17 passed |
| `npm run test:privacy` | 3/3 passed |
| `npm run benchmark` | PASS（P50=144.0 ms，P95=226.7 ms，max=285.3 ms，预算 500 ms；第二轮另一次运行 P95=295.4 ms，max=525.1 ms——525.1 ms 是第 30 个样本（最大值），P95 取第 29 个值仍在预算内，按 §12.1 口径 PASS，抖动如实记录） |
| `npm run evaluation:check` | PASS（22 checks） |

完整输出见 `~/workspace/evidence/P012/T013/verify-subcommands.log` 与
`verify-exit-codes.txt`。注意：第一轮日志里 `EXIT:$?` 取自 `| tail` 管道，
不代表 npm 退出码；结论以第二轮真实退出码与各工具自报的通过行数为准，
已在 evidence.md 中注明。

## 逐文件实际阅读清单

全部第一方源码（24 个）与全部脚本（7 个）逐行读过；测试文件按测试名清单
核对覆盖（见 TRACEABILITY_REVIEW.md）；fixture 与规格逐项核对。

| 文件 | 阅读结论 |
|---|---|
| `src/domain/types.ts` | 与项目书 §9.1/§9.2 一致；8 个 ErrorCode、常量（12000/200/100 KiB/2048/800/1500）与 §8 一致。无问题。 |
| `src/domain/schema.ts` | Zod `.strict()` 镜像与 §9 一致；`sha256Hex` 只用 Web Crypto，无同步替代；`buildAnalysisIdPayload` 字段顺序与保护排序与 §9.1 一致。无问题。 |
| `src/core/text.ts` | 唯一规范化 CRLF/CR→LF；不成对 surrogate 判定与 oracle 正则同义；限制按规范化后计量。无问题。 |
| `src/core/tokenize.ts` | grapheme 切分 + UTF-16 坐标；无 Segmenter 时抛 `SegmenterUnavailableError`，不退化。无问题。 |
| `src/core/diff.ts` | grapheme token + jsdiff `diffArrays` 严格相等；偏移只按 token 文本长度累计；连续非相等项合并为原子块；`undefined` 原样返回。jsdiff 超时语义经 node 直接调用独立核对：'a'×3000 vs 'b'×3000 返回 `undefined`。无问题。 |
| `src/core/analyze.ts` | 请求结构校验 → Web Crypto 检查 → 输入限制 → diff → classifyHunks → 哈希/analysisId；失败映射与契约一致；不修改传入 request。无问题。 |
| `src/core/guards.ts` | 冲突公式与 §8.3 逐字一致（非空 `a<e && b>s`；纯插入 `s<=a<=e` 两端拦截）；先验证区间/oldText/升序/不交叠再分类。无问题。 |
| `src/core/compose.ts` | 8 步检查链完整：Web Crypto → analysis/版本/保护一致 → 双哈希重查 → analysisId 重查 → classifyHunks 重算 + stored conflicts/decision 一致性 → 重建改稿不变量 → pending 检查 → 合成 + 逐位置保护映射核对。无部分成稿。无问题。 |
| `src/core/reducer.ts` | setDecision/keepRemaining 绑定当前 analysis；decisionRevision 只在实际改变时 +1；change* 要求严格递增 revision；beginCompare 清空旧分析（T006 已接受偏差，见 P2-05 的衍生问题）；cancelCompare 只在 comparing 生效；applyAnalysisResult 复制 Analysis 与 Hunk 对象（conflicts 数组共享引用，但全仓库无原地修改，见核查）。无 P0/P1。 |
| `src/core/receipt.ts` | 三标识 + 无 pending + 冲突/决定一致性复核；ReviewReceiptSchema 再校验；不含正文。无问题。 |
| `src/workers/client.ts` | 单活动 job；超前 job 以 CANCELLED 结束；1500 ms 超时终止并返回 TOO_COMPLEX；迟到结果按 revision/jobId 丢弃；onerror 兜底 TOO_COMPLEX。**但 `createWorker()` 在 Promise 执行器之外，构造失败同步抛错**（FINDING-T013-03）。 |
| `src/workers/diff.worker.ts` | 单活动 jobId 跟踪；取消只做丢弃标记；非契约异常兜底 TOO_COMPLEX；不读存储、不产文案。无问题。 |
| `src/io/files.ts` | 100 KiB 上限、严格 UTF-8、孤立代理检查；`downloadBlob` 点击后 1 秒释放 URL。`file.arrayBuffer()` 失败被标为 INVALID_UTF8（见 P2-11 注记）。 |
| `src/io/clipboard.ts` | 成功返回 true，失败返回 false，不伪造。无问题。 |
| `src/app/useEditPact.ts` | 接线正确：草稿提交、保护变化、Worker 比较、决定、待审清零后 compose、三标识复核、导出前复核、清空、IME 守卫。**三处缺口**：analyze() 调用不在 try 内（FINDING-T013-03）；IME 守卫不盖保护勾选路径（P2-06）；isComposing 丢弃分支可致卡 comparing（P2-07，实际不可达）。 |
| `src/app/EditPactApp.tsx` | 分支顺序 comparing → showPrepare → error → review（T009 已修）；error 阶段有重试/返回入口；导出区只在 composeResult 非 null 时渲染。**缺口**：返回准备页后无保留决定的回审阅路径（P2-05）；error 阶段返回准备页后旧错误横幅残留（P2-12 注记）。 |
| `src/app/CandidatePanel.tsx` | 改稿逐字经 changeCandidate；空改稿合法；开始比较按钮按 canCompare 禁用。无问题。 |
| `src/components/PreparePanel.tsx` | 段落、保护、目标（120 上限）、例子入口、问题提示；陈旧保护不误显示。目标输入截断可切开代理对（P2-08）。 |
| `src/components/ProtectionList.tsx` | 20 段上限、空白段禁用、长段折叠、空格键单次切换。无问题。 |
| `src/components/HunkCard.tsx` | blocked 无接受入口；冲突段号；完整段上下文；长文本折叠。纯换行 Hunk 展示为空白（P2-09）。 |
| `src/components/ReviewPanel.tsx` | 三栏；计数按 conflicts 优先计 blocked；其余保留原文按钮；不拼预览。无问题。 |
| `src/components/ResultPanel.tsx` | 只展示 compose 结果；“已按本轮保护范围合成。”+“文字保留不代表语义或事实已经核查。”双句齐全。无问题。 |
| `src/App.tsx` / `src/main.tsx` | 只挂载 EditPactApp；StrictMode。无问题。 |
| `scripts/check-fixtures.mjs` | 校验器独立于生产 diff；oracle 朴素拼接；保护/决定/expected.txt 规则与 CONTRACT §7 一致。零长 accepted 决定在保护端点处有检查盲点（P2-10）。 |
| `scripts/serve.mjs` | 只绑 127.0.0.1；只读 GET/HEAD；路径穿越防护（normalize + 去 `../` + startsWith 根目录）。500 处理泄露 err.message（仅本机，注记）。 |
| `scripts/gate.mjs` | 依次 typecheck/build/test；任一失败即停。注意：gate 不是计划 §10 的 verify（缺 6 条子命令），不要混用。 |
| `scripts/benchmark.mjs` | 读 results.json、按 P95 判定；与 benchmark.spec.ts 一致。无问题。 |
| `scripts/evaluate.mjs` | 冻结阈值与 PROTOCOL §5 一致（6/7/8 人分母；`THRESHOLD_NUMERATORS`；n>8 回退到 8 人口径，但 PARTICIPANT_IDS 上限 8 人，不可达）。中位数 ceil(n/2) 与协议 §4.3 一致。无问题。 |
| `scripts/evaluation-check.mjs` | 22 项检查；篡改检出已由 T012 机械测试证明。REPORT 状态检查为包含式（T012 已登记，决定性检查是重算核对）。无新问题。 |
| `evaluation/PROTOCOL.md` 等 | 协议 v1.0.0 冻结；observations.csv 仅列头 0 行；results.json 状态 USER_VALUE_NOT_MEASURED 与 REPORT 一致；无编造数据。无问题。 |

## 发现的问题

### FINDING-T013-01（P1，阻断）：FR03“生成可选改稿说明”未实现，且无删减记录

- **位置**：项目书 §6 FR03（P1）、§4 固定流程第 3 步；全仓库无对应实现。
- **规格要求**：FR03“生成可选改稿说明 | P1 | 只复制用户当前看到的内容，
  不自动发送”；§4 第 3 步“可选复制改稿说明，然后自行去现有助手处理；
  应用不发送任何内容。”
- **实际行为**：全仓库 grep `改稿说明|instruction`（除“复制成稿/复制失败”
  外）零命中；没有任何“复制改稿说明”按钮或说明生成逻辑。`goal`（修改目标）
  输入框存在，但它是**只写状态**：只存入 state、参与 `hasContent` 与清空
  判断，从不进入任何输出、复制、回执或 analysisId。用户填了目标，
  没有任何地方能把它（连同保护范围）复制出来给 AI 助手用。
- **复现步骤**：打开应用 → 填原稿、勾保护、填修改目标 → 全页面找
  “复制改稿说明”类入口：无。`goal` 值只在 `useEditPact.state.goal`
  与 `PreparePanel` props 间流转。
- **为什么是 P1**：P1 功能按项目书 §6“不得挤占 P0 的正确性；若排期紧张，
  仅可在规范版本更新、明确记录影响后删减 P1；**不能由施工会话静默跳过**”。
  本项既未实现，也无任何规范版本更新或删减记录，实施计划各任务卡
  （T007/T009）与全部交接中均未提及 FR03，是任务分工间的漏项。
- **修复方向（二选一，由修复会话与 Muse 定）**：
  （a）实现该功能：从当前目标 + 已选保护范围生成一份可复制的改稿说明
  （只含用户当前看到的内容），提供复制按钮，不自动发送；
  （b）按 §6 走规范版本更新 + 明确记录影响，正式删减 FR03。
  无论哪种，修复后重跑 `test` 与 `test:e2e`。

### FINDING-T013-02（P1，阻断）：`npm run verify` 脚本缺失，验收命令跑不起来

- **位置**：`package.json`（无 `verify` 脚本）；实施计划 §10。
- **规格要求**：§10“T001 应建立下列脚本名，后续任务填入真实实现，
  未完成的脚本以非零退出，不能返回空成功”；verify 子命令严格固定为
  typecheck、fixtures:check、test、test:invariants、build、test:e2e、
  test:privacy、benchmark、evaluation:check，按此顺序串行。T013 与 T014
  的验收命令第一条就是 `npm run verify`。
- **实际行为**：`npm run verify` → `npm error Missing script: "verify"`。
  我已按 §10 顺序手动串行跑完 9 条子命令，两轮全部 exit 0（见验收命令表），
  所以工程门禁本身全部通过；缺的是把这条链固化为脚本。
  `scripts/gate.mjs` 不是 verify（只含 typecheck/build/test，缺 6 条）。
- **修复方向**：后续会话新增 `scripts/verify.mjs`（9 条子命令按序串行，
  任一非零立即停止并保留日志；不调用自己、不调用 release:pack/
  release:verify）并在 `package.json` 加 `verify` 脚本；然后跑通
  `npm run verify`。**T013 禁止修改实现与测试，故不在本轮补。**

### FINDING-T013-03（P1，阻断）：Worker 构造失败时同步抛错，应用无错误面

- **位置**：`src/workers/client.ts`（`DiffWorkerClient.analyze`）；
  `src/app/useEditPact.ts`（`beginCompareFlow`）。
- **最小复现**（独立探针，`tests/unit/__t013-probe.test.ts`，已删）：
  ```ts
  const client = new DiffWorkerClient({
    createWorker: () => { throw new Error('Worker construction failed'); },
  });
  client.analyze({ original: 'a', candidate: 'b', protections: [],
    revision: 1, jobId: 'job-x', engineVersion: '1.0.0+jsdiff-9.0.0' });
  // 实际：同步抛出 Error，未返回 Promise。探针输出：
  // PROBE worker-throw: threw= Worker construction failed (script missing)
  //   promiseReturned= false
  ```
- **机制**：`analyze()` 内 `this.createWorker()` 在 `new Promise` 执行器之外；
  `useEditPact.beginCompareFlow` 的 try/catch 只包住 `ensureClient()`（仅
  `new DiffWorkerClient()`，不创建 Worker），`void client.analyze(request)`
  在 try 之外。Worker 构造失败时异常从点击处理函数中直接抛出，
  React 不卸载应用，但会话卡在 `comparing` 转圈、无任何错误提示，
  只能点“取消比较”恢复。
- **触发条件**：dist 的 worker chunk 缺失/损坏，或浏览器禁用 Worker。
  正常 dist 下不触发（T011 已验 worker chunk 存在且工作），但核心流程
  的失败路径应有错误面（项目书 §7.2：失败时保留输入并提示，不产出近似结果）。
- **修复方向**：把 `client.analyze()` 调用包进 try/catch，失败时进 error
  阶段并显示 UNSUPPORTED_ENV/TOO_COMPLEX 文案；或让 client 把构造失败
  转为 `{ ok: false, errorCode: 'TOO_COMPLEX' }` 结果。修复后补一个
  构造失败的单元测试（注入抛错的 factory），重跑 `test` 与 `test:e2e`。

### FINDING-T013-04（P2，登记）：两处手写 F07 单元测试仍是修复前的旧模型

- **位置**：`tests/unit/guards.test.ts:133`、
  `tests/unit/compose.test.ts:317`（及其内联 `F07` 数据）。
- **实际**：两处仍用手写单 Hunk `[9,24)`（oldText
  `第二段甲内容。\n第三段乙内容。`），断言“整块 blocked，成稿等于原稿”。
  但 FIX-T010-01 已把冻结 fixture EP-F07 改为真实 analyze 的 2 个 Hunk
 （h1 `[11,18)` blocked + h2 `[20,21)` pending，接受 h2 后期望输出
  第三段已改）。这两处测试对“任意合法 Hunk”的 classify/compose 行为
  本身仍通过（compose 对单 blocked Hunk 确实返回原稿），错的是**追溯**：
  测试名与内联数据自称 F07，却与冻结金标准矛盾；终审包里会出现
  两份互相矛盾的“F07”陈述。
- **修复方向**：把两处改名并改为真实 2-Hunk 模型，或明确标注为合成单元
  用例并去掉 F07 命名；重跑 `test` 与 `test:invariants`。
  （`tests/unit/diff.test.ts` 的 F07 条目走真实 analyze、只断言不变量，
  与修复后 fixture 一致，无问题。）

### FINDING-T013-05（P2，登记）：返回准备页后无保留决定的回审阅路径

- **位置**：`src/app/EditPactApp.tsx`（`returningToPrepare` 分支）；
  `src/core/reducer.ts`（`beginCompare` 清空旧分析，T006 已接受偏差）。
- **实际**：从审阅页点“返回调整保护”后，唯一回审阅的路是点“开始比较”；
  `beginCompare` 把旧分析清空，新分析全部回到 pending。即使**不改任何保护**，
  全部决定也丢失。文案“不改保护直接重新比较即可”未说明决定会丢。
  项目书 §7.2 只要求“调整保护时旧决定清空”，未要求无改动往返也清空。
- **修复方向**：增加“返回审阅（保留决定）”入口（保护未变时恢复审阅页），
  或把文案改为明确提示“重新比较将清空本轮决定”。重跑 `test:e2e`。

### FINDING-T013-06（P2，登记）：IME 冻结守卫只盖住“开始比较”，不盖保护勾选

- **位置**：`src/app/useEditPact.ts`（`beginCompareFlow` 检查
  `isComposingRef`；`commitOriginalDraft`/`setProtections` 不检查）；
  `src/components/PreparePanel.tsx`（保护复选框直通 `onProtectionsChange`）。
- **实际**：组合输入中点“开始比较”被挡（E2E 已验），但原稿输入框组合
  输入进行中时点保护复选框，会走 `setProtections → commitOriginalDraft`
  冻结半成品草稿。实际靠“失焦时输入法提交组合内容”的浏览器时序兜底，
  该时序未在任何测试中锁定。
- **修复方向**：在 `commitOriginalDraft`/`setProtections` 入口检查
  isComposing（组合中拒绝冻结并提示），或补 E2E 用例锁定该路径行为。
  重跑 `test:e2e`。

### FINDING-T013-07（P2，登记）：isComposing 丢弃分支可让会话卡在 comparing

- **位置**：`src/app/useEditPact.ts`（`beginCompareFlow` 的 `.then` 回调）；
  `src/core/reducer.ts`（`applyAnalysisResult`）。
- **实际**：结果到达时若 `isComposing` 为真，`applyAnalysisResult` 返回
  `applied: false`，会话保持 `comparing`；此时 `activeJobRef` 已清、
  无重试触发，只能点“取消比较”恢复。探针确认：
  `PROBE composing-discard: applied= false phase= comparing`。
- **限定**：经 UI 接线核查，该路径实际不可达——比较中准备页已卸载，
  无可输入字段能开启新的组合输入；`beginCompareFlow` 也挡住了
  组合中开始比较。属纵深防御缺口，非可触发缺陷。
- **修复方向**：丢弃时改为 error/CANCELLED 状态（并提示），或自动重试一次。

### FINDING-T013-08（P2，登记）：目标输入 `slice(0,120)` 可切开代理对

- **位置**：`src/components/PreparePanel.tsx`（`onGoalChange` 的
  `.slice(0, GOAL_MAX_UNITS)`）。
- **实际**：探针确认 `('a'.repeat(119) + '👨‍👩‍👧‍👦').slice(0, 120)`
  产生不成对 surrogate（`hasUnpairedSurrogate= true`）。`goal` 只显示、
  不进入哈希/导出/回执，故仅渲染为替换符，无数据影响。
- **修复方向**：按 code point/grapheme 边界截断。

### FINDING-T013-09（P2，登记）：纯换行 Hunk 的展示为空白

- **位置**：`src/components/HunkCard.tsx`（`ContextParagraph` 与删除/新增文字栏）。
- **实际**：Hunk 恰为 `"\n"`（删除换行、合并两段）时，上下文 changed 片段为空、
  删除文字栏折叠为空白；功能正确（接受即合并段落），仅展示不清。
  探针确认该 Hunk 按 fallback 归属第 1 段（`indices= [0]`）。
- **修复方向**：对空白类 oldText/newText 显示可见标记（如“（换行符）”）。

### FINDING-T013-10（P2，登记）：先前已登记的遗留，复核确认仍未解决

以下均已在 T009/T011/T012 交接或审查中登记，本轮复核确认状态未变，
仍属非阻断，归 T014 或后续处理：

1. 仓库根目录无 LICENSE 文件（MIT 文本属 T014 发布打包补齐项）。
2. `docs/DEPENDENCIES.md` 仍缺 jsdiff 与 jsdom 记录（T014 更新）。
3. 剪贴板失败回退分支未在拒绝授权的上下文中触发（T011 已登记）。
4. 超限文件导入（>100 KiB / 非 UTF-8）未在浏览器中重复测（T009 单元测试覆盖）。
5. Windows NOT_TESTED；Firefox/WebKit、真实拼音输入法未测。
6. 1,500 ms 超时路径用“生产客户端 + 真实浏览器 Worker（仅响应时机被桩）”
   演练（T011 已如实记录方法；若算法预算放宽，应改用真实慢输入重测）。

### FINDING-T013-11（P2，登记）：`check-fixtures` 对零长 accepted 决定的检查盲点

- **位置**：`scripts/check-fixtures.mjs`（`overlaps()` 用严格重叠）。
- **实际**：零长 accepted 决定 `[a,a)` 落在保护起/止点时，`overlaps()` 返回
  false，不报错；但生产 `classifyHunks` 会按 §8.3（纯插入 `s<=a<=e`）判冲突。
  现行 fixture 无此情形（F08 的接受插入 `[13,13)` 在保护 `[0,6)` 外），
  故无 live 影响。
- **修复方向**：决定检查对零长区间用 `s<=a<=e` 判定；重跑 `fixtures:check`。

## 已验证通过的部分（独立复核，非构建者自评）

- **保护不变量**：`fixtures:check` 25/25、`test:invariants` 41/41、
  `test` 268/268 全部通过；T010 的 200 组随机 + 14 反例结论未被推翻，
  本轮未发现新的反例。
- **合成与授权**：compose 的 8 步检查链逐行读过，与 §8.4/§9.2 一致；
  篡改矩阵（改决定/改文本/改区间/改 ID/改保护/改 revision）已有测试覆盖，
  本轮另做哈希逐项核对（见下）。
- **Worker**：迟到/取消/超时三路已有 E2E 覆盖且本轮重跑通过；
  jsdiff 超时语义经 node 直接调用独立核对。
- **隐私**：`test:privacy` 3/3 重跑通过；另做静态扫描——src 内无 innerHTML、
  无 fetch/XHR/WebSocket、无 localStorage/sessionStorage/IndexedDB、
  无 console.*、无 TODO/FIXME；回执无正文（makeReceipt + E2E 导出核对）。
- **性能**：benchmark 两轮 PASS（P95 226.7/295.4 ms，预算 500 ms）。
- **实验**：observations.csv 仅列头 0 行；results.json 状态
  USER_VALUE_NOT_MEASURED 与 REPORT 一致；无编造数据。
- **交接哈希核对**：T009–T012 交接中 43 个完整哈希逐项比对开工前快照，
  仅 `evaluation/results.json` 不一致，原因是其含 `generated_at_utc`
  时间戳（T012 交接已明文说明重跑即变；内容核对一致）。

## 失败回退与后续

- 本轮不修复（任务卡禁止修改实现与测试）。3 个 P1 与 8 个 P2 全部登记在
  `reviews/OPEN_ISSUES.md`（含复现步骤与修复方向）。
- 修复会话须保持审查独立：修完后重新核对最终实际文件与相关回归；
  特别要重跑 `npm run verify`（FINDING-T013-02 修后才存在）、
  `test`、`test:invariants`、`test:e2e`、`fixtures:check`。
- FR03 的修复方向若选“正式删减”，须按项目书 §6 走规范版本更新并明确记录影响，
  不能只改代码或只改测试。

## 交付文件

- `reviews/CODE_REVIEW.md`（本文件）
- `reviews/TRACEABILITY_REVIEW.md`（需求映射）
- `reviews/OPEN_ISSUES.md`（问题登记）
- 交接：`handoffs/P012-T013.md`
- 证据：`~/workspace/evidence/P012/T013/`（`commands.log`、
  `verify-subcommands.log`、`verify-exit-codes.txt`、`environment.md`、
  `evidence.md`、`hashes-before.txt`、`hashes-after.txt`）
