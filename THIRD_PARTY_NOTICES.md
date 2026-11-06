# P012 改稿守约 Edit Pact — 第三方许可证通知（FIX-R1，P1-02）

本文件随源码包（`edit-pact-source.zip`）与成品包（`edit-pact-dist.zip`）
一起交付。成品包是生产构建产物：下面列出的第三方运行时依赖的代码
已被打包进生产 JavaScript（`assets/index-*.js` 与 `assets/diff.worker-*.js`），
因此其许可证通知必须随成品一起交付，而不只记录许可证类型。

## 核查方法（实际打包进生产 JS 的第三方运行时依赖）

- 判定依据是产物内容审计（FIX-R2 P2-09 修正了 FIX-R1 的方法）：
  FIX-R1 只按直接导入链审计，漏了 react-dom 的传递依赖 scheduler——
  它实际打包进生产 JS，却未被单独列入。教训：直接依赖表不等于打包
  集合，必须到构建产物里逐个核对。
- 本次审计方法（可复现：`npm run build` 后跑
  `node scripts/audit-bundled-deps.mjs`）：先从 `package-lock.json`
  枚举生产依赖树（含传递依赖，不含开发依赖），再到构建产物
  （`dist/assets/index-*.js` 与 `dist/assets/diff.worker-*.js`）里
  用标识逐个核对是否真的打包进去：react（`createElement`、
  `ReactCurrentOwner`）、react-dom（`createRoot`、
  `useSyncExternalStore`）、scheduler（`MessageChannel`、
  `unstable_scheduleCallback`）、zod（`ZodError`）、diff（jsdiff
  内部函数名 `extractCommon`、`buildValues`、`removeEmpty`；另有
  静态导入链 `src/core/diff.ts` → `src/workers/diff.worker.ts` 与
  E2E §11.1 在真实 Worker 内跑通精确比较作为行为证据）。
- 未打包的传递依赖同样核对产物确认缺席：loose-envify（react /
  react-dom / scheduler 的依赖；Vite 以 define 把
  `process.env.NODE_ENV` 替换为 `"production"` 并 tree-shake 掉，
  产物内无其标识）、js-tokens（只供 loose-envify 自身构建工具使用，
  不随运行时发货，产物内无其标识）。object-assign 未安装，无需列入。
- 开发依赖（`@vitejs/plugin-react`、`typescript`、`vite`、`vitest`、
  `@playwright/test`、`@types/react`、`@types/react-dom`、`jsdom`）只在
  构建与测试时使用，**没有**被打包进生产 JavaScript，不在本文件收录；
  其许可证见 `docs/DEPENDENCIES.md` 与各自的 `node_modules/<包>/LICENSE`。
- 版本与许可证均取自本次冻结的 `package.json` / `package-lock.json`
  锁定的发行包；许可证正文逐字复制自 `node_modules/<包>/LICENSE`，
  由 `scripts/audit-bundled-deps.mjs` 核对逐字节一致。

## 1. diff（jsdiff）9.0.0 — BSD 3-Clause License

- 用途：精确文本比较（`diffArrays` 严格相等），代码位于
  `assets/diff.worker-*.js`（Worker 内比较）与主线程分析路径。
- 许可证：BSD-3-Clause。
- 正 文（逐字复制自 `node_modules/diff/LICENSE`）：

```
BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 2. react 18.3.1 — MIT License

- 用途：UI 框架，代码位于 `assets/index-*.js`。
- 许可证：MIT。
- 正文（逐字复制自 `node_modules/react/LICENSE`）：

```
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 3. react-dom 18.3.1 — MIT License

- 用途：DOM 渲染，代码位于 `assets/index-*.js`。
- 许可证：MIT。
- 正文（逐字复制自 `node_modules/react-dom/LICENSE`；与 react 的许可证
  正文逐字节相同）：

```
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 4. zod 3.25.76 — MIT License

- 用途：契约校验，代码位于 `assets/index-*.js` 与
  `assets/diff.worker-*.js`。
- 许可证：MIT。
- 正文（逐字复制自 `node_modules/zod/LICENSE`）：

```
MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 5. scheduler 0.23.2 — MIT License

- 用途：任务调度（react-dom 的传递依赖），代码位于 `assets/index-*.js`。
- 许可证：MIT。
- 正文（逐字复制自 `node_modules/scheduler/LICENSE`；FIX-R2 P2-09 补列：
  FIX-R1 只按直接导入链审计，漏了该传递依赖；本次按产物内容重审确认
  其代码实际打包进生产 JS）：

```
MIT License

Copyright (c) Facebook, Inc. and its affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
## 本项目自身的许可证

本项目代码为 MIT 许可证，见 `LICENSE`（Copyright (c) 2026 Chengze Du）。
本文件只收录第三方依赖的许可证通知，不改变本项目的许可证。
