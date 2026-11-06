/**
 * P012 改稿守约 Edit Pact — T001/§10 固定工程门禁（FIX-T013-02 补建）。
 *
 * 来源：实施计划 §10。子命令严格固定为 typecheck、fixtures:check、
 * test、test:invariants、build、test:e2e、test:privacy、benchmark、
 * evaluation:check，按此顺序串行运行；npm ci 在外层运行，不在此列。
 * verify 不调用自己，不调用 release:pack 或 release:verify。
 * 任一工程命令非零立即停止并以非零退出码退出；各子命令输出直接透传，
 * 日志即本进程输出。
 *
 * 用法：npm run verify
 */
import { execSync } from 'node:child_process';

const STEPS = [
  ['typecheck', 'npm run typecheck'],
  ['fixtures:check', 'npm run fixtures:check'],
  ['test', 'npm run test'],
  ['test:invariants', 'npm run test:invariants'],
  ['build', 'npm run build'],
  ['test:e2e', 'npm run test:e2e'],
  ['test:privacy', 'npm run test:privacy'],
  ['benchmark', 'npm run benchmark'],
  ['evaluation:check', 'npm run evaluation:check'],
];

for (const [name, command] of STEPS) {
  console.log(`[verify] step: ${name} — ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    console.error(`[verify] FAILED at step: ${name}`);
    process.exit(1);
  }
}
console.log('[verify] all steps passed');
