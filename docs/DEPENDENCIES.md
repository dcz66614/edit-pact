# P012 改稿守约 Edit Pact — 依赖记录（T001）

选择依据：项目书 §10 要求“优先复用已验证的受维护 Node LTS 与
同代兼容前端版本”。以下版本全部取自 P011（同一 VM、同一 Node
版本下已验证可构建、可测试、可 E2E 运行）的锁文件解析版本，并在
本任务中重新安装、重新锁定、重新跑通验收命令。`package.json`
中一律写精确版本（无 `^`/`~` 浮动范围），`package-lock.json`
（lockfileVersion 3，74,343 字节）为唯一安装依据；后续一律
`npm ci`，禁止生产安装 latest，禁止浮动 CDN 与运行时拉取字体。

## 运行时依赖

| 包 | 精确版本 | 用途（T001 阶段） |
| --- | --- | --- |
| react | 18.3.1 | UI 框架（仅渲染 T001 外壳） |
| react-dom | 18.3.1 | DOM 渲染；`react-dom/server` 用于外壳冒烟测试 |
| zod | 3.25.76 | 契约校验（T002 起用；T001 仅锁定版本，不写规则） |
| diff | 9.0.0 | 精确文本比较：grapheme 切分后 `diffArrays` 严格相等（T004 引入并锁定，BSD-3-Clause；`node_modules/diff/LICENSE` 已核对，见 T011；完整许可证正文随发布包交付，见 `THIRD_PARTY_NOTICES.md`，FIX-R1 P1-02） |
| scheduler | 0.23.2 | 任务调度：react-dom 的传递依赖，实际打包进生产 JS（FIX-R2 P2-09 按产物内容审计确认；MIT，`node_modules/scheduler/LICENSE` 已核对，完整正文见 `THIRD_PARTY_NOTICES.md`） |

## 传递依赖（实际打包情况；FIX-R2 P2-09）

- 生产依赖树（`package-lock.json`）共 7 个包：diff、js-tokens、
  loose-envify、react、react-dom、scheduler、zod。是否打包以构建产物
  为准（可复现：`node scripts/audit-bundled-deps.mjs`）。
- 实际打包进生产 JS 的 5 个：diff、react、react-dom、scheduler、zod，
  许可证正文全部见 `THIRD_PARTY_NOTICES.md`。
- 未打包的传递依赖：loose-envify（react / react-dom / scheduler 的依赖；
  Vite 以 define 把 `process.env.NODE_ENV` 替换为 `"production"` 并
  tree-shake 掉，产物内无其标识）、js-tokens（只供 loose-envify 自身构建
  工具使用，不随运行时发货，产物内无其标识）。object-assign 未安装。
- 教训：只看直接导入链会漏传递依赖（FIX-R1 漏了 scheduler），许可证
  清单必须以产物内容审计为准。

## 开发依赖

| 包 | 精确版本 | 用途 |
| --- | --- | --- |
| @vitejs/plugin-react | 4.7.0 | Vite 的 React 插件 |
| typescript | 5.9.3 | 类型检查与构建（`tsc -b`） |
| vite | 5.4.21 | 开发与生产构建 |
| vitest | 2.1.9 | 单元测试运行器 |
| @playwright/test | 1.64.1 | 浏览器 E2E；与缓存的 Chromium 156.0.8078.4 同代 |
| @types/react | 18.3.31 | React 类型 |
| @types/react-dom | 18.3.7 | React DOM 类型 |
| jsdom | 31.0.0 | 组件单元测试的 DOM 环境（T007 引入并锁定，`--save-exact`） |

## 暂未引入的依赖

- 任何 CSS 框架、图标库、字体包：未引入；外壳只用系统字体栈。
- `@testing-library/*`：未引入；外壳冒烟测试直接用
  `react-dom/server` 的 `renderToString`，不新增依赖。

## 锁文件

- `package-lock.json` 由本次 `npm install --no-audit --no-fund`
  生成，`npm ci` 已验证可据此精确复现（exit 0）。
- 验收后升级依赖被禁止；后续任务如需新增依赖，须单独说明并
  重新锁定。
