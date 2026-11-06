# P012 FIX-R1 交接 — 终审第 1 轮修复与重新冻结为快照 D

- **时间**：2026-11-05 22:56–23:07 GMT
- **工作目录**：`~/workspace/p012-edit-pact/`
- **发布目录**：`~/workspace/p012-release-d/`（工作区外；快照 C 的 `~/workspace/p012-release/` 保持不动，不覆盖、不删除、不改写）
- **结论**：终审 R1 的 2 个 P1 与 8 个 P2 全部处理；重新冻结为快照 D，
  通过全部验收；干净检出门禁通过；本项目状态为 READY_FOR_FINAL_REVIEW，
  不标 ACCEPTED。
- **版本说明**：本文件在 D 源码包内的版本不含下方“快照 D 的标识”哈希表
  （打包前写入，哈希当时未知）；工作区版本在打包后补入完整哈希表。
  两者除哈希表外内容一致。D 的权威哈希见发布目录 `SHA256SUMS.txt`。

## 终审 R1 背景

- verdict：`~/workspace/P012_R1_VERDICT.md`（2026-11-05 22:31–22:54 GMT，
  Extra High，未用 Pro；GPT 思考 18 分 23 秒）。
- FINAL_VERDICT: FAIL（P0 0 个；P1 2 个，均阻断；P2 8 个，均非阻断）。
- 快照 C（`~/workspace/p012-release/`，source.zip SHA-256
  `5c92f6d2…e58b4`）保留为历史冻结快照。

## 快照 D 的标识（无 Git、无 commit，不伪造 commit hash）

| 文件 | SHA-256 | 字节 |
|---|---|---|
| `edit-pact-source.zip` | `4136969fba3571bf074e443c18247ef34ba63a2bc31641f1f85da02f52a4f136` | 471,934 |
| `edit-pact-dist.zip` | `6492ab75742e47904e30d8cdc14d381a01e071b28df8ae1a6df9911a3b15e3ed` | 99,995 |

- 源码包：238 个文件；`SOURCE_MANIFEST.csv` 241 行（238 + 2 行发布包自记录 + 表头）。
- 构建产物包：6 个文件（`index.html` + `assets/` 3 个 + `serve.mjs` + `THIRD_PARTY_NOTICES.md`）；`DIST_MANIFEST.csv` 9 行。
- `SHA256SUMS.txt`：`def39cc4d51054735481667328e6afd7527e55c4088960abd2a78e15a03489c1`（36 个文件）。
- 审查包：`REVIEW_INDEX.md` + `REVIEW_PACK_01–06.md`，收录 76 个源码文件全文。
- 完整哈希清单见发布目录 `SHA256SUMS.txt` 与 `SOURCE_MANIFEST.csv`。
- 快照 C 未动：source.zip `5c92f6d2…e58b4`、dist.zip `ce257839…e4082`，
  打包前后两次核对一致。

## P1 修复（阻断）

### P1-01 成品 ZIP 按 README 快速开始无法启动

- **修复**：新增 `scripts/serve-dist.mjs`（与 `scripts/serve.mjs` 同源逻辑，
  唯一区别：静态根目录即本文件所在的目录本身——解压后的成品目录，
  不再解析“脚本上级目录下的 dist/”）；打包时以 `serve.mjs` 之名复制进
  `dist/` 再打成品包；README 快速开始改为解压后 `node serve.mjs --port 4173`
  （Windows 与 Linux 两节同步）；新增 `scripts/verify-dist-quickstart.mjs`
  发布测试（干净解压成品 ZIP → 按 README 启动 → 首页 HTTP 200 → Worker
  正常加载 → §11.1 主流程完成，成稿与期望逐字一致），并入
  `release:verify`（`hash-release.mjs` 之后串行）。
- **改动文件**：新增 `scripts/serve-dist.mjs`、`scripts/verify-dist-quickstart.mjs`；
  改动 `scripts/package-release.mjs`（打包时复制启动文件进 dist/）、
  `package.json`（`release:verify` 串联）、`README.md`（快速开始命令）。
- **验证**：发布测试在试打包与最终包上各跑通一次（见证据）。

### P1-02 BSD-3-Clause 第三方许可证未随发布包交付

