/**
 * 最小本地环境声明（T002 测试专用）。
 *
 * 原因：本项目刻意不把 @types/node 列为依赖（T002 禁止修改
 * package.json 与锁文件；T001 锁定的依赖集不含它），而 schema.test.ts
 * 需要读取磁盘上的 fixture 文件做结构核对。本文件只声明测试实际用到
 * 的几个 Node 内置 API，不替代完整的 @types/node；若后续任务引入
 * @types/node，应删除本文件并改用官方类型。
 * 本文件不是业务代码，不进入构建产物（typecheck 仅做类型检查）。
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { size: number };
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
  export function writeFileSync(path: string, data: Uint8Array): void;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:crypto' {
  export interface Hash {
    update(data: string, encoding: string): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
}

/** T011 补充：仅声明测试用到的 process.env（不引入 @types/node）。 */
declare const process: {
  env: Record<string, string | undefined>;
};
