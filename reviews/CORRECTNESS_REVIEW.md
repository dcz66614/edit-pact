# P012-T010 独立正确性与性质验证审查报告

- **任务**：P012-T010（独立正确性与性质验证），PLAN §7，预算 5 h
- **验证方**：独立验证方（与 T001–T009 构建者不同人）。本报告只认自己跑出来的结果和自己写的 oracle；构建者的自评（包括各任务交接中的“已验证”结论）一律只当作待核对的断言，不当作证据。
- **基线**：T009 提交（`handoffs/P012-T009.md`）；冻结 fixtures（`tests/fixtures/`，24 组）；项目书算法规格（`~/workspace/P012_PROJECT_BOOK.md` §8–§9）；契约（`docs/CONTRACT.md`）。
- **验证时间**：2026-11-05 20:15–20:30 GMT
- **环境**：Node v24.22.1，npm 10.9.4，Python 3.12.3，Playwright 1.64.1（见 `~/workspace/evidence/P012/T010/environment.md`）
- **禁止项遵守情况**：未改生产源码（全部 28 个生产文件 SHA-256 与 T009 交接逐一比对，一致）；未改金标准期望（fixtures:check 25/25，且未动 `tests/fixtures/`）；未改依赖版本（package.json 仅按 T002 先例加了一条 `test:invariants` 脚本；lockfile 未动）。

## 结论（先说）

**核心不变量未全部通过：发现 1 个真实缺陷（F07 金标准期望错误），另有 5 组随机用例的编辑级 oracle 分歧已逐个查清——全部是 oracle 自身“编辑原子”假设的错误，生产行为正确。**

- 验收命令：
  - `npm run fixtures:check` —— **25/25 PASS**
  - `npm run test:invariants` —— **40/41**，唯一失败 EP-F07（即下面 FINDING-1，测试按失败回退规则保留）
  - `npm run test` —— **267/268**，唯一失败 EP-F07；无回归（T001–T009 的 227 个测试全部通过）
- 除 F07 外：24 个 fixture 共 439 项独立检查全部通过；200 组有界随机合法补丁 0 失败；14 个手写最小反例全部通过；保护、重建、陈旧批准三类不变量在所有可测场景下成立。

## FINDING-1（唯一真实缺陷）：冻结 fixture F07 的金标准期望经生产管线不可达成

- **级别**：P1（金标准错误；生产实现正确，缺陷在 fixture，不在代码）
- **位置**：`tests/fixtures/EP-F07/`（T002 冻结）
- **最小复现输入**（可直接粘贴）：
  - 原稿：`第一段内容不变。\n第二段甲内容。\n第三段乙内容。\n第四段内容不变。`
  - 改稿：`第一段内容不变。\n第二段甲内容。\n第三段合并后的内容。\n第四段内容不变。`
  - 保护：`[9,16)`（第二段，段落 p2）
  - 无 decisions.json；`expectedOutcome: "success"`，`expected.txt` = 原稿全文
- **实际行为**（`npm run test:invariants` 唯一失败，复现稳定）：
  - 生产 analyze（jsdiff 最小差异，项目书 §8.2 锁定的算法）产出 **2 个 Hunk**：
    - h1 `[11,18)` oldText `段甲内容。\n第` → `''`，**blocked**（与保护重叠）
    - h2 `[20,21)` oldText `乙` → `合并后的`，**pending**（在 p3，不碰保护）
  - 无 decisions 时 compose 正确返回 `PENDING_REVIEW`（h2 待决定）。驱动报错：`compose ok — errorCode PENDING_REVIEW`。
- **为什么生产是对的**：§8.2 的合并规则（“任何相等项结束块”）加上最小差异算法，必然把改动拆成两处——`第二`、`三段`、`内容。` 在两稿中未变；单 Hunk `[9,24)` 的分区会是 27 个 grapheme 的编辑，而最小分区只有 11 个。h2 是 p3 里一个真实的、合法的用户决定；把它也拦截会把一个真实选择藏起来。T005 的 compose.test.ts 只用**手写**单 Hunk `[9,24)` 测过 F07，从未走真实 analyze；T004 的真实 analyze 核对只覆盖了带 decisions.json 的 14 组 fixture（F07 没有），所以这个缺口直到 T010 才被发现。
- **为什么金标准是错的**：F07 的描述声称“替换区间 [9,24) 与保护重叠，整块被拦截”，但按锁定的最小差异算法，该替换从来不是一个原子块。期望“无决定即成功且输出等于原稿”在生产管线里不可达成。

