# P012 改稿守约 Edit Pact — 契约（T002 冻结）

来源：项目书 §8–§9、实施计划 §8–§9。版本：SPEC 1.0.0 / PLAN 1.0.0。
本文件是下游任务（T003–T014）唯一可依赖的接口说明；字段与失败行为
以项目书冻结定义为准，不得自行改语义。代码落点：`src/domain/types.ts`
（类型）、`src/domain/schema.ts`（Zod 运行时校验 + 哈希）。

## 1 接口列表

### 1.1 对外接口（项目书 §9.2）

| 签名 | 归属 | 说明 |
| --- | --- | --- |
| `canonicalize(text: string): string` | T003 | 唯一规范化：CRLF 与单独 CR 转 LF；不得 trim、替换空格、改变全半角、转换繁简体、做 Unicode NFC/NFKC |
| `validateInput(text, field): InputIssue[]` | T003 | 输入限制检查；错误消息不拼入私人全文 |
| `splitParagraphs(original): Paragraph[]` | T003 | 按 LF 分段；段落范围 `[start, end)`，不含段末 LF |
| `classifyHunks(original, hunks, protections): GuardResult` | T005 | 先验证区间与 oldText，再算 conflicts；有冲突标 `blocked`，其余标 `pending`，不接受任何旧决定 |
| `analyze(request): Promise<AnalyzeResult>` | T004 | 异步（Web Crypto 哈希）；组装哈希、差异与保护结果，返回完整 Analysis |
| `setDecision(session, analysisId, hunkId, decision): DecisionResult` | T006 | 陈旧 analysisId → `STALE_ANALYSIS`；未知 Hunk → `UNKNOWN_HUNK`；接受 blocked → `PROTECTED_CHANGE`；失败不改变原 session；相同决定重复提交为幂等成功 |
| `compose(session): Promise<ComposeResult>` | T005 | 遇任何 pending 立即返回 `PENDING_REVIEW`，不返回预览文字；合成前重查哈希、分析 ID、原文范围、保护冲突与状态完整性 |
| `makeReceipt(session, result): ReviewReceipt` | T009 | 三个版本标识（analysisId、revision、decisionRevision）均一致且无 pending，否则抛出带错误码的受控错误 |
| `exportText(text): Blob` | T009 | 导出最终文本 |
| `clearSession(session): ReviewSession` | T009 | 清空本次内容；原稿变化同时清除旧改稿、保护、分析与决定 |

### 1.2 核心类型（项目书 §9.1）

`Decision`（pending / accepted / rejected / blocked）、`ProtectedRange`
（id、paragraphId、start、end）、`Hunk`（id、start、end、oldText、newText、
conflicts、decision）、`RawHunk`、`Analysis`（schemaVersion 固定 `"1.0.0"`、
engineVersion、revision、jobId、analysisId、originalHash、candidateHash、
protections、hunks）、`ReviewSession`（original、candidate、revision、
decisionRevision、phase、protections、analysis）。

### 1.3 公共辅助类型（项目书 §9.2）

`ErrorCode`（8 个，见 §3）、`InputIssue`（code、field、limit、actual）、
`Paragraph`（id、start、end、text、isBlank）、`AnalyzeRequest`、
`AnalyzeResult`、`GuardResult`、`DecisionResult`、`ProtectedMapping`
（protectionId、sourceStart、sourceEnd、outputStart、outputEnd）、
`ComposeSuccess`、`ComposeResult`、`ReviewReceipt`（仅版本、哈希、区间、
状态和计数；**不得包含 original、candidate、oldText、newText 或用户目标文本**）。

### 1.4 UI 回调（实施计划 §8）

`onProtectionChange(protections)`、`onCompare()`、
`onDecision(hunkId, decision)`、`onKeepRemaining()`、`onClear()`。
组件不直接写 session；UI 只能调用契约层，不重新实现冲突公式；
输入输出层不得绕过 compose 直接下载 candidate。

### 1.5 Worker 协议（实施计划 §8）

- 一个活动 job；取消终止 Worker，下次重建。
- 请求：`{ type: 'analyze', request: AnalyzeRequest }` 或
  `{ type: 'cancel', jobId: string }`。
- 响应：`{ type: 'result', result: AnalyzeResult }` 或
  `{ type: 'error', errorCode, revision, jobId }`。