- **修复**：新增 `THIRD_PARTY_NOTICES.md`，收录全部实际打包进生产 JS 的
  第三方运行时依赖（核查方法：静态导入链 + 产物标识 + 真实 Worker 内
  E2E 行为）：diff@9.0.0 BSD-3-Clause（`src/core/diff.ts` 导入
  `diffArrays`，经 analyze 进入 Worker，打包进 `assets/diff.worker-*.js`）、
  react@18.3.1 MIT、react-dom@18.3.1 MIT、zod@3.25.76 MIT；四份许可证
  正文逐字复制自锁定的发行包 `node_modules/<包>/LICENSE`（脚本核对逐字节
  一致）；开发依赖只用于构建与测试，未打包进生产 JS，不在收录之列（见文件内说明）。
  该文件纳入源码包与成品包；`release:verify` 增加第 9 项检查（两包内均存在、
  内容逐字节一致、含 BSD-3-Clause 完整正文与 MIT 通知）。
- **改动文件**：新增 `THIRD_PARTY_NOTICES.md`；改动 `scripts/package-release.mjs`
  （打包时复制进 dist/；LICENSE_REPORT 注明通知文件）、
  `scripts/hash-release.mjs`（第 9 项检查）、`docs/DEPENDENCIES.md`（指向通知文件）。
- **验证**：4 份正文与锁定包 LICENSE 逐字节一致（脚本核对）；`release:verify`
  第 9 项通过。

## P2 修复（非阻断，全部处理）

- **P2-01**：`reviews/OPEN_ISSUES.md` 头部“P1 3 个（未解决）”与底部“未解决”
  章节已按 FIX-T013 实际修复状态更新（标题改为“已修复”，原文留档）；文件末尾
  新增“终审第 1 轮”一节，登记 R1 的 2 个 P1 与 8 个 P2 及 FIX-R1 处理。
- **P2-02**：DRIVE_MANIFEST.md 生成时机由打包第 6 步移至最后（第 9 步），以最终
  文件清单为准，含 SHA256SUMS.txt、REVIEW_INDEX.md、REVIEW_PACK_01–06.md
  在内的全部文件；快照 D 状态为待上传（D 尚未归档，目标由主控决定）。
  另核实：快照 C 的文件实际已在 Drive 03_release 文件夹内（2026-11-05 22:56 GMT
  列表核对：26 个文件 + screenshots 文件夹），C 的 DRIVE_MANIFEST 称“待上传”
  是旧版生成时机的遗留错误。
- **P2-03**：发布目录新增 BENCHMARK_NOTE.md，随包标注每份性能数值的运行来源。
  核查结果（诚实记录）：C 的 BENCHMARK_LOG.txt P95 210.1 ms 来自 /var/tmp 复制件
  verify 运行（22:19 GMT）；BENCHMARK_RESULTS.json P95 220.9 ms 是打包时复制的
  results.json，T014 证据未登记写出它的那次 benchmark 运行，无法追溯到某一次
  具名运行；FIX-T013 交接 P95 270.8 ms 是 FIX-T013 的 verify 运行。三者均为独立
  运行的真实测量，均低于 500 ms 门槛。D 的两份数值来自同一次 verify 运行（打包
  只跑 build，不重跑 benchmark），见 BENCHMARK_NOTE.md。
- **P2-04**：`handoffs/P012-T014.md` 已在工作区，随快照 D 的源码包冻结（打包时
  核对在包内）；打包新增 `--install-log`（npm ci 原始日志 → 发布目录
  INSTALL_LOG.txt）与 RELEASE_PACK_LOG.txt（打包脚本自身的完整输出日志，
  写后重算 SHA256SUMS），均纳入 `release:verify` 必需文件检查。
- **P2-05**：`useEditPact.ts` 的 UNSUPPORTED_ENV 文案改为覆盖 Worker 构造失败、
  Web Crypto 缺失、Intl.Segmenter 缺失三类场景；`tests/unit/integration.test.tsx`
  同步更新断言文案。
- **P2-06**：真人价值尚未测量——`evaluation/observations.csv` 仍只有表头（0 行数据），
  `evaluation/results.json` 仍为 USER_VALUE_NOT_MEASURED，保持如实登记，不编造。
- **P2-07**：Windows NOT_TESTED、1,500 ms 超时演练方式——README 与 RELEASE_GUIDE
  仍如实标注，不伪造。
