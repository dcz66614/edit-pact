# P012 改稿守约 Edit Pact 实施计划

P012 · Edit Pact · PLAN_VERSION 1.0.0 · 对应 SPEC_VERSION 1.0.0 · 2026-11-05

本计划供 Muse 调度既有免费 Coding Agent。Muse 负责派工、门禁、版本核对与归档；代码、测试脚本、修复、集成和施工文档由新开的独立模型会话完成。本轮只交付规格，以下任务全部是计划任务，不能把命令示例当成已经执行的记录。

## 1 执行目标与不可变约束

目标是在 14 个自然日、约 8 人日工作量与 2 人日缓冲内，交付一个短篇纯文本改稿审阅原型。工程主线是：原稿和保护范围冻结、接收外部改稿、精确比较、越界变更保留原文、人工采纳、从原稿合成成稿。

本项目不调用模型，不读取聊天历史，不接收费 API，不要求 GPU，不建设账号或云端存储。用户实际使用哪个 AI 助手由用户自己决定。施工时使用 Muse 已实测平台，不能臆造平台名称、免费额度或采购新账号。

工程约束：

1. 四份正式规格实体文件齐备且内容一致后才进入施工。
2. 核心契约只以 PROJECT_BOOK.md 第 8–10 节为准；接口改变必须记录规格变更。
3. 原稿、改稿、保护范围任何一项变化，旧接受状态失效。
4. 保护冲突块固定为 blocked 并保留原文，不提供强行接受入口。
5. pending 项不能进入成稿复制或下载，用户可明确选择其余保留原文。
6. 最终文字只能通过 compose 构造，不直接下载 candidate。
7. 所有施工、代码审查、修复、集成任务各自新开会话。
8. 先通过任务门禁再合并；每个文件在同一时刻只有一位写入者。
9. 不接受“模型认为通过”代替真实退出码、日志和演示。
10. 终审在本 P012 立项对话进行，超过 5 轮仍未通过才按工厂规则开启续审。

## 2 两周里程碑与人力预算

每人日按 8 小时计。64 小时是估计值，包含实现、核验、文档与约 8 小时探索评估；其余 16 小时作修复缓冲。免费平台排队与参与者等待时间不算实际工时，但可能影响日历排期；Muse 应记录真实进度。

| 阶段 | 目标时间 | 任务 | 退出门槛 |
| --- | --- | --- | --- |
| S0 规格与环境 | 第 1–2 天 | T001–T002 | 四文件、真实环境、精确依赖、类型和样本契约就绪 |
| S1 核心纵向切片 | 第 3–5 天 | T003–T006 | 命令行测试证明比较、阻断保护改动并正确合成；浏览器集成在 S2 |
| S2 中文工作台 | 第 6–8 天 | T007–T009 | 准备、审阅、导出、清空全流程贯通 |
| S3 独立验证 | 第 9–11 天 | T010–T012 | 工程指标通过；真人结果或未测原因明确 |
| S4 冻结与终审包 | 第 12–14 天 | T013–T014 | 独立审查无 P0/P1，证据和发布哈希可核对 |

第一周同时验证产品风险。Muse 可先准备研究材料并安排已授权参与者在第 6–7 天试用纵向切片，T012 在第二周归并完整结果。真人招募不足不得伪造观测，也不通过多建功能来填补证据。

阶段失败只修复对应阻断项。S1 不能稳定保护原文，不进入美化；S2 核心流程已经清楚可用后，不为少见布局偏差拖延 S3。

## 3 任务依赖与集成顺序

采用依赖表而非只画装饰性的箭头；每个任务的前置条件可直接用于 Muse 任务板。

| TASK_ID | 前置任务 | 可并行分支 | 集成时点 |
| --- | --- | --- | --- |
| T001 | 四份规格齐备 | 无 | 首个基线 |
| T002 | T001 | 无 | 冻结契约与独立样本 |
| T003 | T002 | T007 的展示骨架 | 文本边界可用 |
| T004 | T003、T005 | T006、T007、T008 | 差异和 Worker 组装完整分析 |
| T005 | T002、T003 | T007、T008 | 先交付保护与合成 |
| T006 | T002、T005 | T004、T007、T008 | 授权状态 |
| T007 | T002、T003 | T004–T006、T008 | 准备页 |
| T008 | T002 | T004–T007 | 纯 props 审阅组件 |
| T009 | T004–T008 | 无写同文件任务 | 应用和 I/O 纵向集成 |
| T010 | T009 | T012 的观察准备 | 独立正确性报告 |
| T011 | T010 | T012 | 浏览器、网络和性能 |
| T012 | T009、样本已冻结 | T010–T011 | 评估报告 |
| T013 | T010–T012 | 无修改核心源码任务 | 独立预审 |
| T014 | T013 通过 | 无 | 干净提交冻结与最终复测 |