- 所有结果先验证 revision/jobId，迟到结果直接丢弃。
- Worker 不读浏览器存储，不生成 UI 提示文案。
- 预算：maxEditLength 2048、算法 timeout 800 ms、主线程 1500 ms 未收到
  有效结果时终止 Worker；算法返回 undefined 时进入 `TOO_COMPLEX`，
  不得视作“没有差异”。

## 2 范围与单位（项目书 §8.1–§8.3）

- 唯一规范化是 CRLF 与单独 CR 转换成 LF。
- 原稿必须非空；改稿可为空（显式删除场景）。每稿最多 **12000 个
  UTF-16 代码单元**、最多 **200 个换行分段**，单个导入文件最多 **100 KiB**。
  超限拒绝本次导入，保留之前输入。文件只接受 UTF-8，严格解码，不猜测 GBK。
  不接受包含不成对 surrogate 的 JS 字符串。
- 段落范围为 `[start, end)`，不包含段末 LF。空白段展示但不能保护。
  **所有偏移均指规范化原稿中的 UTF-16 代码单元位置。**段内原始空格保留，
  空白判定仅用于确定复选框是否可用。
- 冲突规则（§8.3）：对于非空原稿范围的删除或替换 `h=[a,b)`，保护范围
  `p=[s,e)`，冲突当且仅当 `a < e 且 b > s`。对于纯插入 `a=b`，若
  `s <= a <= e` 则冲突（两端也拦截）。所有冲突块状态为 `blocked`，
  自动保留原文，用户不得在本轮强行接受。
- 保护保证是原稿位置对应片段的字面保留；“没有保护冲突”不等于语义正确。

## 3 错误码

| 错误码 | 含义 |
| --- | --- |
| `INVALID_INPUT` | 输入违反 §8.1 限制（配合 `InputIssue.code` 细化） |
| `TOO_COMPLEX` | 差异算法返回 undefined 或超时预算耗尽 |
| `CANCELLED` | 比较被取消 |
| `STALE_ANALYSIS` | 决定指向陈旧的 analysisId（revision/jobId 已变） |
| `PENDING_REVIEW` | 仍有 pending 时尝试合成/导出 |
| `PROTECTED_CHANGE` | 试图接受 blocked 的变更 |
| `INVALID_PATCH` | 合成前检查失败（哈希、范围、冲突或状态不一致） |
| `UNKNOWN_HUNK` | 决定指向不存在的 Hunk |
| `UNSUPPORTED_ENV` | 缺少 Web Crypto 或 Intl.Segmenter |

`InputIssue.code`：`EMPTY_ORIGINAL`、`TOO_LONG`、`TOO_MANY_PARAGRAPHS`、
`INVALID_UNICODE`、`INVALID_UTF8`、`FILE_TOO_LARGE`。

## 4 哈希与 analysisId（项目书 §9.1）

- 哈希统一使用 **Web Crypto SHA-256（异步）**，对 TextEncoder 生成的
  UTF-8 字节计算并转小写十六进制；因此 `analyze` 与 `compose` 均为异步。
  localhost 支持环境必须实测；缺少 Web Crypto 时返回 `UNSUPPORTED_ENV`，
  不另写未经核验的同步替代。哈希用于版本一致性，不是内容真实性认证。
- `analysisId` 为固定字段顺序的 JSON 数组经 UTF-8 编码后的 SHA-256：
  `[schemaVersion, engineVersion, revision, jobId, originalHash,
  candidateHash, [[id, paragraphId, start, end], ...]]`，
  其中保护项按 start/end/id 排序。实现见 `schema.ts` 的
  `buildAnalysisIdPayload` / `computeAnalysisId`。
- `engineVersion` 记录核心规则版本及实际 diff 包版本，格式为
  `<核心规则版本>+<diff 包名>-<包版本>`（例如 `1.0.0+jsdiff-8.0.0`；
  jsdiff 归属 T004，此处只定格式）。
- `jobId` 每次比较重新生成，clear 后也不能复用；测试使用注入的固定 ID。

## 5 授权有效期与状态转换（项目书 §8.4、§9.2）

- 每次原稿、改稿、保护范围变化都增加 `revision`。Worker 请求和响应携带
  revision 与 jobId，迟到结果直接丢弃。
- 原稿变化清除旧改稿、保护、分析与决定；改稿变化保留原稿和保护但清除分析
  与决定；保护变化保留两稿但清除决定并重算。
