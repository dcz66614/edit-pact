# P012-T013 未解决问题登记

- **登记时间**：2026-11-05 21:06–21:25 GMT（T013 独立审查）
- **状态（FIX-R2 更新）**：终审 R2 EVIDENCE_INCOMPLETE（P0 0；P1 0；P2 10：
  R1 的 P2-01–08 + 新增 P2-09、P2-10；另 1 项必需证据缺口，不记为 P1/P2）。
  FIX-R2 正在修复 R2 的 2 个新增 P2、2 个部分修复 P2 与该证据缺口，见文件末
  “终审第 2 轮”一节；R1 的 2 个 P1 已确认修复未复发。
- **详情**：见 `reviews/CODE_REVIEW.md`（复现步骤、位置、修复方向）。
  本文件只登记，不修复（T013 禁止修改实现与测试）。
- **旧状态行作废**：本文件初版头部曾写“P1 3 个（未解决，阻断通过）”，
  与 FIX-T013 实际修复状态矛盾，终审 R1 以 P2-01 指出；现按实际修复
  状态更新，下方 P1/P2 章节标题亦同步改为“已修复”，原文留档备查。
- **修复后要求**：修复会话保持审查独立；修完重跑 `npm run verify`
  （FINDING-T013-02 修后才存在）、`test`、`test:invariants`、`test:e2e`、
  `fixtures:check`，并重新核对最终实际文件。

## 修复状态（FIX-T013，2026-11-05 21:17–21:32 GMT；交接 `handoffs/P012-FIX-T013.md`）

`npm run verify` 全过（typecheck / fixtures:check 25/25 / test 288/288 /
test:invariants 41/41 / build / test:e2e 22/22 / test:privacy 3/3 /
benchmark PASS P95 270.8 ms / evaluation:check 22 checks），无回归。

- **FINDING-T013-01（P1）已修复**：实现 FR03。新增 `src/core/instruction.ts`
 （纯字符串生成，只含目标 + 显示为已选的保护段落原文与段号）、hook
  `instructionText`/`copyInstruction`（经既有剪贴板路径，只复制不发送）、
  PreparePanel 改稿说明区（只读预览 + 复制按钮 + 成功/失败反馈）。
  单元 + 集成 + E2E 三层覆盖“内容与可见状态一致、无发送行为”。
- **FINDING-T013-02（P1）已修复**：新增 `scripts/verify.mjs` +
  package.json `verify` 脚本，9 条子命令按 §10 顺序串行，任一非零
  立即停止；`npm run verify` 已跑通（exit 0）。
- **FINDING-T013-03（P1）已修复**：`DiffWorkerClient.analyze()` 构造失败
  不再同步抛错，以 `{ ok: false, errorCode: 'UNSUPPORTED_ENV' }` 兑现；
  hook 另包 try/catch 并接 `.catch`，失败进 error 阶段并提示，不卡
  comparing。单元（构造失败 + 旧 job 先 CANCELLED）与集成测试覆盖。
- **FINDING-T013-04（P2）已修复**：两处 F07 测试改写为真实 2-Hunk 模型
  （h1 [11,18) blocked + h2 [20,21) pending，h2 接受后成稿等于
  expected.txt），与 FIX-T010-01 金标准一致（真实 analyze 探针核对）。
- **FINDING-T013-05（P2）已修复**：新增“返回审阅（保留决定）”入口
  （只清 UI 状态，不碰 session；保护/原稿一改动，reducer 已清空分析，
  入口随之消失）；回准备页提示文案改为明示调整保护或原稿将清空决定。
  集成 + E2E 覆盖。
- **FINDING-T013-06（P2）已修复**：`commitOriginalDraft` 在真正提交
  草稿前检查组合状态，组合中拒绝冻结并提示；草稿无变化时放行。
  集成 + E2E 覆盖。
- **FINDING-T013-07（P2）已修复**：结果到达时被丢弃且会话仍在 comparing
  时，主动进 error 阶段并提示重新比较，不再永久转圈（正常接线下
  不可达，属纵深防御）。
- **FINDING-T013-08（P2）已修复**：新增 `truncateToUtf16Units`（按
  UTF-16 单元上限、字位簇边界截断，超限簇整个舍弃，孤立代理丢弃），
  PreparePanel 目标输入改用它。单元 + UI 测试覆盖（含 T013 探针原案）。
- **FINDING-T013-09（P2）已修复**：纯空白 Hunk 文本显示“（换行符）”
  /“（空白，共 N 字）”标记（删除/新增栏与上下文变更片段）。UI 测试覆盖。