T005 先交付 classifyHunks；T004 随后只调用该接口，组装带 conflicts 和 blocked/pending 初始状态的完整 Analysis，互不改对方文件。T008 只接收类型化 props 和回调，不提前修改 App。集成由独立集成会话执行，Muse 不亲自 cherry-pick 后修业务冲突。

## 4 工作区与文件归属

建议以一个私有 Git 工作区开始，公开发布需等最终 PASS 及已有发布授权。创建工作树是实施方法，不要求开设新外部账号。

```text
P012-edit-pact/
  PROJECT_BOOK.md
  PROJECT_BOOK.docx
  IMPLEMENTATION_PLAN.md
  IMPLEMENTATION_PLAN.docx
  README.md
  LICENSE
  package.json
  package-lock.json
  src/
    domain/
    core/
    workers/
    io/
    components/
    app/
  tests/
    fixtures/
    unit/
    oracle/
    e2e/
    performance/
  scripts/
  docs/
    ENVIRONMENT.md
    DEPENDENCIES.md
    CONTRACT.md
    TRACEABILITY.md
  evaluation/
  reviews/
  handoffs/
```

运行证据和发布归档放在工作区外的 `evidence/P012/<commit>/` 与 `release/P012/<commit>/`，避免生成日志改变冻结源码。任何被排除的文件必须在清单中说明，不能从源码审查范围悄悄移走第一方代码。

公共文件如 package.json、锁文件、types.ts、全局样式和 App.tsx 由任务表唯一归属。后续需要修改时，Muse 先关闭原写入任务，派发单独变更卡并说明被影响下游；不让并行会话自行“顺手修一下”。

## 5 模型工种与独立性

| 工种 | Muse 从既有清单选择的能力 | 任务 |
| --- | --- | --- |
| 架构与工程基础 | 能执行构建、准确维护类型和依赖 | T001–T002 |
| 文本与状态实现 | 能理解区间、Unicode 与不变量 | T003–T006 |
| 前端交互 | 能按中文规格实现可访问组件 | T007–T009 |
| 独立验证 | 能运行测试并追查失败，未写对应核心模块 | T010–T011 |
| 产品评估 | 能组织匿名记录并按冻结规则计算指标 | T012 |
| 独立审查 | 能逐文件阅读，不依赖构建者自评 | T013 |
| 发布工程 | 能从冻结提交构建、打包与核对哈希 | T014 |

构建者与审查者尽量使用不同模型。若受免费可用性限制只能用同一模型，必须新会话、独立任务包、隐藏构建者“已通过”结论，且由真实运行日志和源码检查支持；在审查报告中登记限制。

## 6 每张任务卡的完整合同

以下共同条款自动并入第 7 节每个任务，不得在派工时遗漏：

- TASK_ID 使用 P012-Txxx；每次修复加 -FIXnn。
- INPUTS 必须包含对应规格版本、基准 Git commit、上游交接文件、允许修改文件和验收命令。不得只发“接着上次写”。
- FORBIDDEN_FILES 默认为 OWNED_FILES 之外的全部文件，特别禁止改另一分支、冻结 fixture 金标准、上游接口、规格和锁文件；任务卡明确列出的例外才可写。
- EXPECTED_EVIDENCE 默认包括完整命令、开始结束时间、环境版本、退出码、通过/失败计数、修改清单、补丁或 commit、已知限制、实际阅读材料。
- DEFINITION_OF_DONE 为任务特定门槛加相关回归通过，代码已在真实 VM 产生，文件内容可审查。
- FAILURE_ROLLBACK 为保留失败日志，不合并任务分支；回到最后一个已验收提交，由 Muse 新建修复会话。不得通过删测试、改期望或降低门槛“恢复通过”。
- 每个任务的普通命令均由 T001 建立为真实 npm scripts。命令不存在是未完成，不能把计划脚本名当证据。
- 未执行的检查写 NOT_RUN，无法测量写 NOT_MEASURED，不填写模拟的通过数量。

交接文件固定为 handoffs/P012-Txxx.md，至少包含：

```text
TASK_ID:
SPEC_VERSION:
BASE_COMMIT:
OBJECTIVE:
INPUTS_READ:
OWNED_FILES:
FILES_CHANGED:
FORBIDDEN_FILES_CHECK:
COMMANDS_EXECUTED:
EXIT_CODES:
RESULTS:
ARTIFACT_PATHS_AND_SHA256:
KNOWN_LIMITATIONS:
OUTPUT_COMMIT:
REVIEW_STATUS:
NEXT_TASK_INPUTS:
```

## 7 原子任务清单

### P012 T001 环境与工程骨架

TASK_ID：P012-T001。预算：4 小时。目标：在真实 VM 建立可复现的最小工程。

