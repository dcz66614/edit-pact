# 改稿守约 Edit Pact（P012）

在把文字交给 AI 润色之前，先选出必须逐字保留的段落；改稿回来后逐项决定接受哪些变化。最终文本只由原稿和获准的改动重新组成——触碰受保护段落的改动不会进入最终稿。

- 本地小工具，可断网使用；不调用任何模型接口，不需要账号、GPU 或训练数据。
- 不发送任何内容：原稿、改稿、决定只留在本机浏览器内存里，不写入 localStorage，不上传。
- 首版面向 300–2,000 字中文通知、客户说明和工作邮件。

**状态：READY_FOR_FINAL_REVIEW（已冻结待终审，未通过终审，不标 ACCEPTED）。**
规格 SPEC 1.0.0；应用版本 0.1.0；冻结包见 `edit-pact-source.zip`（SHA-256 见 `SHA256SUMS.txt`）。

## 快速开始（只用成品，不开发）

成品在发布包的 `edit-pact-dist.zip` 里，解压即为可运行目录，不需要 `npm install`。包内自带启动文件 `serve.mjs`（只绑定 127.0.0.1，只读 GET/HEAD）。

### Windows（PowerShell）

```powershell
# 1. 解压 edit-pact-dist.zip，例如解到 C:\edit-pact
# 2. 进入目录并启动（只监听本机 127.0.0.1）
cd C:\edit-pact
node serve.mjs --port 4173
# 3. 浏览器打开 http://127.0.0.1:4173
# 4. 停止：按 Ctrl+C
```

需要 Node.js 24+（`node --version` 应为 v24.x）。Windows 本版本未实测，记为 NOT_TESTED——若在 Windows 上跑不起来，请按上文贴出 `node --version` 与报错原文。

### 云端 VM（Linux，实测环境）

```bash
unzip edit-pact-dist.zip -d ~/edit-pact
cd ~/edit-pact
node serve.mjs --port 4173
# 浏览器打开 http://127.0.0.1:4173
# 停止：按 Ctrl+C
```

`serve.mjs` 只绑定 127.0.0.1，只读 GET/HEAD，不接受上传与业务接口；静态根目录就是解压后的成品目录本身。

## 从源码开发（需要依赖）

```bash
npm ci            # 依据 package-lock.json 精确安装
npm run dev       # 开发服务器 http://127.0.0.1:5173
npm run verify    # 完整工程门禁（§10，9 条子命令串行）
npm run release:pack    # 生成冻结发布包（见 docs/RELEASE_GUIDE.md）
npm run release:verify  # 校验发布包完整性
```

## 使用流程

1. **准备**：粘贴原稿，勾选必须逐字保留的段落（可填修改目标，如“语气更温和”——目标只生成可选说明，不参与保护计算）。
2. **改稿**：点“复制改稿说明”，自行去你常用的 AI 助手处理；应用不发送任何内容。
3. **比较**：粘贴改回来的稿子，点比较。应用逐项列出差异：受保护段落的改动标为“已阻止”，其余改动逐项接受/保留。
4. **成稿**：无待审项后合成最终文本，可下载 TXT、复制、查看回执（回执只含版本、哈希、区间与计数，不含正文）。

关键保证：

- 原稿、改稿或保护范围一变，旧的批准立即失效，必须重新审阅。
- 接受后又撤回，旧的成稿立即作废，不可再下载、复制或配新回执。
- 输入法组合输入尚未结束时，不冻结、不比较。
- 文字保留不代表语义或事实已经核查——最终全文请自行再读一遍。

## 隐私

- 全程零外部请求（断网冷启动已验证）；不写 localStorage / sessionStorage / cookie / IndexedDB；清空后无残留。
- 日志只记错误码、时长、计数、版本，不记正文。截图与测试材料只用合成数据。
- 回执不含正文，不可单独重建全文，不能证明模型输出为真。

## 已知限制（不回避）

- **真人价值未测量**：产品实验 T012 结论为 `USER_VALUE_NOT_MEASURED`（0 名参与者；协议、同意书与评估脚本已冻结，待招募 ≥6 人后按协议补测）。本项目不宣称任何节省时间或效果收益。
- **Windows NOT_TESTED**：本 VM 无 Windows 测试条件。
- **1,500 ms 超时路径为演练**：生产 Worker 算法预算 800 ms，合法输入无法让真实 Worker 超过 1,500 ms；超时路径用生产 DiffWorkerClient + 真实浏览器 Worker（仅响应时机被桩）演练，方法已如实记录（见 T011 证据）。

## 许可证

MIT，见 `LICENSE`（Copyright (c) 2026 Chengze Du）。第三方运行时依赖的许可证通知见 `THIRD_PARTY_NOTICES.md`（含 diff@9.0.0 BSD-3-Clause 完整正文与 react / react-dom / zod MIT 完整正文，随源码包与成品包一同交付）；依赖许可证见 `docs/DEPENDENCIES.md`。

## 规格与证据

- 规格：`PROJECT_BOOK.md`（SPEC 1.0.0）、`IMPLEMENTATION_PLAN.md`、`IDEATION_REPORT.md`。
- 审查：`reviews/CODE_REVIEW.md`（T013 独立审查）、`reviews/OPEN_ISSUES.md`（3 P1 + 8 P2 修复状态，见 `handoffs/P012-FIX-T013.md`）、`reviews/CORRECTNESS_REVIEW.md`（T010）、`reviews/PRIVACY_REVIEW.md`（T011）。
- 实验：`evaluation/PROTOCOL.md`、`evaluation/REPORT.md`（结论：未测到真人价值）。
- 发布流程：`docs/RELEASE_GUIDE.md`。