- **P2-08**：`package.json` description 已更新为与当前状态一致
  （READY_FOR_FINAL_REVIEW；冻结发布包，见 README.md）；README 与
  RELEASE_GUIDE 中对应的旧文案说明同步删除。

## 其他改动

- `docs/RELEASE_GUIDE.md`：发布目录表新增 BENCHMARK_NOTE.md、INSTALL_LOG.txt、
  RELEASE_PACK_LOG.txt、THIRD_PARTY_NOTICES.md（包内文件）；`release:pack`
  输入新增 `--install-log`；`release:verify` 说明更新为两步（hash-release +
  quickstart）；冻结定义去 C 专指；删除旧 description 文案说明。
- 业务核心（diff/guards/compose/reducer/analyze）与全部金标准 fixture 未动；
  验收门槛未动。

## 每条验收命令的真实结果

| 命令 | 结果 |
|---|---|
| `npm ci`（工作区） | exit 0；131 packages；Node v24.22.1 |
| `npm run verify`（工作区，23:02–23:04） | exit 0；9/9；fixtures 25/25、test 288/288、invariants 41/41、E2E 22/22、privacy 3/3、benchmark P95 165.4 ms、evaluation:check 22 checks |
| 试打包 `npm run release:pack`（→ /var/tmp/p012-trial-d） | exit 0；source.zip `4136969f…`（与 D 相同） |
| 试打包快速开始测试（→ 试包 dist.zip） | exit 0；8 项全过（HTTP 200、Worker 加载、§11.1 主流程完成） |
| `npm run release:pack`（→ p012-release-d） | exit 0；238 源码文件、6 成品文件 |
| `npm run release:verify`（→ p012-release-d） | exit 0；hash-release 10 项全过（含第 9 项第三方许可证）+ quickstart 8 项全过 |
| 截图换入最终包 dist.zip 的快速开始截图并重算 SHA256SUMS 后重跑 `release:verify` | exit 0；source.zip 哈希不变（`4136969f…`） |
| 干净检出 `npm ci`（/var/tmp/p012-clean-checkout-d） | exit 0 |
| 干净检出 `npm run verify` | exit 0；9/9；test 288/288、invariants 41/41、benchmark P95 193.4 ms |
| 干净检出 `npm run release:pack`（→ /var/tmp/p012-clean-release-d） | exit 0 |
| 干净检出 `npm run release:verify` | exit 0；hash-release 10 项全过 + quickstart 8 项全过 |

## 干净检出核对

- SOURCE_MANIFEST.csv 源码行 238 行逐行一致；source.zip 字节相同
  （`4136969fba3571bf074e443c18247ef34ba63a2bc31641f1f85da02f52a4f136`，
  `cmp` 核对通过）。
- DIST_MANIFEST.csv 文件行 6 行逐行一致；dist.zip 文件哈希不同仅因 zip 时间戳
  （与 T014 同款认定）。
- 干净检出发布目录的截图沿用 D 的演示截图（同款应用，见证据说明）；干净检出
  的网络/存储证据由其 verify 运行新鲜生成。

## 证据

- `~/workspace/evidence/P012/FIX-R1/`：`evidence.md`、`environment.md`、
  `commands.log`、`hashes-before.txt`、`hashes-after.txt`、`logs/`（`npm-ci.log`、
  `verify.log`、`release-pack.log`、`network-requests.json`、
  `storage-check.json`、`screenshots/`）。
- 交接：`handoffs/P012-FIX-R1.md`（本文件）。

## 下一步（给主控）

- FIX-R1 已完成。下一步按工厂顺序：把发布目录 `~/workspace/p012-release-d/`
  上传到 Drive `agent project auto / P012-edit-pact / 03_release`（对应关系见发布
  目录 `DRIVE_MANIFEST.md`），然后在 P012 立项对话发起终审第 2 轮（xhigh，
  提示词尾句照旧）。不要擅自上传云盘。
- 终审包状态：READY_FOR_FINAL_REVIEW；USER_VALUE_NOT_MEASURED 与
  Windows NOT_TESTED 等限制已在 README / RELEASE_GUIDE / REPORT.md 中明示，
  终审时不回避。
- 注意：不要在未重新冻结的情况下改动源码；`evaluation/results.json`
  重跑 `npm run evaluate` 会改写时间戳，需重新冻结。