输入：四份规格、Muse 当前环境记录、既有免费平台能力矩阵。输出归属：package.json、package-lock.json、Node 版本文件、Vite/TypeScript/Vitest/Playwright 配置、index.html、scripts/serve.mjs、scripts/gate.mjs、docs/ENVIRONMENT.md、docs/DEPENDENCIES.md。初始 app 入口仅保留能渲染的壳，交接后由 T009 接管。

禁止修改：任何业务算法、规格正文和其他项目文件。验收命令：

```bash
node --version
npm --version
npm ci
npm run typecheck
npm run build
npm run serve -- --port 4173
```

预期证据：OS、CPU、可用内存、Node/npm/浏览器精确版本、依赖选择依据、锁文件、首次构建日志、loopback 启动截图。完成定义：构建与类型检查可运行；静态服务只绑定 127.0.0.1，停外网仍可载入本地包。此处不要求业务测试通过。

失败回退：保留空工程基线与环境日志，兼容性问题只更换已核实的受维护版本并重新锁定，不购买服务。

### P012 T002 契约与独立样本

TASK_ID：P012-T002。预算：3 小时。目标：冻结下游可独立实现的接口和 24 组金标准。

输入：T001 commit、项目书第 8–12 节。输出归属：src/domain/types.ts、schema.ts、docs/CONTRACT.md、`tests/fixtures/**`、tests/unit/schema.test.ts、scripts/check-fixtures.mjs。所有 fixture 为人工定义的合成文本，使用项目书的 case.json 契约表达成功、错误或状态预期，正常文字结果另存 expected.txt；同时冻结独立性能样本 EP-P01 和哈希。

禁止修改：package.json 与锁文件；不得从尚未存在的业务实现输出生成金标准。验收命令：

```bash
npm run typecheck
npm run test -- tests/unit/schema.test.ts
npm run fixtures:check
```

预期证据：接口列表、24 组样本清单、至少 4 组手算区间说明、独立样本复核记录、EP-P01 计量说明。完成定义：类型、异步 Web Crypto 哈希、错误码和范围单位完整；analysisId 包含 revision/jobId，A→B→C→B 也不能复用批准；样本能覆盖第 9 节矩阵；不含私人数据；值与保护预期无明显矛盾。

失败回退：冻结为未通过契约，下游不开始。只修正契约或样本歧义，更新影响清单并重新审查。

### P012 T003 文本规范化与分段

TASK_ID：P012-T003。预算：3 小时。目标：给保护与比较提供唯一的文本坐标基础。

输入：T002 契约与换行/Unicode fixtures。输出归属：src/core/text.ts、src/core/tokenize.ts、tests/unit/text.test.ts。

禁止修改：类型、fixture 期望、UI。验收命令：

```bash
npm run test -- tests/unit/text.test.ts
npm run typecheck
```

预期证据：CRLF 转 LF、空白保留、UTF-16 限制、grapheme 到 UTF-16 映射、emoji ZWJ 和组合字符结果。完成定义：只做规定规范化；每个 token 拼回原文；边界单调且正确；无 Segmenter 时明确报错，不退化。

失败回退：T004、T005、T007 不集成坐标逻辑。输入处理和 Unicode 规则由新修复会话更正。

### P012 T004 精确比较与 Worker

TASK_ID：P012-T004。预算：5 小时。目标：将两稿转换成原稿坐标的原子 Hunk，支持取消与预算退出。

输入：T002、T003、T005 交接；jsdiff 官方 API。输出归属：src/core/diff.ts、analyze.ts、src/workers/diff.worker.ts、client.ts、tests/unit/diff.test.ts、tests/unit/worker.test.ts。T004 负责公开 analyze 的完整组装，只调用 T005 的 classifyHunks，不重复实现保护规则。

禁止修改：保护规则、合成器、状态 reducer、fixture。验收命令：

```bash
npm run test -- tests/unit/diff.test.ts tests/unit/worker.test.ts
npm run typecheck
```

预期证据：全应用重建改稿、全保留重建原稿、替换原子性、800 ms 算法预算和 1,500 ms 外部终止路径、迟到 jobId 丢弃。完成定义：undefined 不伪装为空差异；任何补丁 oldText 对应原稿；纯插入/删除/多段替换可解释。

失败回退：终止 Worker 并保留输入；T009 不可绕过比较直接使用改稿。定位性能问题后仅修此分支。

### P012 T005 保护冲突与成稿合成

TASK_ID：P012-T005。预算：6 小时。目标：实现本项目最重要的文本保留保证。

输入：T002、T003，使用固定 RawHunk 测试数据，在 T004 之前完成。输出归属：src/core/guards.ts、compose.ts、tests/unit/guards.test.ts、tests/unit/compose.test.ts。按冻结签名交付 classifyHunks，将 RawHunk 验证并分类为 blocked 或 pending。

禁止修改：diff.ts、reducer.ts、UI、golden fixture。验收命令：

```bash
npm run test -- tests/unit/guards.test.ts tests/unit/compose.test.ts
npm run typecheck
```

