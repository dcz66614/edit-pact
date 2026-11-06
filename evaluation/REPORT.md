# P012 改稿守约 Edit Pact — 产品实验与价值报告

- 项目：P012 改稿守约 Edit Pact
- 规范版本：SPEC 1.0.0 / PLAN 1.0.0
- 协议版本：1.0.0（`evaluation/PROTOCOL.md`，冻结于 2026-11-05）
- 原型：T009 可运行原型（本地构建 `dist/`，本地优先、无模型调用）
- 报告日期：2026-11-05
- 状态：**USER_VALUE_NOT_MEASURED**
- 参与人数：**0 人**

## 结论（先说）

本轮没有测到任何真人使用价值。状态为 `USER_VALUE_NOT_MEASURED`，参与人数 0 人，
低于形成探索结果所需的最低 6 人。

**本报告不宣称任何节省时间或效果收益。** 没有数据支持“保护契约比现有方法更好、
更快或更值得用”的说法；也没有数据支持相反的说法。本报告只记录：准备了什么、
为什么没测到、以及补测需要什么条件。

## 1 为什么没测到

- 2026-11-05 当天 Sam 不在，无法招募参与者；本轮没有发送任何邀请，
  也没有任何已授权的参与者渠道处于待命状态。
- 招募须由 Sam 或经 Sam 授权后执行。本任务不得擅自对外招募，也不得用
  Coding Agent 角色扮演替代参与者——协议 §6 已明文禁止，观察数据中也没有
  任何模拟行。
- `evaluation/observations.csv` 仅含列头，0 行数据；`evaluation/results.json`
  由 `scripts/evaluate.mjs` 从该空文件算出，状态 `USER_VALUE_NOT_MEASURED`。

## 2 本轮交付了什么（已完成、可审查）

| 交付物 | 内容 |
| --- | --- |
| `evaluation/PROTOCOL.md` | 预注册协议 v1.0.0：招募（目标 8 人、最低 6 人）、4 个冻结配对任务（T1–T4，附录 A 含原文、改稿、保护区间、金标准最终稿）、AB/BA 顺序平衡、计时口径、冻结指标定义、5 条探索性继续门槛（含 6/7/8 人三种分母）、分析与状态规则、隐私与数据处理 |
| `evaluation/CONSENT.md` | 知情同意书：目的、流程、自愿与退出、记录范围、本地数据处理、风险说明 |
| `evaluation/observations.csv` | 冻结列头，0 行（空数据，状态与之一致） |
| `evaluation/results.json` | `evaluate` 的输出：状态 `USER_VALUE_NOT_MEASURED`，参与者 0 人，原因与补测方案 |
| `scripts/evaluate.mjs` | 按冻结规则计算指标、应用继续门槛、写 `results.json`；参与者 < 6 人时输出 `USER_VALUE_NOT_MEASURED`，≥ 6 人时输出 `EXPLORATORY_PASS` 或 `PRODUCT_VALUE_FAIL` |
| `scripts/evaluation-check.mjs` | 门禁检查：协议/同意书要素、观察数据合法性、结果与原始数据重算一致、报告状态一致；合法的 `USER_VALUE_NOT_MEASURED` 不使工程门禁失败 |
| `npm run evaluate` / `npm run evaluation:check` | 两条验收命令均已加入 `package.json` 并真实跑通（见 §5） |

## 3 三类证据的区分（不得互相冒充）

| 证据类 | 本轮状态 | 说明 |
| --- | --- | --- |
| 机器不变量 | 已验证（T010） | 保护、重建、陈旧批准等核心不变量经独立 oracle 验证：24 组 fixture 439 项检查仅 EP-F07 金标准期望错误（已修，41/41 通过）；200 组有界随机补丁 0 失败。**这证明的是算法正确，不是用户价值。** |
| 合成任务表现 | 已验证（fixtures / T009） | 24 组冻结样本全部通过；§11.1 样例在真实浏览器中成稿与期望逐字相同。**这证明的是合成任务上的行为，不是真人使用表现。** |
| 真人使用表现 | **未测量** | 0 名参与者。保护契约是否比 Word 比较更少漏掉不想要的改动、设置保护是否值得花 45 秒、用户是否愿意再用——**全部未知**。 |

工程验收（机器不变量、合成任务）通过，不能覆盖产品结论：产品价值仍是未测量。

## 4 补测方案

待 Sam 招募到 ≥ 6 人后执行：

1. 确认协议版本仍为 1.0.0、原型版本与冻结时一致（T009 提交）。
2. 按 `evaluation/PROTOCOL.md` §3–§5 执行：签署同意书、分配匿名编号与 AB/BA 顺序、
   完成 4 个配对任务、独立评估者按附录 A 金标准核对、记录观察。
3. 运行 `npm run evaluate -- --input evaluation/observations.csv` 计算结果，
   再运行 `npm run evaluation:check` 核对一致性。
4. 按实测结果重写本报告：≥ 6 人且 5 条门槛全过为 `EXPLORATORY_PASS`；
   任一门槛未过为 `PRODUCT_VALUE_FAIL`，并**暂停扩展和效果宣传**。

若只招到 6 或 7 人，按协议 §5 的分母规则报告（第 1 条门槛 5/6 或 6/7，
第 5 条门槛 4/6 或 5/7），不得把小样本结果写成 8 人口径。

## 5 验收命令实测

工作目录 `~/workspace/p012-edit-pact/`，Node v24.22.1：

```text
npm run evaluate -- --input evaluation/observations.csv
  → status: USER_VALUE_NOT_MEASURED, participants: 0, exit 0

npm run evaluation:check
  → evaluation:check PASS, exit 0
```

完整输出与环境记录见 `~/workspace/evidence/P012/T012/commands.log` 与 `environment.md`。

## 6 终审登记

本项在终审中登记为**非阻断限制（NON_BLOCKING）**，状态 `USER_VALUE_NOT_MEASURED`。
它不阻挡本地技术原型的工程预审，但终审不得宣称需求成立、节省时间或长期信任已获证明。
若后续补测出现 `PRODUCT_VALUE_FAIL`，须附暂停扩展决定，工程验收结论不得遮掩该产品结论。

## 附注

- 本报告不含任何参与者姓名或真实机密内容；附录任务文本全部合成。
- 本报告不含任何观察数据行；唯一的数据文件 `observations.csv` 为空（仅列头），
  与 `results.json` 的 0 参与者一致。
