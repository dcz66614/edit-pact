# P012 改稿守约 Edit Pact — 环境记录（T001）

实测环境：Muse 云端 VM（Linux）。Windows 未实测，记为 NOT_TESTED。

## 实测版本（2026-11-05 18:35–18:36 GMT）

| 项目 | 精确版本 |
| --- | --- |
| OS | Linux htch-runtime 7.0.0-39-generic x86_64（GNU/Linux） |
| CPU | AMD EPYC 9D25 126-Core Processor；本 VM 可见 4 vCPU（`nproc` = 4） |
| 内存 | 总计 7934 MB；T001 执行期间可用内存约 495–898 MB，空闲约 165 MB（VM 长期处于高内存占用，需注意） |
| Node.js | v24.22.1（`.nvmrc` 锁定 24.22.1；`package.json` engines 要求 >= 24.0.0） |
| npm | 10.9.4 |
| Python | 3.12.3（仅作环境记录，未用于构建） |
| 浏览器 | Google Chrome for Testing 156.0.8078.4（Playwright 缓存 chromium-1248 与 chromium_headless_shell-1248，`~/.cache/ms-playwright/`） |
| Playwright | @playwright/test 1.64.1（与缓存浏览器同代，已核对） |

## 复现步骤

```bash
node --version   # v24.22.1
npm --version    # 10.9.4
npm ci           # 依据 package-lock.json 精确安装，exit 0
npm run typecheck  # tsc -b，exit 0
npm run build      # tsc -b && vite build，exit 0，产物在 dist/
npm run serve -- --port 4173  # 仅绑定 127.0.0.1，exit 0（Ctrl+C 停止）
```

`npm run gate` 依次跑 typecheck → build → test，全部通过后打印
`[gate] all steps passed`。

## 注意事项

- 本机服务 `scripts/serve.mjs` 只绑定 127.0.0.1，不接受 POST/PUT
  等写入方法，不提供上传接口；`--port` 之外不接受 `--host` 参数，
  无法通过命令行改成 0.0.0.0。
- 构建产物 `dist/` 内含两个 URL 字面量（`http://www.w3.org`、
  `https://reactjs.org`），均为 React 源码内的字符串常量（SVG
  命名空间与文档链接），不发起任何网络请求；T001 离线探针已证实
  页面加载的 3 个请求全部为 `http://127.0.0.1:4173` 本地请求，
  外部请求 0 个。见 `~/workspace/evidence/P012/T001/offline-probe.log`。
- Windows：NOT_TESTED。本 VM 为 Linux，按项目书 §10 以该 Linux
  为首个必测环境。
- `npm ci` 与 `npm install` 的包计数相差 1（102 vs 101），为
  平台可选依赖计数差异，锁文件解析版本一致，无影响。