预期证据：保护段删除、跨段替换、区间端点插入、重复句坐标映射、陈旧 analysisId、oldText 错配、pending 导出。完成定义：合成只读取原稿和合法 accepted；逐位置验证保护映射；任何非法状态均返回错误而不是部分成稿。

失败回退：禁用成稿出口，交新独立会话复现。不可通过扩大“非阻断”范围放行文字错误。

### P012 T006 授权状态与撤回

TASK_ID：P012-T006。预算：4 小时。目标：把输入版本和每次批准绑定在一起。

输入：T002、T005。输出归属：src/core/reducer.ts、tests/unit/reducer.test.ts。

禁止修改：上游契约、比较器、合成器。验收命令：

```bash
npm run test -- tests/unit/reducer.test.ts
npm run typecheck
```

预期证据：输入或保护变化后批准失效、blocked 不能 accepted、其余保留原文、清空、过时 worker 响应、同一分析内先接受后撤回时旧 compose 结果失效。完成定义：纯状态转换可复现；每次实际决定改变增加 decisionRevision 并清预览，使用不可变更新；不存在 accepted 绕过冲突的路径；IME composition 期间不允许冻结。

失败回退：回到最后一次有效 session，清除未验收状态；在新会话中修复状态机并跑关联回归。

### P012 T007 原稿与保护设置界面

TASK_ID：P012-T007。预算：4 小时。目标：用户能在短时间内完成一轮保护设置。

输入：T002、T003，项目书第 7 节。输出归属：src/components/PreparePanel.tsx、ProtectionList.tsx、prepare.css，以及对应组件测试。

禁止修改：App.tsx、全局配置、核心规则。验收命令：

```bash
npm run test -- tests/unit/prepare-ui.test.tsx
npm run typecheck
```

预期证据：1,280 × 800 界面截图、键盘选择记录、20 段上限、空白段禁用与长段全文展开。完成定义：通过 props 回传范围；不自行猜测敏感信息；明确段落含义和刷新丢失提示。

失败回退：保留纯文本输入和显式段落列表，不加入复杂编辑器替代基础问题。

### P012 T008 审阅与成稿展示组件

TASK_ID：P012-T008。预算：4 小时。目标：让变化、保护原因和待审状态一眼可读。

输入：T002 类型、固定 UI 样本、项目书第 7 节。输出归属：src/components/ReviewPanel.tsx、HunkCard.tsx、ResultPanel.tsx、review.css，以及对应组件测试。

禁止修改：核心算法、App.tsx、他人样式文件。验收命令：

```bash
npm run test -- tests/unit/review-ui.test.tsx
npm run typecheck
```

预期证据：正常、保护冲突、纯插入、长改动、待审与无差异状态截图。完成定义：blocked 不显示接受入口；“其余保留原文”语义明确；不显示真实性评分或伪百分比进度；键盘可操作。

失败回退：先保留完整文本与按钮，延后非必要动画。不能通过隐藏无法处理的 Hunk 减少界面复杂度。

### P012 T009 本地输入输出与应用集成

TASK_ID：P012-T009。预算：5 小时。目标：打通准备、比较、审阅、导出和清空。

输入：T004–T008 已验收提交。输出归属：`src/io/**`、src/core/receipt.ts、`src/app/**`、src/main.tsx、src/styles/base.css、tests/unit/io.test.ts、receipt.test.ts、integration.test.ts。

禁止修改：已验收核心实现与冻结契约；有问题时提交上游修复卡，不在集成会话复制另一个算法。验收命令：

```bash
npm run test -- tests/unit/io.test.ts tests/unit/receipt.test.ts tests/unit/integration.test.ts
npm run typecheck
npm run build
```

预期证据：第 11 节样例完整录屏或连续截图、TXT 下载内容、剪贴板回退、无正文 JSON 回执、清空后的空状态。完成定义：只有 compose 的成功结果可导出；显示/复制/下载/回执前复核 analysisId、revision、decisionRevision；TXT 与预览相同；文件超限不覆盖旧输入；Blob URL 可释放。

失败回退：撤销本次集成提交，保留各已验收分支；由新的集成修复会话处理最小接口问题。

### P012 T010 独立正确性与性质验证

TASK_ID：P012-T010。预算：5 小时。目标：从实现之外验证保护和合成不变量。

输入：T009 commit、冻结 fixtures、项目书算法规格，不提供构建者“算法正确”的自评。输出归属：`tests/oracle/**`、tests/unit/invariants.test.ts、reviews/CORRECTNESS_REVIEW.md。

禁止修改：生产源码、金标准期望、依赖版本。验收命令：

```bash
npm run fixtures:check
npm run test:invariants
npm run test
```