### FIX 卡（开给 T002 范围，fixture 归属方决策；T010 不改金标准）

- **FIX-T010-01（推荐方案 A）**：给 F07 补 `decisions.json`，接受 h2（`[20,21)` 接受，新文本 `合并后的`），并把 `expected.txt` 更新为：
  `第一段内容不变。\n第二段甲内容。\n第三段合并后的内容。\n第四段内容不变。`
  （h1 被拦截保留 p2 原文，h2 接受改动 p3；两处决定都走真实 analyze 验证。）
- 方案 B（重写 fixture 文本使替换真正原子化）改动更大；方案 C（把 expectedOutcome 改成 PENDING_REVIEW）**不推荐**——那会把“用户永远无法完成这次审阅”固化为期望行为。
- **失败测试保留**：`tests/unit/invariants.test.ts` 的 EP-F07 测试保持失败状态，直到 fixture 按 FIX 卡修复；修复后复跑 `npm run fixtures:check`、`npm run test:invariants`、`npm run test`。

## A 部分：24 个 fixture 逐项结果（独立驱动，439 项检查）

驱动 `tests/oracle/fixture-driver.ts`：每个 fixture 按 case.json 的动作序列走真实 `analyze` / `reducer` / `compose`（deferred-apply 语义：analyze 结果先暂存，下一动作需要时才应用；取消丢弃；迟到响应重放必须被拒绝；改保护后按 F19 描述的新 jobId 重算）。每次 analyze 都独立重算哈希与 analysisId（Node 原生 crypto）、核对 Hunk 不变量、独立重推 §8.3 冲突分类、核对重建不变量；compose 成功时三路核对（expected.txt = 独立区间 oracle = 独立 Hunk 拼接）并核对保护映射。

| Fixture | 类型 | 检查数 | 失败 | 备注 |
|---|---|---|---|---|
| EP-F01 | compose | 23 | 0 | |
| EP-F02 | compose | 16 | 0 | |
| EP-F03 | compose | 19 | 0 | |
| EP-F04 | compose | 25 | 0 | |
| EP-F05 | compose | 20 | 0 | |
| EP-F06 | compose | 20 | 0 | |
| EP-F07 | compose | 13 | **1** | FINDING-1（见上） |
| EP-F08 | compose | 20 | 0 | |
| EP-F09 | compose | 20 | 0 | 重复句按位置区分（与 C7 一致） |
| EP-F10 | compose | 20 | 0 | |
| EP-F11 | compose | 18 | 0 | |
| EP-F12 | compose | 17 | 0 | |
| EP-F13 | compose | 20 | 0 | |
| EP-F14 | compose | 17 | 0 | |
| EP-F15 | compose | 20 | 0 | 家族 emoji 单 token |
| EP-F16 | compose | 20 | 0 | 组合字符不 NFC 归一化 |
| EP-F17 | workflow | 17 | 0 | |
| EP-F18 | workflow | 17 | 0 | |
| EP-F19 | workflow | 31 | 0 | 改保护后重算，旧批准失效 |
| EP-F20 | workflow | 13 | 0 | |
| EP-F21 | validation | 2 | 0 | 输入校验错误码 |
| EP-F22 | workflow | 15 | 0 | 取消前先独立核对被丢弃的分析 |
| EP-F23 | compose | 17 | 0 | |
| EP-F24 | workflow | 19 | 0 | 迟到响应被拒绝 |
| **合计** | | **439** | **1** | |

## B 部分：200 组有界随机合法补丁（固定种子 20261105）

- **生成器** `tests/oracle/random-cases.ts`：1–4 段、每段 3–12 grapheme（字母/数字/CJK/标点，偶发 emoji ZWJ 家族、旗标、组合字符、肤色修饰符）；0–4 处编辑（grapheme 边界上的替换/删除/纯插入，编辑间 ≥1 个未变 grapheme）；保护取整段或 grapheme 对齐子区间（约 60% 用例）；约 25% 的受保护用例在保护起/止点恰好加一个纯插入（端点拦截）。
- **策略**：偶数用例全接受 pending；奇数用例每 pending Hunk 随机接受/拒绝（独立 PRNG）。
- **每用例核对**：（1）哈希与 analysisId；（2）Hunk 不变量；（3）独立 §8.3 分类；（4）重建不变量；（5）compose = Hunk 拼接；（6）保护映射 = 生产报告；（7）outputHash；（8）全接受用例再加候选还原 oracle；（9）编辑级 oracle（诊断用，见下）。
- **结果：200 组，0 失败**（全接受 100 组，随机策略 100 组）。

