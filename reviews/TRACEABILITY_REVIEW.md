# P012-T013 需求可追溯性审查

- **任务**：P012-T013（独立源码与交付预审中的需求映射部分）
- **依据**：项目书 SPEC 1.0.0 §5–§9、§11–§13；实施计划 PLAN 1.0.0 §7–§10；
  契约 `docs/CONTRACT.md`（T002 冻结）
- **审查时间**：2026-11-05 21:06–21:25 GMT
- **方法**：逐条 FR 对实现文件、测试用例、fixture、浏览器证据逐项核对；
  只认自己读到的代码与跑过的命令。

## 结论

15 条 FR 中 **14 条有实现 + 测试 + 证据，1 条（FR03）无实现**：

| FR | 需求 | 实现 | 测试/证据 | 状态 |
|---|---|---|---|---|
| FR01 | 粘贴/载入 UTF-8 TXT/MD 原稿与改稿 | `src/io/files.ts`（严格 UTF-8、100 KiB）、`src/core/text.ts` | `tests/unit/io.test.ts`（11）、F21、T009 浏览器证据 | ✅ 通过 |
| FR02 | 按换行显示段落，选择保护段 | `PreparePanel`、`ProtectionList` | `tests/unit/prepare-ui.test.tsx`、T007 浏览器证据 | ✅ 通过 |
| FR03 | 生成可选改稿说明 | **无** | **无** | ❌ **缺失（FINDING-T013-01，P1）** |
| FR04 | 精确文本比较 | `src/core/diff.ts`、`tokenize.ts` | `tests/unit/diff.test.ts`、F01–F16/F23、invariants 41/41 | ✅ 通过 |
| FR05 | 保护冲突判定 | `src/core/guards.ts` | `tests/unit/guards.test.ts`、F01/F04/F06/F07/F08/F09、invariants | ✅ 通过 |
| FR06 | 逐项接受或保留原文 | `src/core/reducer.ts`、`HunkCard` | `tests/unit/reducer.test.ts`、review-ui、E2E | ✅ 通过 |
| FR07 | 其余保留原文 | `keepRemaining`（reducer + hook + ReviewPanel） | reducer 测试、E2E | ✅ 通过 |
| FR08 | 授权失效与重算 | reducer change* + revision/jobId/analysisId | F17/F18/F19、invariants C4（A→B→C→B） | ✅ 通过 |
| FR09 | 确定性结果合成 | `src/core/compose.ts` | `tests/unit/compose.test.ts`、F01–F16、invariants | ✅ 通过 |
| FR10 | 最终稿复制和 TXT 下载 | `exportText`/`downloadBlob`/`copyToClipboard` | io 测试、integration 测试、E2E 导出一致 | ✅ 通过 |
| FR11 | 审阅回执 JSON | `src/core/receipt.ts` | receipt 测试（8）、E2E 回执无正文核对 | ✅ 通过 |
| FR12 | 全部清空 | `clearSession` + hook 清空 | integration 测试、E2E 清空用例、隐私存储检查 | ✅ 通过 |
| FR13 | 取消比较与超时处理 | `DiffWorkerClient` + reducer | worker 测试、E2E 取消/超时/迟到用例 | ✅ 通过（Worker 构造失败路径除外，见 FINDING-T013-03） |
| FR14 | 无外网依赖 | 无网络调用（静态扫描确认） | `test:privacy`（零外部请求、离线冷启动） | ✅ 通过 |
| FR15 | 可访问的中文界面 | 原生 button/input/textarea；中文文案 | E2E 纯键盘流程、390 px、IME 守卫 | ✅ 通过 |

## FR03 缺失的追溯细节

- 项目书 §4 固定流程第 3 步“可选复制改稿说明，然后自行去现有助手处理”
  与 §6 FR03（P1）在实施计划的全部任务卡（T001–T014）、全部 13 份交接、
  全部测试文件、全部证据目录中**零提及**。
- `goal`（修改目标）输入框存在（PreparePanel，120 UTF-16 单元上限），
  但它是只写状态：仅存入 `useEditPact` state、参与 `hasContent` 与清空判断，
  从不进入任何输出、复制、回执或 analysisId。用户填了目标，没有任何
  地方能把它复制出来。
- 项目书 §6 明确规定 P1“仅可在规范版本更新、明确记录影响后删减；
  不能由施工会话静默跳过”。本项既无实现，也无删减记录，属任务分工漏项。
- 修复方向见 CODE_REVIEW.md FINDING-T013-01（二选一：实现，或正式删减）。

## 关键算法边界核对（项目书 §8）

| 边界 | 核对结果 |
|---|---|
| §8.1 唯一规范化 CRLF/CR→LF，不 trim、不改全半角、不 NFC | `text.ts` 逐行核对通过；F13/F14/F16 覆盖 |
| §8.1 限制 12000 单元 / 200 段 / 100 KiB；原稿非空、改稿可空 | `text.ts` + `files.ts` 核对通过；F12/F21 覆盖 |
| §8.2 grapheme 粒度 + jsdiff diffArrays 严格相等 | `diff.ts` 核对通过；F15/F16 覆盖；jsdiff 超时语义经 node 直接调用独立核对 |
| §8.2 Hunk 原子性（相连删+插合并） | `diff.ts` 合并循环核对通过；diff 测试“替换原子性”覆盖 |
| §8.2 重建不变量（全接受得改稿、全拒绝得原稿） | `compose.ts` 的 `rebuildsCandidate` + invariants 41/41 |
| §8.3 冲突规则（非空 `a<e && b>s`；纯插入 `s<=a<=e`） | `guards.ts` 逐字核对通过；F06/F08/C2 覆盖 |
| §8.4 合成与授权（pending 不可导出；revision/analysisId/哈希重查） | `compose.ts` 8 步检查链核对通过；C3/C4/C5 覆盖 |
| §8.4 decisionRevision 只在实际改变时 +1，幂等不增加 | `reducer.ts` 核对通过；reducer 测试覆盖 |
| §8.5 Unicode 不拆分、composition 未结束禁止冻结、保护统计按区间映射 | diff/tokenize 核对通过；compose 的 `buildProtectedMappings` 按区间映射核对（不用字符串搜索）；**IME 冻结守卫覆盖不全**（FINDING-T013-06，P2） |
| §9.1/§9.2 类型与接口 | `types.ts`/`schema.ts` 与项目书逐项比对一致 |
| §9.3 回执无正文 | `receipt.ts` 核对通过；E2E 导出回执 9 项禁断言核对 |