预期证据：24 个 fixture 逐项结果；固定种子 20261105 的 200 组有界随机合法补丁；独立自写的简单拼接 oracle；保护、重建、陈旧批准的反例。oracle 不调用生产 compose 或 guards 来生成预期。

完成定义：核心不变量全部通过；发现的问题附最小复现输入。失败回退：相关实现任务开 FIX 卡，保留独立失败测试，修复后复跑关联与全量核心测试。

### P012 T011 浏览器隐私与性能验证

TASK_ID：P012-T011。预算：6 小时。目标：确认用户路径在真实 VM 上成立。

输入：T010 通过版本。输出归属：`tests/e2e/**`、`tests/performance/**`、scripts/benchmark.mjs、reviews/PRIVACY_REVIEW.md、docs/COMPATIBILITY.md。实际日志写工作区外 evidence 目录。

禁止修改：业务源码和 fixtures。验收命令：

```bash
npm run build
npm run test:e2e
npm run test:privacy
npm run benchmark
```

预期证据：生产包 E2E、网络请求列表、Storage 检查、取消与迟到任务场景、EP-P01 的 5 次预热与 30 次正式测量、1,500 ms Worker 预算与 1,800 ms UI 恢复上限的独立记录、1,280 × 800 与 390 px 截图、手动键盘/IME检查。

完成定义：核心操作零外部请求；在禁止外网但允许 loopback 的新浏览器上下文中能冷启动；保护和成稿结果一致；性能达到预算。不要把 Playwright setOffline 后靠旧页面缓存操作作为唯一离线证据。

失败回退：按对应模块派修复。Windows 无实测条件时标 NOT_TESTED，不伪造跨平台通过；当前 VM 必须真实通过。

### P012 T012 产品实验与价值报告

TASK_ID：P012-T012。预算：8 小时。目标：比较保护契约与用户真实现用方法的收益和负担。

输入：项目书第 12 节、T009 可运行原型、预注册匿名任务与指标。输出归属：evaluation/PROTOCOL.md、CONSENT.md、observations.csv、results.json、REPORT.md、scripts/evaluate.mjs、scripts/evaluation-check.mjs。

禁止修改：产品行为、评分规则、事后改变继续门槛。不得使用 Agent 模拟的人物当真人结果。验收命令：

```bash
npm run evaluate -- --input evaluation/observations.csv
npm run evaluation:check
```

预期证据：参与人数与招募条件、AB/BA 顺序、基线说明、匿名原始观察、失败任务、缺失数据、总时间、额外设置时间、未经授权采纳数、继续使用意愿。受测内容均合成或获同意脱敏，报告不含个人姓名或真实机密。

完成定义：至少 6 人则形成探索结果；未招到时保留空数据和 USER_VALUE_NOT_MEASURED，明确原因及补测方案。无真人不阻挡原型工程预审，但禁止效果宣传。已测且无收益时写 PRODUCT_VALUE_FAIL，并暂停扩展。

失败回退：保留原协议和数据，重新设计更轻工作流需要新规格变更，不“修饰”结果。

### P012 T013 独立源码与交付预审

TASK_ID：P012-T013。预算：3 小时。目标：发现现有测试仍可能漏掉的核心缺陷。

输入：T010–T012 结果、当前全部第一方源码、关键配置与本版规格。输出归属：reviews/CODE_REVIEW.md、reviews/TRACEABILITY_REVIEW.md、reviews/OPEN_ISSUES.md。

禁止修改：任何实现与测试。验收命令：

```bash
npm run verify
git diff --exit-code
```

预期证据：逐文件实际阅读清单、需求映射、问题位置、复现步骤、严重级别、是否阻断。重点检查 compose 出口、保护边界、版本失效、Worker 迟到、存储与日志、用户文案边界、依赖许可。

完成定义：未解决 P0/P1 为零，P2 登记；不能只写“整体良好”。失败回退：Muse 分派新修复会话，审查者保持独立；修复后重新核对最终实际文件与相关回归。

### P012 T014 版本冻结与终审包

TASK_ID：P012-T014。预算：4 小时。目标：让 ChatGPT 能读到与实际发布包一致的完整证据。

输入：T013 通过版本、四份规格、许可清单、所有真实日志。输出归属：scripts/package-release.mjs、scripts/hash-release.mjs、scripts/build-review-packs.mjs、README.md、docs/RELEASE_GUIDE.md；归档产物写工作区外。

禁止修改：核心业务模块和验收门槛。发布脚本先单独验收并提交，再冻结最终 commit C；随后在 C 的干净检出运行第 10 节完整门禁。验收命令：

```bash
npm ci
npm run verify
npm run release:pack
npm run release:verify
```

预期证据：C、干净状态、source.zip、dist.zip、SOURCE_MANIFEST.csv、SHA256SUMS.txt、环境/构建/测试/E2E/网络/性能日志、完整源码审查包、覆盖清单、无敏感数据演示和 Drive 对应列表。