### 编辑级 oracle 的 5 组分歧——已逐个查清，全部是 oracle 自身的错误，生产正确

编辑级 oracle 假设“生成器的一处编辑是原子的”；但**重复 grapheme 使最小差异存在多种合法对齐**（项目书 §8.2 已明说），生产按 Hunk 粒度决定是对的。5 组里 Hunk 拼接（检查 5）与保护映射（检查 6）全部通过，compose 输出正确；错的是 oracle 的期望。逐组最小输入与机制：

| 用例 | 最小输入 | 机制 |
|---|---|---|
| R027 | 原稿 `日aüa是日dc\n2x0\n丙ey谢1。2dc\n1人e1`，改稿 `xa是日dc新0\n丙ey 请a谢1。2ddc\n1人e1`，保护 p1 `[4,8)` | 编辑 `[0,3)→"x"` 被拆成 h1 `[0,1)` 接受 + h2 `[2,4)` 拒绝（中间的 `a` 未变）；编辑 `[20,20)` 插 `d` 被生产对在 `[21,21)`（与已有 `d` 相邻）且被拒绝 |
| R082 | 原稿 `ya0甲谢10\n在0日\neé在x的0🇨🇳在x是数`，改稿 `ya0甲。110\n在2eé在dxx的0🇨🇳在xe是数`，保护 p3 `[17,27)` | 编辑 `[16,16)→"dx"` 被拆成 h4 `[16,16)→"d"` 接受 + h5 `[17,17)→"x"` **落在保护起点被拦截**；保护文本完整保留，生产正确 |
| R111 | 原稿 `甲谢az丙🇨🇳by\n丙12a`，改稿 `甲az丙🇨🇳byy\ny丙12a`，保护 p2 `[12,16)` | 编辑 `[10,10)` 插 `y` 被生产对在 `[11,11)`（与已有 `y` 相邻）且被拒绝 |
| R115 | 原稿 `请 ebü人y\nz请的新c1是0好人`，改稿 `请 e甲bbü人y\nz请的新c1是0好人`，无保护 | 编辑 `[3,3)→"甲b"` 被拆成 h1 `[3,3)→"甲"` 拒绝 + h2 `[4,4)→"b"` 接受（已有 `b` 未变，插在它之后） |
| R119 | 原稿 `数数丁db1\n丁y甲1`，改稿 `数丁0db旧1\n1`，保护 p2 `[7,11)` | 编辑 `[0,1)` 删第一个 `数`，生产删的是 `[1,2)` 的第二个 `数`——删两个相同相邻 grapheme 中的哪一个，结果文本相同 |

结论：编辑级 oracle 只能在“编辑对齐唯一”时作期望；重复文本场景下，Hunk 级拼接才是权威核对（本套件已覆盖）。为防后人误读，检查 (9) 的记录措辞已改为明确说明这一点；另加 C13/C14 把两种对齐歧义行为显式锁定为测试（见下）。

## C 部分：14 个手写最小反例（全部通过）

| 反例 | 覆盖的不变量 | 结果 |
|---|---|---|
| C1 | 受保护段落被删除 → 整块拦截，compose 输出原稿 | 通过 |
| C2 | 端点插入被拦截 / 保护外一 grapheme 的插入仍可决定 | 通过 |
| C3 | 六种篡改（改决定/改文本/改区间/改 ID/改保护/改 revision）→ INVALID_PATCH | 通过 |
| C4 | 陈旧批准 A→B→C→B → STALE_ANALYSIS | 通过 |
| C5 | 有 pending 时导出 → PENDING_REVIEW，不出文本 | 通过 |
| C6 | setDecision 矩阵：PROTECTED_CHANGE / UNKNOWN_HUNK / STALE_ANALYSIS / 幂等 / keepRemaining | 通过 |
| C7 | 重复句按位置区分（与 F09 一致） | 通过 |
| C8 | 空改稿删除全文是原子 Hunk；与保护冲突时整块拦截，输出全文原稿 | 通过 |
| C9 | TOO_COMPLEX：`'a'×3000` vs `'b'×3000` | 通过 |
| C10 | classifyHunks 校验矩阵 | 通过 |
| C11 | grapheme 簇永不拆分 | 通过 |
| C12 | analyze 的 INVALID_INPUT 路径 | 通过 |
| C13 | 与已有相同 grapheme 相邻的插入：两种对齐都合法，决定按 Hunk 生效 | 通过 |
| C14 | 删两个相同相邻 grapheme 中的一个：结果与删哪一个无关 | 通过 |

