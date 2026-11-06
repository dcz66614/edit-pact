# P012 改稿守约 Edit Pact — 兼容性记录（T011）

- 记录时间：2026-11-05 20:39–20:55 GMT
- 结论：当前 VM（Linux）上的 Chromium 156 实测通过；Windows 无实测条件，
  标 NOT_TESTED，不伪造跨平台通过。

## 1. 实测环境（本次验证的唯一环境）

| 项目 | 实测值 |
| --- | --- |
| 操作系统 | Linux x86_64（云 VM，`uptime` 约 1 小时，期间无重启） |
| Node.js / npm | v24.22.1 / 10.9.4 |
| Playwright | 1.64.1（Chromium 156.0.8078.4，`chromium-1248`） |
| 浏览器 | Chromium 156.0.8078.4（无头模式，Playwright 驱动） |
| 内存 | 8 GB（测试期间可用约 0.9–1.5 GB，紧张但未 OOM） |
| 服务方式 | `node scripts/serve.mjs`（仅绑定 127.0.0.1，端口 4173/4175） |
| 构建产物 | `dist/index.html` + `assets/index-*.js/css` + `assets/diff.worker-*.js`（哈希见证据 environment.md） |

## 2. 浏览器与视口

| 检查 | 结果 |
| --- | --- |
| Chromium 156，1,280×800 | 通过。§11.1 全流程、审阅三栏、导出、清空、取消、键盘、IME 守卫全部通过（`tests/e2e/user-flow.spec.ts`，17 个 E2E 测试中的相应用例） |
| Chromium 156，390×844 | 通过。无横向溢出（`scrollWidth - clientWidth ≤ 1`），核心按钮可见，成稿与 §11.1 期望一致。截图 `review-390px.png` / `result-390px.png` |
| 其他浏览器（Firefox / WebKit / Chrome 正式版） | 未测。Playwright 只装了 Chromium；本项目无跨浏览器矩阵要求，T013 可视需要扩展 |
| 真实用户浏览器（带扩展、非无头） | 未测 |

## 3. 键盘与输入法

- 纯键盘：全程只用 Tab / Space / Enter 可完成 §11.1（勾选保护、开始比较、
  逐项采用、成稿与期望一致），见 `tests/e2e/user-flow.spec.ts`“纯键盘流程”。
- IME：组合输入中“开始比较”被禁用并有明确提示（“输入法组合输入尚未结束，
  请先完成输入。”）；组合结束后恢复，比较正常进行。测试派发真实 DOM
  CompositionEvent（compositionstart/update/end）模拟；Playwright 无法驱动
  真实输入法，未用真实拼音输入法验证——见“未覆盖”。
- 取消比较：比较中点“取消比较”回到准备页，原稿/改稿/保护完整保留。
  测试用路由延迟 Worker 脚本加载 2 s 以稳定拿到取消窗口（见证据 evidence.md）。

## 4. 离线

- 全新浏览器上下文 + 拦截全部非 loopback 请求：冷启动成功，§11.1 全流程
  完成，被拦截请求数为 0（应用根本不发外部请求）。
- 不用 `setOffline` 后靠旧页面缓存操作作为唯一离线证据（任务卡明确要求）。
- 成品离线启动不应要求重新 `npm install`；开发重建所需依赖另列（项目书 §8）。

## 5. 性能（EP-P01，真实 Chromium + 生产包）

- 样本：EP-P01（20 行各 99 个 CJK 字符，共 2,000 UTF-16 单元；每行 5 处
  替换，共 100 处；保护第 4、8、12、16、20 行），哈希与 T002 冻结值一致。
- 方法：5 次预热 + 30 次正式测量；计时从点击比较前取 `performance.now()`，
  到审阅面板出现后下一个 `requestAnimationFrame` 止；P95 取升序第 29 个值。
- 三次独立运行（每次 30 个正式测量，全部保留，无删样本）：
  P50 147.0/137.1/138.5 ms，P95 221.5/198.5/196.6 ms，max 272.7/220.8/269.5 ms，
  预算 500 ms，全部 PASS。
- 大输入失败路径：Worker 1,500 ms 终止预算实测 1,501.7 ms（页面内计时）
  / 1,507 ms（墙钟）后返回 TOO_COMPLEX，UI 恢复（状态就绪）在 1,800 ms
  上限内。方法说明：生产 Worker 的算法预算为 800 ms，合法输入无法让真实
  Worker 超过 1,500 ms，因此超时路径用生产 DiffWorkerClient + 真实浏览器
  Worker（Blob URL，唯一被桩的是响应时机）演练；陈旧结果丢弃与取消亦同
  法验证。详见 `tests/e2e/worker.spec.ts` 与证据 `worker-timeout-1500ms.json`。

## 6. Windows：NOT_TESTED

- 本 VM 为 Linux，无 Windows 实测条件。以下均未在 Windows 上验证：
  PowerShell 解压/启动/关闭步骤、默认浏览器行为、文件导入对话框、
  剪贴板权限提示、中文输入法组合事件。
- 不伪造跨平台通过。T014 发布前如需 Windows 证据，须在真实 Windows
  环境重跑 `npm run build`、`test:e2e`、`test:privacy`、`benchmark`。

## 7. 未覆盖

1. 真实拼音输入法（非合成 CompositionEvent）未验证。
2. Firefox / WebKit / Chrome 正式版未测。
3. 剪贴板失败回退分支未在拒绝授权的上下文中触发（见 PRIVACY_REVIEW.md）。
4. 超限文件导入（>100 KiB / 非 UTF-8）未在浏览器中重复测。
5. 长时间运行 / 多次重复比较后的内存增长未测（单次流程无异常；VM 内存
   长期紧张，测试期间可用约 0.9–1.5 GB）。
