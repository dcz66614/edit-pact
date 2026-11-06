# P012 改稿守约 Edit Pact — 发布指南（T014）

## 版本

- 项目：P012；规格：SPEC 1.0.0；应用版本：0.1.0。
- 状态：READY_FOR_FINAL_REVIEW（已冻结待终审，未通过终审，不标 ACCEPTED）。

## 冻结的定义

本工作区没有 Git 仓库、没有 commit，不伪造 commit hash。冻结快照的标识就是：

- `edit-pact-source.zip`（SHA-256）
- `SOURCE_MANIFEST.csv`（包内每个文件的字节数与 SHA-256）
- `SHA256SUMS.txt`（发布目录内除自身外全部文件的 SHA-256）

三者一致即为同一快照。源码任何变化都必须重新打包、生成新快照，并重新执行受影响的门禁。

## 发布目录

默认输出到工作区外的 `~/workspace/p012-release/`（不写进工作区源码树）：

| 文件 | 说明 |
|---|---|
| `edit-pact-source.zip` | 冻结源码包（全部第一方文件，含规格、测试、评价、审查、交接记录） |
| `edit-pact-dist.zip` | 冻结构建产物包（dist 内容置于包根，解压即为可运行目录；内含 `serve.mjs` 启动文件与 `THIRD_PARTY_NOTICES.md` 第三方许可证通知） |
| `SOURCE_MANIFEST.csv` | 源码包清单（path,bytes,sha256）+ 2 行发布包自记录 |
| `DIST_MANIFEST.csv` | 构建产物包清单（同上） |
| `SHA256SUMS.txt` | 发布目录全部文件哈希（除自身外） |
| `ENVIRONMENT.md` | 打包时环境记录 |
| `BUILD_LOG.txt` | 打包时 `npm run build` 的输出 |
| `TEST_LOG.txt` | verify 拆分：typecheck + fixtures:check + test + test:invariants |
| `E2E_LOG.txt` | verify 拆分：test:e2e |
| `PRIVACY_LOG.txt` | verify 拆分：test:privacy |
| `BENCHMARK_LOG.txt` | verify 拆分：benchmark |
| `BENCHMARK_RESULTS.json` | 冻结时的 EP-P01 测量结果（`tests/performance/results.json` 的副本） |
| `BENCHMARK_NOTE.md` | 性能数值来源说明（BENCHMARK_LOG 与 BENCHMARK_RESULTS 各自的运行来源；FIX-R1 P2-03） |
| `EVALUATION_CHECK_LOG.txt` | verify 拆分：evaluation:check |
| `VERIFY_LOG.txt` | verify 全量输出 |
| `INSTALL_LOG.txt` | 本次冻结对应的 `npm ci` 原始日志（FIX-R1 P2-04） |
| `RELEASE_PACK_LOG.txt` | 打包脚本自身的完整输出日志（FIX-R1 P2-04） |
| `NETWORK_REQUESTS.json` | 冻结版本实测的全部请求（应全为 127.0.0.1 loopback，零外部） |
| `STORAGE_CHECK.json` | 冻结版本实测的存储检查（流程前后与清空后全空） |
| `REVIEW_INDEX.md` | 覆盖清单（每个文件 SHA-256、审查包归属、实际读取覆盖） |
| `REVIEW_PACK_01.md` … | 完整源码正文审查包（按 150,000 字节上限分包，单个文件不拆） |
| `LICENSE` / `LICENSE_REPORT.md` | MIT 许可证副本与依赖许可证报告（报告注明第三方通知文件） |
| `THIRD_PARTY_NOTICES.md` | 第三方许可证通知（不在发布目录顶层，是源码包与成品包内各一份的同内容文件；`release:verify` 第 9 项检查其存在与一致性） |
| `RELEASE_VERIFY_LOG.txt` | 完整 release:verify 输出（hash-release 全部检查行 + verify-dist-quickstart 全部检查行；打包第 10 步实跑捕获，随包冻结；FIX-R2 P2-04，终审 R2 证据缺口） |
| `DRIVE_MANIFEST.md` | Drive 对应列表（打包最后生成，含全部文件；待上传，见下） |
| `screenshots/` | 无敏感数据演示截图（合成数据；1,280×800 与 390 px） |

## 验收顺序（计划 §10）

```bash
npm ci
npm run verify          # 9 条子命令按 §10 顺序串行；任一非零立即停止
npm run release:pack    # 生成冻结发布包
npm run release:verify  # 校验发布包完整性
```

`release:pack` 需要四样输入（默认在 `~/workspace/evidence/P012/T014/logs/`，FIX-R1 起默认在 `~/workspace/evidence/P012/FIX-R1/logs/`）：