- **A→B→C→B 也不能复用批准**：原稿从 A 改为 B 再改为 C、又改回 B 时，
  revision 已递增，旧 analysisId（含旧 revision/jobId）是陈旧的；
  内容恢复为旧值仍是新批准轮次，必须重新分析、重新决定。
  Hunk ID 是本分析内稳定序号，不跨分析复用批准。
- `pending` 不可导出。`blocked` 保留原文且不计为 `pending`。
  用户可显式选择“其余保留原文”，把所有 pending 改为 rejected；该操作
  不触及已接受项。每次实际改变决定（包括批量保留）增加独立的
  `decisionRevision`，并立即清空已缓存的最终预览、复制/下载资格和回执。
  幂等的相同决定不增加。第一版不提供“全部接受”。
- `compose` 首先取得不可变快照，哈希完成后返回该快照的 analysisId、
  revision、decisionRevision。UI 在显示、复制、下载、回执生成之前再次比较
  三个标识；等待期间如输入或采纳决定变化，则丢弃结果，不能用旧预览导出。
  reducer 采用不可变更新，不能原地修改旧快照的 Hunk。
- 合成顺序：遍历 Hunk，复制原稿未改片段，按状态插入 newText 或 oldText，
  最后复制剩余原稿。不得使用补丁库的模糊 applyPatch、上下文搜索或位置
  偏移修复。任一检查失败返回明确错误，不能退回使用整份 AI 改稿。

## 6 特殊字符与可解释限制（项目书 §8.5）

- Unicode 代理对、组合字符与 emoji ZWJ 序列不得被拆开批准；差异显示包含
  所在完整段上下文。首版不以视觉字符长度宣传“逐字数准确率”。
- 中文输入法 composition 尚未结束时禁止冻结与计算。
- 保护统计不通过在成稿中搜索同样的字符串得出，而使用合成时的原稿区间
  映射核对。重复出现同样的文字不能用来掩盖受保护位置被错误替换。
- 浏览器缺少 Intl.Segmenter 时明确停止比较，不静默退化为会拆开 emoji 的实现。

## 7 Fixture 契约（项目书 §11.3、实施计划 §9）

### 7.1 目录与文件

`tests/fixtures/EP-F01` 至 `EP-F24`；每组含 `case.json`，以及案例需要的
`original.txt`、`candidate.txt`、`protections.json`、`decisions.json`。
性能样本 EP-P01 单列于 `tests/fixtures/perf/EP-P01/`，不挤占 24 组。

### 7.2 case.json

| 字段 | 说明 |
| --- | --- |
| `id` | `EP-F01`…`EP-F24`，与目录名一致 |
| `kind` | `compose`（合成）/ `validation`（输入校验）/ `workflow`（工作流状态） |
| `title`、`description` | 中文标题与说明 |
| `originalFile`、`candidateFile` | 必填/可选；均为组内文件名 |
| `protectionsFile`、`decisionsFile` | 可选；缺省表示无保护 / 无决定 |
| `lineEndings` | 可选，`LF`（默认）或 `CRLF`（仅 F13） |
| `actions` | 有序动作（见 §7.3） |
| `expectedOutcome` | `success` / `error` / `state` |
| `expectedErrorCode` | `error` 时必填；validation 案例固定为 `INVALID_INPUT` |
| `expectedIssueCode` | validation 案例必填（`InputIssue.code`，如 `TOO_LONG`）；与 `ErrorCode` 区分 |
| `expectedState` | `state` 时必填：`{ phase, analysisNull, exportable, decisionsEmpty? }` |
| `hasText` | 是否有文字结果；见 §7.4 |
| `notes` | 补充说明（手算依据、边界语义等） |

### 7.3 actions

`analyze { revision, jobId }`、`applyDecisions`（使用 decisions.json）、
`compose`、`validate { field }`、`changeOriginal { revision, file }`、
`changeCandidate { revision, file }`、`changeProtections { revision, file }`、
`cancel { jobId }`、`clear`、`lateResponse { jobId, revision }`、
`keepRemaining`、`export`。workflow 案例写明每步 revision/jobId、事件和
最终状态，不能只用两篇静态文本表达迟到响应。

### 7.4 expected.txt 规则

- 正常合成且 `hasText=true` 时必须有 `expected.txt`；合法空结果也以空
  `expected.txt`（0 字节）表示。