完成定义：每个必需文件存在且可读取；包内文件与清单一致；日志对应 C；本项目仍为 READY_FOR_FINAL_REVIEW，不擅自标 ACCEPTED。失败回退：保持未发布状态，只修复打包或补证；源代码任何变化均生成新冻结提交并重新执行受影响门禁。

## 8 关键契约补全清单

T002 必须把项目书第 9 节完整公共类型落到实际代码，不能留在 any 或未定义占位符。以下为核对摘要，字段和失败行为以项目书冻结定义为准：

- Paragraph：id、start、end、text、isBlank；end 不含段末 LF。
- InputIssue：code、field、limit、actual；错误消息不拼入私人全文。
- AnalyzeRequest：original、candidate、protections、revision、jobId、engineVersion。
- AnalyzeResult：ok=true 与 Analysis；或 ok=false、errorCode、revision、jobId。setDecision 使用 DecisionResult，失败不改变 session。
- ComposeSuccess：ok=true、text、outputHash、protectedMappings、analysisId、revision、decisionRevision；compose 使用 Web Crypto，返回 Promise，导出前再次检查输入轮次和决定版本。
- ProtectedMapping：protectionId、sourceStart、sourceEnd、outputStart、outputEnd。
- ReviewReceipt：仅版本、哈希、区间、状态和计数，不含正文或手写修改目标；makeReceipt 接收当前 session 与 ComposeSuccess，三个版本标识均需一致，防止旧成稿配新决定。
- UI 回调：onProtectionChange、onCompare、onDecision、onKeepRemaining、onClear；组件不直接写 session。
- Worker 协议：一个活动 job；取消终止 Worker，下次重建；所有结果先验证 revision/jobId。

修改目标不参与保护范围计算，也不会被软件解释为开放式约束。用户写“语气更温和”只生成可选说明，不能因此得到“语气要求已验证”的提示。

## 9 验收矩阵与可复现样本

24 组 fixture 的命名固定为 EP-F01 至 EP-F24。每组以 case.json 声明种类、动作序列和预期，只有 hasText=true 的成功合成案例要求 expected.txt。空结果与无结果必须区分。工作流案例写明每一步 revision/jobId、事件和最终状态，不能只用两篇静态文本表达迟到响应。性能 EP-P01 单列，不挤占这 24 组。工程用例与真人任务集分别标记，避免对测过的工程样例做用户练习。

| 范围 | 高价值场景 | 需求映射 | 证据 |
| --- | --- | --- | --- |
| F01–F04 | 正常局部修改、相同文本、无保护、全部保护 | FR01–FR06 | 逐项输出和合成 |
| F05–F08 | 日期/人数修改、保护段删除、跨区替换、边界插入 | FR05、FR09 | 冲突原因与最终原文 |
| F09–F12 | 重复段、段落重排、多行替换、空改稿 | FR04–FR09 | 原稿位置映射 |
| F13–F16 | CRLF、连续空格、emoji ZWJ、组合字符 | FR01、FR04 | 规范化与完整 token |
| F17–F20 | 原稿变化、改稿变化、保护变化、待审导出 | FR06–FR10 | 旧批准失效 |
| F21–F24 | 超限、超时取消、恶意 HTML、清空后迟到结果 | FR01、FR12–FR14 | 可恢复且无旧结果 |

额外 E2E 必须检查：1,280 × 800 完整流程、390 px 可操作、键盘、composition 结束前不能冻结、下载与预览一致、剪贴板失败回退、不含正文回执、冷启动禁止外网、页面清空后存储无正文，以及人为延迟 Web Crypto 返回时撤回接受决定，旧结果不得显示、复制、下载或配上新回执。

性质测试的预期不是重新运行同一生产函数。独立 oracle 以简短原稿、明确合法替换区间和朴素拼接计算结果；随机种子固定，失败必须打印最小输入到合成测试日志，私人输入永远不进入日志。

## 10 固定命令和证据要求

T001 应建立下列脚本名，后续任务填入真实实现，未完成的脚本以非零退出，不能返回空成功。

```bash
npm ci
npm run typecheck
npm run fixtures:check
npm run test
npm run test:invariants
npm run build
npm run test:e2e
npm run test:privacy
npm run benchmark
npm run evaluation:check
npm run verify
npm run release:pack
npm run release:verify
```

verify 的子命令严格固定为 typecheck、fixtures:check、test、test:invariants、build、test:e2e、test:privacy、benchmark、evaluation:check，按此顺序串行运行。npm ci 在外层运行；verify 不调用自己、不调用 release:pack 或 release:verify。任一工程命令非零立即停止并保留日志。T014 在冻结后顺序执行 verify、release:pack、release:verify，T013 无需依赖尚未实现的发布脚本。不能用跨平台不一致的 shell 连锁或忽略退出码包装“通过”。