## 验证过程中发现并修复的 oracle 自身缺陷（诚实记录）

1. **重叠判定漏零长区间**（首轮 200 组出现 60 组编辑级分歧时发现）：半开区间重叠判定漏了纯插入 Hunk `[p,p)` 与同位置纯插入编辑的重叠。已修复：oracle 增加 `candidateSpans()` + `spansOverlap()`，以改稿坐标判定关联；分歧从 60 降到 5，剩余 5 组见 B 部分。
2. **编辑时引入的语法错误**（已修复）：一次 edit 误吞了 `export interface IntervalDecision {` 的首行，导致 tsc 报错；补回首行后 `npx tsc -b` 通过。

以上两处都在验证工具（tests/oracle、tests/unit/invariants.test.ts）里，不在生产源码中。

## 驱动语义与约定（供 T011/T012 复核）

- deferred-apply：analyze 结果先暂存；下一动作需要分析时先应用（必须成功）；`cancel` 丢弃（F22，丢弃前先独立核对）；`lateResponse` 重放已清除的结果必须被拒绝（F24）；改保护后按 F19 描述的新 jobId（尾部 `-a`→`-b`）重算。
- 陈旧判定注记：T009 交接记载的“伪造会话”案例里，reducer 仅在 `revision` 单调递增时接受 `setDecision`，且 compose 也验证 analysisId；stale 判定以 revision 为准，与 decisionRevision 字段的当前值无关。
- C8 修正：空改稿删除全文是**一个原子 Hunk**；与保护冲突时整块拦截，compose 返回全文原稿，不是部分删除（测试初稿曾误写为部分删除，已纠正）。

## 未覆盖 / 不在本任务范围

- receipt 与 UI 组件未在此复核（T009 已验；本任务只验保护与合成不变量）。
- 真实浏览器里的 Worker 超时路径（1500 ms）仍未在浏览器中演练（T011 范围）。
- `docs/DEPENDENCIES.md` 仍缺 jsdom 与 jsdiff 的记录（T007/T008/T009 已知遗留，T014 更新；不在 T010 禁止修改范围之外，但本任务未改——留待 T014）。

## 交付文件

- `tests/oracle/oracle.ts` — 独立 oracle（自写 canonicalize、Node 原生 crypto SHA-256、自写 Intl.Segmenter 使用、简单拼接、独立 §8.3 分类、独立 analysisId、独立保护映射、mulberry32 PRNG；只 import `src/domain/types.ts` 的类型，不调用生产 compose/guards 生成预期）
- `tests/oracle/random-cases.ts` — 有界随机合法补丁生成器
- `tests/oracle/fixture-driver.ts` — 24 fixture 独立驱动
- `tests/unit/invariants.test.ts` — 41 个测试（A 部分 24 + B 部分 200 组随机 + C 部分 14 反例 + 结果汇总）
- `reviews/CORRECTNESS_REVIEW.md` — 本报告
- `~/workspace/evidence/P012/T010/environment.md`、`results.json`、`commands.log`、`evidence.md` — 证据（见交接文件）
- 小幅支撑改动（非生产、非金标准、非依赖）：package.json 加 `test:invariants` 脚本（T002 先例）；`tests/node-shims.d.ts` 补 `mkdirSync`/`writeFileSync` 声明（该 shim 自述即声明测试实际用到的 Node API）

## 后续

1. FIX-T010-01（F07 fixture，方案 A）由 fixture 归属方（T002 范围）决策并修复；修复后复跑三条验收命令，EP-F07 应变绿。
2. 之后派 T011（浏览器隐私与性能验证）。
