/**
 * P012 改稿守约 Edit Pact — T001 质量门。
 * 依次运行类型检查、构建、单元测试；任一步失败即停止并以
 * 非零退出码退出。用法：node scripts/gate.mjs
 */
import { execSync } from 'node:child_process'

const STEPS = [
  ['typecheck', 'npm run typecheck'],
  ['build', 'npm run build'],
  ['test', 'npm run test'],
]

for (const [name, command] of STEPS) {
  console.log(`[gate] step: ${name} — ${command}`)
  try {
    execSync(command, { stdio: 'inherit' })
  } catch {
    console.error(`[gate] FAILED at step: ${name}`)
    process.exit(1)
  }
}
console.log('[gate] all steps passed')