evaluation:check 验证协议、数据与状态说明是否完整一致。合法 USER_VALUE_NOT_MEASURED 或已如实报告的 PRODUCT_VALUE_FAIL 不使工程门禁失败，但必须保留产品结论。缺失说明、伪造观测或数据矛盾返回非零。

只运行用户包时：

```bash
node scripts/serve.mjs --root dist --port 4173
```

浏览器访问 http://127.0.0.1:4173 。README 要分别给 Windows PowerShell 和实际 VM 系统的解压、切目录、启动、关闭步骤。成品离线启动不应要求重新 npm install；开发重建所需依赖另列。

每份日志至少记录：UTC 时间、项目 ID、规范版本、commit、OS、CPU/内存、Node/npm/浏览器版本、完整命令、退出码、用例数量、失败明细。只存最后一行 PASS 不足以复核。

性能记录包含 EP-P01 样本哈希、5 次预热后 30 次正式测量、从点击处理函数到结果有效进入状态并经过下一次 requestAnimationFrame 的 durationMs、P50/P95 计算方法。P95 使用升序后第 ceil(0.95*n) 个值，n=30 时第 29 个；不得删去慢样本。1,500 ms 触发终止与 UI 不晚于 1,800 ms 可恢复分开记时。超时测试与常规性能分开报告。

## 11 风险分级与修复范围

P0：受保护原文被改写、待审或陈旧批准被误采纳、私人正文外传、数据清空后复活、核心成稿错误、把文字保护宣传成事实保证。立即停止交付。

P1：常见输入导致主路径崩溃、合法替换拆成半个批准、取消或超时失效、核心按钮无法键盘操作、当前 VM 性能门槛未达到、必需发布文件或证据缺失。修复后再提交。

P2：不影响结果的小幅布局、少数非必需浏览器未测、一次性文案细节、可延期的动画与导出装饰。登记，不阻挡 PASS。

修复包必须给 TASK_ID、问题编号、最小复现、原 commit、预期结果、允许文件、回归命令。新修复会话不得同时重构周边模块。阻断修复后的受影响测试与全量核心门禁通过即可，不扩展成无止境的泛化测试项目。

## 12 第一周的具体动作

第 1 天，Muse 核对四份规范、实际 VM 和已验证免费平台，创建任务板，发 T001。研究记录只问最近一次改稿错改发生在哪一段、怎样发现、核对用了多久；没有参与者时记录缺口。

第 2 天，完成 T002，先写 24 个独立样本与两种用户对照任务。对照中包括 Word 或参与者现用差异工具。冻结成功指标与停止条件。

第 3 天，完成 T003，派发 T005 和不共享文件的展示骨架；T005 验收后再启动 T004。用含人数上限的三段样例证明数据流，不追求复杂排版。

第 4 天，完成状态机与 Worker 的取消、迟到处理。独立会话检查保护边界、重复段及 emoji，不允许旧授权继续生效。

第 5 天，用已验收的核心测试程序证明“原稿—保护第二段—候选改稿—接受其余变化—输出”的正确结果；此时是核心程序证据，不称浏览器 Demo。App 文件仍由 T009 独占。

第 6 天，完成 T007–T008 的可点击界面，必要时以明确标记的模拟数据让 2–3 位已授权参与者做形成性走查，记录保护设置和术语误解。这个小检查不算真实算法运行或正式实验，也不擅自改变主要指标。

第 7 天，T009 启动应用集成，核对普通差异审阅与保护契约的操作负担。第 8 天 T009 通过后再完成真实浏览器纵向演示和正式配对实验。如果用户持续认为额外设置不值得，减少步骤、保留明确保护机制；如果核心漏改没有减少，登记产品风险，不继续加记忆或模型功能。

以上是施工后动作，本轮没有执行用户招募、产品测试或部署。

## 13 发布归档结构

Google Drive 正式根目录是已核实的 agent project auto。项目下使用以下结构，并保持四份规范的独立链接：

```text
agent project auto/P012-edit-pact/
  00_research/
    IDEATION_REPORT.md
  01_project_book/
    PROJECT_BOOK.md
    PROJECT_BOOK.docx
  02_implementation_plan/
    IMPLEMENTATION_PLAN.md
    IMPLEMENTATION_PLAN.docx
  03_tasks/
  04_source/
  05_tests/
  06_reviews/
  07_evidence/
  08_release/
  09_final_verdict/
```

本轮只归档研究与规范，其余目录由 Muse 按阶段建立，避免空目录被误解为已交付证据。FACTORY_INDEX.md 登记 P012，状态写 PLANNED / SPEC_READY / NOT_ACCEPTED，不借本次更新改变 P011 的状态。

Muse 将四份文件链接及项目文件夹链接加入当前 ChatGPT 项目来源；添加来源的 UI 是否支持必须实际核实。本会话若仅完成上传，不得声称来源已经自动添加或全文同步。

## 14 源码清单与审查包合同