- **FINDING-T013-10（P2）部分修复**：
  1. LICENSE 已补（仓库根目录 MIT，Copyright (c) 2026 Chengze Du）。
  2. `docs/DEPENDENCIES.md` 已补 jsdiff（运行时 9.0.0）与 jsdom
     （开发 31.0.0）记录。
  3. 剪贴板失败回退分支已在浏览器中触发验证（E2E：writeText 恒拒，
     回退框出现且内容与成稿一致）。
  4. 超限与非 UTF-8 文件导入已在浏览器中重复测（E2E：均拒绝，旧输入保留）。
  5. Windows NOT_TESTED：**未修**——本 VM 无 Windows 测试条件，不伪造
     跨平台通过；留待 T014 或后续在有 Windows 环境时测。
  6. 1,500 ms 超时路径演练方法：**未变**——T011 已如实记录方法；若算法
     预算放宽，应改用真实慢输入重测（同 T011 登记）。
- **FINDING-T013-11（P2）已修复**：`check-fixtures` 的已接受决定检查
  对零长区间用端点包含判定（`s<=a<=e`）。负向测试证明：临时加零长
  已接受决定 [0,0) 于保护起点，checker 报 FAIL；恢复后 25/25 通过。

## 注记（非问题，记录在案）

- error 阶段点“返回准备页”后旧错误横幅残留：**已修复**——
  `backToProtections` 现同时清除 error（FIX-T013 顺带）。

## P1（已修复，FIX-T013——以下原文留档，状态以文件头为准）

### FINDING-T013-01 — FR03“生成可选改稿说明”未实现，且无删减记录

- **位置**：项目书 §6 FR03（P1）、§4 固定流程第 3 步。
- **问题**：全仓库无“改稿说明”生成/复制入口；`goal` 输入是只写状态，
  从不进入任何输出、复制、回执或 analysisId。P1 功能被静默跳过，
  无规范版本更新或删减记录（违反项目书 §6）。
- **修复方向（二选一）**：（a）实现该功能（从当前目标 + 已选保护范围
  生成可复制的改稿说明，提供复制按钮，只复制当前可见内容，不自动发送）；
  （b）按 §6 走规范版本更新 + 明确记录影响，正式删减 FR03。
- **回归**：`test`、`test:e2e`。

### FINDING-T013-02 — `npm run verify` 脚本缺失

- **位置**：`package.json`（无 `verify` 脚本）；实施计划 §10。
- **问题**：`npm run verify` → `Missing script: "verify"`。9 条子命令
  已手动按序跑通（全部 exit 0），但固化脚本不存在，T014 冻结流程
  无法按计划执行。
- **修复方向**：新增 `scripts/verify.mjs`（9 条子命令按序串行，任一非零
  立即停止并保留日志；不调用自己、不调用 release:pack/release:verify）
  并在 `package.json` 加 `verify` 脚本；然后跑通 `npm run verify`。
- **回归**：`npm run verify`。

### FINDING-T013-03 — Worker 构造失败时同步抛错，应用无错误面

- **位置**：`src/workers/client.ts`（`DiffWorkerClient.analyze`）；
  `src/app/useEditPact.ts`（`beginCompareFlow`）。
- **问题**：`createWorker()` 在 Promise 执行器之外，构造失败时同步抛出；
  hook 的 try/catch 只包住 `ensureClient()`。会话卡在 comparing 转圈，
  无任何错误提示，只能点“取消比较”恢复。探针已确认
  （`threw= Worker construction failed`，`promiseReturned= false`）。
- **修复方向**：把 `client.analyze()` 调用包进 try/catch，失败时进 error
  阶段并显示 UNSUPPORTED_ENV/TOO_COMPLEX 文案；或让 client 把构造失败
  转为 `{ ok: false, errorCode: 'TOO_COMPLEX' }` 结果。补一个构造失败
  的单元测试（注入抛错的 factory）。
- **回归**：`test`、`test:e2e`。

## P2（已修复，FIX-T013——以下原文留档，状态以文件头为准；T013-10 两项登记保持现状）

### FINDING-T013-04 — 两处手写 F07 单元测试仍是修复前的旧模型

- **位置**：`tests/unit/guards.test.ts:133`、`tests/unit/compose.test.ts:317`。
- **问题**：仍用手写单 Hunk `[9,24)` 断言“整块 blocked，成稿等于原稿”，
  与 FIX-T010-01 修复后的金标准（真实 analyze 产 2 个 Hunk，h2 接受）
  矛盾。测试本身仍通过，错的是追溯命名与数据。
- **修复方向**：改名并改为真实 2-Hunk 模型，或明确标注为合成单元用例
  并去掉 F07 命名。回归：`test`、`test:invariants`。