## Fixture 追溯（24 组 + EP-P01）

- `fixtures:check` 25/25 通过；独立 oracle（`scripts/check-fixtures.mjs`）
  与生产 diff 无关，逐字节核对 expected.txt。
- EP-F07 已按 FIX-T010-01 修复（decisions.json 接受 h2 `[20,21)`，
  expected.txt 更新，case.json 描述重写）；`test:invariants` 41/41 通过。
- **追溯断裂（FINDING-T013-04，P2）**：`tests/unit/guards.test.ts:133`
  与 `tests/unit/compose.test.ts:317` 仍用手写单 Hunk `[9,24)` 断言
  “整块 blocked，成稿等于原稿”，与修复后金标准（2 个 Hunk，h2 接受）
  矛盾。两处测试对任意合法 Hunk 的行为本身仍通过，错的是追溯命名与数据。
  `tests/unit/diff.test.ts` 的 F07 条目走真实 analyze、只断言不变量，
  与修复后 fixture 一致，无问题。
- `scripts/check-fixtures.mjs` 有一处检查盲点：零长 accepted 决定落在
  保护端点时 `overlaps()` 不报错（FINDING-T013-11，P2）；现行 fixture
  无此情形。

## UI 规格追溯（项目书 §7）

| 规格 | 核对结果 |
|---|---|
| 三步骤工作台；顶部名称/步骤/隐私说明 | `EditPactApp.tsx` 核对通过 |
| 桌面 ≥1024 px；1,280×800 必验；<768 px 单栏 | E2E 1,280×800 与 390 px 通过；CSS 单栏布局存在（base.css/review.css） |
| 准备页：原稿区 + 保护清单；每段复选框/段号/全文；长段展开；最多 20 段 | 通过（T007 浏览器证据 + prepare-ui 测试） |
| 修改目标可选、最多 120 UTF-16 单元 | 输入与上限通过；**目标无任何下游用途**（FR03 缺失的一部分） |
| 核对页三栏；pending 时显示计数与“处理完剩余项后生成全文” | 通过 |
| blocked 卡显示保护原因、无接受入口 | 通过（HunkCard） |
| 成稿页：全文、受保护段数、采用数、保留数；双句文案齐全 | 通过（ResultPanel） |
| 不得用盾牌/绿色百分比暗示事实已核实；不得显示真实性评分 | 全页面文本无 `%`、无“真实性/评分/准确率”（T008 单元 + 浏览器断言） |
| 状态文案（§7.2）：空原稿例子入口、未选保护提示、两稿相同、比较中取消、待审未清、保护冲突、改动过大/超时、剪贴板失败、清空确认、原稿改动确认 | 逐项核对通过；**两处缺口**：返回准备页后无保留决定的回审阅路径（P2-05）；error 阶段返回准备页后旧错误横幅残留（注记，见 OPEN_ISSUES） |

## 工程验收指标追溯（项目书 §12.1）

| 指标 | 门槛 | 本轮实测 |
|---|---|---|
| 保护段字面保留 100% | 合法导出中 100% | invariants 41/41 + fixtures 25/25 通过 |
| 越权采纳 0 | 0 | C3 篡改矩阵 + PROTECTED_CHANGE 路径通过 |
| 重建一致性 | 全接受得改稿、全拒绝得原稿 | invariants 通过 |
| Unicode 与换行 | 契约样例全部符合 | F13–F16 通过 |
| 常规性能 EP-P01 P95 ≤ 500 ms | P95 ≤ 500 ms | 两轮 PASS（P95 226.7 / 295.4 ms） |
| 大输入失败路径 1,500 ms 终止、UI 恢复 ≤ 1,800 ms | 实测 | T011 实测 1,501.7 ms / 1,507 ms，UI 恢复在上限内（本轮 E2E 重跑通过） |
| 外部网络请求 0 | 0 | `test:privacy` 通过；src 静态扫描无网络调用 |
| 内容残留 0 | 清空后无正文 | `test:privacy` 存储检查通过 |
| 导出一致性 | 下载/复制与预览一致 | E2E 导出一致用例通过 |

## 交付结构核对（项目书 §15）

- 源码、package-lock.json、24 组 fixture、单元及浏览器测试、性能原始记录
  （`tests/performance/results.json`）、网络/隐私检查、演示截图、
  独立审查报告（本轮三份）、REVIEW_INDEX.md 与 REVIEW_PACK 尚待 T014
  在冻结时汇总——**REVIEW_INDEX.md 与 REVIEW_PACK_XX.md 目前不存在**，
  属 T014 交付范围，不在本轮扣分，但终审包须补齐。
- 许可证清单：仓库根目录无 LICENSE 文件（T014 补齐，P2-10 登记）；
  jsdiff BSD-3-Clause 已核对 `node_modules/diff/LICENSE` 存在（T011）。
- `npm run verify` 脚本缺失（FINDING-T013-02）：§10 要求的 9 条子命令
  我已手动跑通，但固化脚本须由修复会话补。