冻结 commit C 后，由新发布会话在干净检出执行门禁。所有源文件来自 C；运行日志和构建产物放工作区外并记录 C。源码包不包含 .git、node_modules、私人记录或旧构建缓存。

SOURCE_MANIFEST.csv 字段：

```text
path,kind,bytes,sha256,first_party,review_required,review_pack
```

路径使用 POSIX 相对路径，按字典序。列出每个第一方源码、测试、脚本、配置和规范文件。二进制图像和 DOCX 记录哈希及对应文本/截图，不伪称从哈希读到了内容。依赖锁文件单列为关键配置，第三方依赖以许可证与版本清单审查。

REVIEW_INDEX.md 字段必须含：

```text
PROJECT_ID
SPEC_VERSION
FROZEN_COMMIT
SOURCE_ZIP_SHA256
DIST_ZIP_SHA256
REQUIRED_FILES_COUNT
SOURCE_MANIFEST_PATH_AND_SHA256
REVIEW_PACKS
REQUIREMENT_EVIDENCE_MATRIX
REAL_RUN_LOGS
UI_EVIDENCE
KNOWN_LIMITATIONS
READ_COVERAGE
```

每份 REVIEW_PACK_XX.md 最多约 60 KiB UTF-8，按模块切分，文件正文完整，不用截断省略号。每个文件前标 path、bytes、sha256、语言；超长单文件单独成包并编号续段，明确总段数和完整性。包内是实际代码，不是模块概述。

READ_COVERAGE 的每一行使用 NOT_READ、NAME_ONLY、CONTENT_READ、VERIFIED 之一，并列出对应证据。Muse 的已读取状态与 ChatGPT 的已读取状态分列，不能互相代替。ChatGPT 终审分母是本版本应核实文件总数，不能只用已发送的文件作分母。

## 15 哈希与发布清单

最终至少提交：

```text
edit-pact-source.zip
edit-pact-dist.zip
SOURCE_MANIFEST.csv
SHA256SUMS.txt
ENVIRONMENT.md
BUILD_LOG.txt
TEST_LOG.txt
E2E_LOG.txt
NETWORK_LOG.json
PERFORMANCE.csv
PERFORMANCE_REPORT.md
EVALUATION_REPORT.md
PRIVACY_REVIEW.md
LICENSE_REPORT.md
REVIEW_INDEX.md
REVIEW_PACK_01.md
screenshots/
demo/
```

SHA256SUMS.txt 记录最终 ZIP、清单和证据文件的哈希，排除自己，避免自引用。源码清单枚举 source.zip 解包后的源文件；发布包清单、测试日志和 ZIP 的 commit 必须一致。构建者产生的初次日志不能替代冻结提交后的真实复测。

截图最少含：空状态、选择保护段、越界变化被保留、混合采纳最终稿、超时可恢复、窄屏。短演示至少展示一次原稿变化导致旧批准失效。截图必须来自真实应用，不能用设计稿当运行证据。

四份规范的 Markdown/DOCX 内容一致检查和逐页排版检查需要留下报告，但最终用户只需取得完整规范，无须下载排版中间图片。

## 16 ChatGPT 独立终审和完成定义

Muse 将项目文件夹链接、REVIEW_INDEX.md、全部源码审查包、真实日志、UI 证据与版本哈希提交回本对话。ChatGPT 必须主动读取，不因看见文件名就认定已核实。无法读取 ZIP 时，补充纯文本源码包；缺证据先补证，不让模型重复重写已经正确的功能。

终审唯一格式：

```text
FINAL_VERDICT: PASS | FAIL | EVIDENCE_INCOMPLETE
PROJECT_ID: P012
RELEASE_SHA256_OR_COMMIT: ...
COVERAGE: 已核实文件 X / 应核实文件 Y
BLOCKERS: ...
NON_BLOCKING: ...
ACCEPTANCE_EVIDENCE: ...
REQUIRED_NEXT_ACTIONS: ...
```

核心缺陷判 FAIL，必需工程证据缺失判 EVIDENCE_INCOMPLETE。真实用户价值未测应明确列 NON_BLOCKING 与 USER_VALUE_NOT_MEASURED，不能宣称需求或节省时间已成立。已测出现负面结果时必须附 PRODUCT_VALUE_FAIL 和暂停扩展决定，工程验收结论不得遮掩。

PASS 需要需求覆盖、正确保护合成、真实 VM 运行、UI 可操作、离线与隐私证据、完整源码和依赖、开源许可、同版哈希全部满足。P2 可登记延期。通过后才允许 Muse 按既有授权完成发布归档与项目完成通知；本轮不发送任何项目完工消息。

超过 5 轮终审仍不过时，新对话命名“改稿守约 终审续审”，带项目规格、全部历次结论、每轮修复与结果、未解决阻断项、已通过证据及当前版本，不只写“接着审”。