- `verify.log`——`npm run verify` 的全量输出（tee 保存）。脚本按 `[verify] step:` 标记拆分各段；缺段、或末尾没有 `[verify] all steps passed` 时直接报错，不编造日志。
- `NETWORK_REQUESTS.json`、`STORAGE_CHECK.json`——冻结版本实测的网络与存储证据（T014 任务内用 Playwright 实测生成，见证据目录）。
- `screenshots/`——冻结版本实测的演示截图（同上）。
- `npm-ci.log`——本次冻结对应的 `npm ci` 原始日志（tee 保存），以 `--install-log` 传入，打包后为发布目录的 `INSTALL_LOG.txt`（FIX-R1 P2-04）。

`npm run build` 由 `release:pack` 自己跑一遍并存为 `BUILD_LOG.txt`，保证 dist 与源码同一版本。打包时把 `scripts/serve-dist.mjs` 以 `serve.mjs` 之名与 `THIRD_PARTY_NOTICES.md` 复制进 dist/ 再打成品包（FIX-R1 P1-01/P1-02）。

## 脚本说明

- `scripts/package-release.mjs`（`release:pack`）：打包主流程，见文件头注释。
  参数：`--out <dir>`、`--verify-log <path>`、`--logs-dir <dir>`、
  `--screenshots-dir <dir>`、`--install-log <path>`、`--drive-folder <name>`
  （归档目标文件夹，默认 `03_release`；E 用 `05_release`；FIX-R2 P2-02）、
  `--force`（覆盖已有发布目录时必须显式给）。
  打包第 10 步（FIX-R2 P2-04）：实跑 release:verify 并把完整输出捕获为
  发布目录的 `RELEASE_VERIFY_LOG.txt`，再重算 SHA256SUMS.txt。
  源码树收录排除：node_modules、dist、test-results、playwright-report、
  coverage、P012-edit-pact（立项规格包副本目录）、.git、*.tsbuildinfo、
  .DS_Store，以及每次 benchmark 重写的 `tests/performance/results.json`
  （测量产物，不进冻结包；冻结数值以 BENCHMARK_RESULTS.json 形式随包发布）。
- `scripts/hash-release.mjs`（`release:verify` 的第一步）：只校验、不改任何文件。
  参数：`--dir <release-dir>`（默认 `~/workspace/p012-release`，也可用 `RELEASE_DIR` 环境变量指定）。
- `scripts/verify-dist-quickstart.mjs`（`release:verify` 的第二步，FIX-R1 P1-01）：
  干净解压成品 ZIP，按 README 启动 `serve.mjs`，核查 HTTP 200、Worker 加载与
  §11.1 主流程完成，并留存截图。参数：`--dir <release-dir>`（默认同上）、
  `--screenshots-dir <dir>`。
- `scripts/build-review-packs.mjs`：生成 REVIEW_INDEX.md 与 REVIEW_PACK_XX.md。
  由 package-release 调用，也可单独运行（需 `--out`、`--manifest`、`--source-zip`）。

## 干净检出门禁

冻结后，从 `edit-pact-source.zip` 全新解压到一个干净目录（例如
`~/workspace/p012-clean-checkout/`），在其中顺序执行：

```bash
npm ci
npm run verify
npm run release:pack --out <干净发布目录> --logs-dir <干净日志目录> --verify-log <干净 verify.log>
npm run release:verify --dir <干净发布目录>
```

并核对干净包的 SOURCE_MANIFEST.csv 源码行与本快照的清单逐行一致（文件内容哈希
相同；仅两行发布包自记录的 zip 自身哈希会因 zip 时间戳不同而不同——这是
zip 文件本身的哈希，不是源码内容哈希，不影响快照的同一性认定）。

## Drive 归档

每快照独立文件夹：C → `03_release`，D → `04_release`，E → `05_release`
（FIX-R2 P2-02：D 的 DRIVE_MANIFEST 仍写 03_release 是错的，E 起以
`--drive-folder` 参数为准，不再写错）。发布目录对应 Drive
`agent project auto / P012-edit-pact / <快照文件夹>`（P012
文件夹 id：`1yxf-97jsseq5wpSlg5gofOCxHN6zdhPw`），对应关系见发布目录内的
`DRIVE_MANIFEST.md`。上传由主控按工厂顺序（先归档再终审）执行，不属于 T014；
T014 只提供对应列表，不声称已上传。

## 失败回退

- 打包或校验失败：保持未发布状态，只修复打包脚本或补证据；不改源码、不降门槛。
- 源码任何变化：重新打包生成新快照，并重新执行受影响的门禁（verify 全量 +
  release:pack + release:verify + 干净检出）。
- `release:pack` 拒绝覆盖已有发布目录（除非显式 `--force`），防止干净检出
  误写正式发布目录。

## 已知限制（随包发布，不回避）

- Windows NOT_TESTED；真人价值 USER_VALUE_NOT_MEASURED（0 名参与者）；
  1,500 ms 超时路径为演练方法（见 README.md）。
- `tests/performance/results.json` 不进冻结包（每次 benchmark 重写）；
  `evaluation/results.json` 在包内，哈希严格校验——重跑 `npm run evaluate`
  会改写其时间戳，冻结后重跑需重新冻结。
