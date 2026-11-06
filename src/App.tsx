/**
 * P012 改稿守约 Edit Pact — 应用入口（T009 接管 T001 骨架壳）。
 * 业务工作台见 src/app/EditPactApp（准备 → 比较 → 审阅 → 成稿 →
 * 导出/清空）。本文件只挂载，不含业务逻辑。
 */
import { EditPactApp } from './app/EditPactApp';

export function App() {
  return <EditPactApp />;
}