### FINDING-T013-05 — 返回准备页后无保留决定的回审阅路径

- **位置**：`src/app/EditPactApp.tsx`；`src/core/reducer.ts`（beginCompare）。
- **问题**：唯一回审阅的路是重新比较；即使不改任何保护，全部决定也丢失。
  文案“不改保护直接重新比较即可”未说明决定会丢。
- **修复方向**：增加“返回审阅（保留决定）”入口，或把文案改为明确提示
  重比将清空决定。回归：`test:e2e`。

### FINDING-T013-06 — IME 冻结守卫只盖住“开始比较”，不盖保护勾选

- **位置**：`src/app/useEditPact.ts`；`src/components/PreparePanel.tsx`。
- **问题**：组合输入中点保护复选框会走 `setProtections → commitOriginalDraft`
  冻结半成品草稿；实际靠失焦提交时序兜底，未在测试中锁定。
- **修复方向**：在 `commitOriginalDraft`/`setProtections` 入口检查
  isComposing，或补 E2E 用例锁定该路径。回归：`test:e2e`。

### FINDING-T013-07 — isComposing 丢弃分支可让会话卡在 comparing

- **位置**：`src/app/useEditPact.ts`；`src/core/reducer.ts`。
- **问题**：结果到达时若 isComposing，`applyAnalysisResult` 返回
  `applied: false`，会话保持 comparing，无重试触发，只能点取消恢复。
  探针确认。经接线核查该路径实际不可达（比较中无可输入字段），
  属纵深防御缺口。
- **修复方向**：丢弃时改为 error/CANCELLED 状态，或自动重试一次。

### FINDING-T013-08 — 目标输入 `slice(0,120)` 可切开代理对

- **位置**：`src/components/PreparePanel.tsx`。
- **问题**：探针确认 `('a'.repeat(119) + '👨‍👩‍👧‍👦').slice(0, 120)`
  产生不成对 surrogate。goal 只显示、不进入哈希/导出/回执，仅渲染为替换符。
- **修复方向**：按 code point/grapheme 边界截断。

### FINDING-T013-09 — 纯换行 Hunk 的展示为空白

- **位置**：`src/components/HunkCard.tsx`。
- **问题**：Hunk 恰为 `"\n"` 时上下文 changed 片段为空、删除文字栏折叠为空白；
  功能正确，仅展示不清。
- **修复方向**：对空白类 oldText/newText 显示可见标记（如“（换行符）”）。

### FINDING-T013-10 — 先前已登记的遗留（复核确认仍未解决，非阻断）

1. 仓库根目录无 LICENSE 文件（T014 补齐）。
2. `docs/DEPENDENCIES.md` 仍缺 jsdiff 与 jsdom 记录（T014 更新）。
3. 剪贴板失败回退分支未在拒绝授权的上下文中触发（T011 已登记）。
4. 超限文件导入未在浏览器中重复测（T009 单元测试覆盖）。
5. Windows NOT_TESTED；Firefox/WebKit、真实拼音输入法未测。
6. 1,500 ms 超时路径用“生产客户端 + 真实浏览器 Worker（仅响应时机被桩）”
   演练（T011 已如实记录方法）。

### FINDING-T013-11 — `check-fixtures` 对零长 accepted 决定的检查盲点

- **位置**：`scripts/check-fixtures.mjs`（`overlaps()`）。
- **问题**：零长 accepted 决定 `[a,a)` 落在保护起/止点时不报错，
  但生产 `classifyHunks` 会按 §8.3 判冲突。现行 fixture 无此情形。
- **修复方向**：决定检查对零长区间用 `s<=a<=e` 判定。回归：`fixtures:check`。

## 注记（非问题，记录在案）

- error 阶段点“返回准备页”后旧错误横幅残留（`EditPactApp` 的 error
  banner 不随 returningToPrepare 清除）：**已修复（FIX-T013）**——
  `backToProtections` 现同时清除 error。
- `readTextFile` 把 `file.arrayBuffer()` 失败标为 INVALID_UTF8：错误码
  与实际原因不符（文件读取失败，非编码问题），极少触发。
- `serve.mjs` 的 500 处理泄露 `err.message`：仅本机服务，影响可忽略。
- `evaluate.mjs` 的 `THRESHOLD_NUMERATORS[n]` 对 n>8 回退到 8 人口径：
  PARTICIPANT_IDS 上限 8 人，不可达。
- `applyAnalysisResult` 复制 Hunk 对象时 `conflicts` 数组共享引用：
  全仓库无原地修改，已 grep 确认，无 live 影响。