- 错误与仅状态案例 `hasText=false`，不提供 `expected.txt`，避免混淆失败
  和合法删除。
- `expected.txt` 是人工手写的金标准，**不得从业务实现输出生成**；
  复核用独立朴素拼接 oracle（见 §7.5）与手算区间说明验证。

### 7.5 decisions.json 与独立 oracle

- 决定以原稿区间表达：`{ start, end, decision, newText? }`，坐标为
  规范化后 UTF-16 代码单元位置，不依赖尚未生成的 Hunk ID。
- `accepted` 必须带 `newText`（该区间对应的改稿文字；空字符串表示删除）；
  `rejected` 不需要 `newText`；`blocked` 由保护冲突自动判定，不出现在本文件。
- 下游实现规则：决定区间内的每个 Hunk 按同一决定处理；Hunk 要么完全在
  决定区间内、要么完全在区间外，不得与决定区间部分相交，否则该 fixture
  视为无效，由 T004 在集成时复核（T002 校验器无法在无 diff 实现时判定）。
- 独立 oracle（`scripts/check-fixtures.mjs`）：按区间升序对规范化原稿做
  朴素拼接——接受的区间替换为 `newText`，其余保留原文；结果必须与
  `expected.txt` 逐字节相等。该 oracle 不使用生产 diff 算法，
  只验证手写金标准与决定的一致性。
- 校验器还检查：区间不重叠且在 `[0, 原稿长度]` 内；`accepted` 的 `newText`
  出现在规范化改稿中；已接受决定不得与保护范围重叠；保护范围非空、
  位于非空白段、paragraphId 与所在段一致；每处保护文字都出现在
  `expected.txt` 中。

### 7.6 24 组清单

| 组 | 种类 | 场景 |
| --- | --- | --- |
| F01 | compose | 正常局部修改（§11.1 同构例） |
| F02 | compose | 相同文本 |
| F03 | compose | 无保护、全部接受 |
| F04 | compose | 全部保护 |
| F05 | compose | 日期/人数变动 |
| F06 | compose | 保护段删除 |
| F07 | compose | 跨区替换 |
| F08 | compose | 边界插入 |
| F09 | compose | 重复段 |
| F10 | compose | 段落重排 |
| F11 | compose | 多行替换 |
| F12 | compose | 空改稿（合法删除） |
| F13 | compose | CRLF |
| F14 | compose | 连续空格 |
| F15 | compose | emoji ZWJ |
| F16 | compose | 组合字符 |
| F17 | workflow | 原稿变化 |
| F18 | workflow | 改稿变化 |
| F19 | workflow | 保护变化 |
| F20 | workflow | 待审导出 |
| F21 | validation | 过长输入（TOO_LONG） |
| F22 | workflow | 超时取消 |
| F23 | compose | 恶意 HTML（纯文本） |
| F24 | workflow | 清空后迟到结果 |

## 8 性能样本 EP-P01（项目书 §12.1）

冻结正文：20 行各 99 个 CJK 基本区字符再接 LF，共 2000 UTF-16 单元；
各行固定 5 个位置（行内 0 起始：第 10、30、50、70、90 位）替换为不同的
单个字符（改、修、订、增、删），共 100 个替换，候选长度相同；
保护第 4、8、12、16、20 行。行字符：甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉。
文件：`tests/fixtures/perf/EP-P01/`（original.txt、candidate.txt、
protections.json、meta.json）。SHA-256 见 meta.json；计量方法：
5 次预热后 30 次正式测量，从用户点击比较的处理函数起，到结果经轮次验证
写入状态、可审阅控件出现后的下一次 requestAnimationFrame 止，包含分段、
哈希、Worker 往返和首次 UI 更新；P95 取升序第 ceil(0.95*n) 个值，n=30 时
第 29 个；保存所有正式测量，不删慢样本。受保护行内的替换将与保护冲突
（blocked），属预期；本样本用于计量，不用于合成正确性。实测属 T011。

## 9 不在本契约内

- 差异算法的具体分块（T004）、UI 布局与文案（T007/T008）、
  本地导入导出实现（T009）、浏览器隐私与性能实测（T011）、
  产品实验（T012）。以上任务不得以本契约未写为由自行发明语义，
  歧义回 T002 修正契约并更新影响清单。