- `tests/performance/results.json` 是 benchmark 每次运行重写的测量结果，
  其 SHA-256 随运行变化是设计使然，不以 SHA 为准，以 `evaluation-check`
  式的重算核对为准（与 T012 的 results.json 时间戳问题同理）。

## 终审第 1 轮（GPT，2026-11-05 22:31–22:54 GMT；verdict 见 ~/workspace/P012_R1_VERDICT.md）

- **结论**：FINAL_VERDICT: FAIL（P0 0 个；P1 2 个，均阻断；P2 8 个，均非阻断）。
  冻结快照 C 保留为历史快照，不覆盖、不删除；修复后生成新冻结快照 D 再提交第 2 轮。
- **修复任务**：P012-FIX-R1（交接 `handoffs/P012-FIX-R1.md`）。

### R1 P1（阻断，FIX-R1 修复）

- **P1-01 成品 ZIP 按 README 快速开始无法启动**：dist.zip 只有 4 个文件，
  无 scripts/serve.mjs，README 却让用户跑 `node scripts/serve.mjs --port 4173`。
  修复：新增 `scripts/serve-dist.mjs`（静态根目录即成品包自身目录），打包时
  以 `serve.mjs` 之名复制进 dist.zip；README 改为 `node serve.mjs --port 4173`；
  新增 `scripts/verify-dist-quickstart.mjs` 发布测试（干净解压 → 按 README
  启动 → HTTP 200 → Worker 加载 → §11.1 主流程完成），并入 `release:verify`。
- **P1-02 BSD-3-Clause 第三方许可证未随发布包交付**：运行时依赖 diff@9.0.0
  的完整许可证正文不在任何交付文件中。修复：新增 `THIRD_PARTY_NOTICES.md`
  （diff BSD-3-Clause 与 react / react-dom / zod MIT 完整正文，均逐字复制自
  锁定的发行包；另核查全部实际打包进生产 JS 的第三方运行时依赖），纳入源码包
  与成品包；`release:verify` 增加第三方许可证存在性检查（第 9 项）。

### R1 P2（非阻断，FIX-R1 全部处理）

- **P2-01**：本文件曾标记 3 个 P1 未解决——已按 FIX-T013 实际修复状态更新（见文件头）。
- **P2-02**：DRIVE_MANIFEST.md 曾写“待上传”且未列出 SHA256SUMS、索引和六个审查包——
  已修复：改为打包最后生成，以最终文件清单为准，全部文件列入；快照 D 状态为待上传
  （D 尚未归档，目标由主控决定）。另核实：快照 C 的文件实际已在 Drive 03_release
  文件夹内（2026-11-05 22:56 GMT 列表核对：26 个文件 + screenshots 文件夹）。
- **P2-03**：BENCHMARK_LOG.txt（P95 210.1 ms）与 BENCHMARK_RESULTS.json（P95 220.9 ms）
  数值不一致——已核查：前者来自 /var/tmp 复制件 verify 运行（22:19 GMT），后者是打包
  时复制的 results.json（T014 证据未登记写出它的那次 benchmark 运行）；另 FIX-T013
  交接 P95 270.8 ms 是 FIX-T013 的 verify 运行。三者均为独立运行的真实测量，均低于
  500 ms 门槛。修复：发布目录新增 BENCHMARK_NOTE.md，随包标注每份数值的运行来源。
- **P2-04**：缺少 handoffs/P012-T014.md 与最终 npm ci、release:pack 独立命令日志——
  已修复：P012-T014.md 已在工作区，随快照 D 的源码包冻结；打包新增 --install-log
  （npm ci 原始日志 → 发布目录 INSTALL_LOG.txt）与 RELEASE_PACK_LOG.txt（打包脚本
  自身的完整输出日志），均纳入 release:verify 必需文件检查。
- **P2-05**：useEditPact.ts 的 UNSUPPORTED_ENV 文案不够准确——已修正为覆盖 Worker
  构造失败、Web Crypto 缺失、Intl.Segmenter 缺失三类场景；集成测试同步更新。
- **P2-06**：真人价值尚未测量——保持 USER_VALUE_NOT_MEASURED 如实登记，不编造。
- **P2-07**：Windows NOT_TESTED、1,500 ms 超时演练方式——保持如实标注，不伪造。
- **P2-08**：package.json description 仍写 construction in progress——已更新为与当前
  状态一致的描述；README 与 RELEASE_GUIDE 中对应的旧文案说明同步删除。

## 终审第 2 轮（GPT，2026-11-05 23:12–23:37 GMT；verdict 见 ~/workspace/P012_R2_VERDICT.md）

- **结论**：FINAL_VERDICT: EVIDENCE_INCOMPLETE（P0 0 个；P1 0 个；P2 10 个，
  均非阻断）。R1 的 2 个 P1 已确认修复未复发；两 ZIP 哈希、审查包章节、
  许可证正文、全部验收数字均已独立核实通过。唯一阻断性缺口是 1 项必需
  证据（见下），不是产品缺陷；GPT 明确“补齐后可复核，不因证据缺口重写代码”。
- **必需证据缺口（不记为 P1/P2）**：提交中未附 D 的完整 release:verify
  日志；GPT 审查容器因组织策略拦截 localhost/127.0.0.1，未能独立复现
  成品快速开始与 release:verify（GPT 环境限制，我方无法修复，只能以证据
  包补齐）。修复：打包第 10 步实跑 release:verify 并把完整输出捕获为
  发布目录的 RELEASE_VERIFY_LOG.txt，随包冻结，纳入 release:verify 必需
  文件检查、SHA256SUMS.txt 与清单；交接文件附该日志全文供第 3 轮粘贴。
  不改任何产品代码来“修”这个缺口。
- **修复任务**：P012-FIX-R2（交接 `handoffs/P012-FIX-R2.md`），重新冻结
  为快照 E，归档目标 05_release（03_release 是 C、04_release 是 D，均不动）。

### R2 P2 新增（FIX-R2 修复）

- **P2-09 scheduler@0.23.2（MIT）未单独列入 THIRD_PARTY_NOTICES.md**：
  react-dom 依赖 scheduler，scheduler 实际打包进生产 JS。修复：把
  scheduler@0.23.2 的 MIT 许可证正文（逐字复制自锁定的发行包
  `node_modules/scheduler/LICENSE`，脚本核对逐字节一致）加入通知文件。
  教训：FIX-R1 只按直接导入链审计，漏了传递依赖；FIX-R2 按实际产物内容
  重审（`node scripts/audit-bundled-deps.mjs`，构建产物标识核对）：生产
  依赖树 7 个包，实际打包 5 个（diff、react、react-dom、scheduler、zod），
  未打包 2 个（loose-envify、js-tokens）；5 份许可证正文全部逐字节一致。
  `docs/DEPENDENCIES.md` 同步补 scheduler 行与“传递依赖（实际打包情况）”一节。
- **P2-10 REVIEW_INDEX.md 审查时间线不准确**：D 的索引把 FIX-R1 新增的
  两个脚本（serve-dist.mjs、verify-dist-quickstart.mjs）标成“T013 全文
  通读”，并把 FIX-T013 改过的文件标成 T013 读过冻结版——两者都不成立。
  修复：`scripts/build-review-packs.mjs` 的 `coverageFor()` 改为按任务集合
  口径（FIX-T013 新增/修改、FIX-R1 新增/修改、FIX-R2 新增/修改，最新修改
  者优先），每行写明该文件内容实际被谁、在何时读过，修改后未重读的如实
  写出；索引标题去掉过时的“（T014）”标记。

### R2 P2 部分修复（FIX-R2 修复）

- **P2-02（R1 部分修复）**：D 的 DRIVE_MANIFEST.md 仍指向 03_release，
  而 D 实际归档在 04_release。修复：`scripts/package-release.mjs` 新增
  `--drive-folder` 参数（默认 03_release 保持向后兼容），DRIVE_MANIFEST
  的目标文件夹与表内路径均以该参数为准；E 打包时传 `--drive-folder 05_release`。
  生成时机仍为打包最后，以最终文件清单为准。
- **P2-04（R1 部分修复）**：handoffs/P012-T014.md、INSTALL_LOG.txt、
  RELEASE_PACK_LOG.txt 已提供，但 release:verify 未独立运行。修复：见上
  “必需证据缺口”——打包第 10 步实跑并捕获 RELEASE_VERIFY_LOG.txt。

### R2 P2-01–08（R1 遗留，FIX-R2 确认状态）

- **P2-01**：本文件头已按实际修复状态更新（见文件头 FIX-R2 状态行）。
- **P2-03**：BENCHMARK_NOTE.md 已随 D 冻结（各运行数值来源已标注），E 沿用。
- **P2-05**：UNSUPPORTED_ENV 文案已修正（FIX-R1），E 沿用。
- **P2-06**：真人价值尚未测量——保持 USER_VALUE_NOT_MEASURED 如实登记，不编造。
- **P2-07**：Windows NOT_TESTED、1,500 ms 超时演练方式——保持如实标注，不伪造。
- **P2-08**：package.json description 已更新（FIX-R1），E 沿用。
