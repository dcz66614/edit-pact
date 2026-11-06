# P012 改稿守约 Edit Pact 项目书

P012 · Edit Pact · SPEC_VERSION 1.0.0 · 2026-11-05

状态：FORMALLY_SELECTED / SPECIFICATION。本文冻结本轮第 1 名的原型规格；产品尚未施工、尚未验收。作者为 Agent Project Factory 创意与架构角色，执行负责人为 Muse，施工和修复由 Muse 已实测可用的免费 Coding Agent 承担。

## 1 项目决定与用户价值

中文运营编辑把活动通知交给 AI 润色后，常常需要重新核对已经确认的日期、人数、适用条件和承诺措辞。即使提示“其他内容保持不变”，用户仍然无法仅凭这句话知道哪些地方被改过。

改稿守约帮助用户在改稿前选出必须逐字保留的段落，在改稿后逐项决定接受哪些变化。最终文本从原稿和获准改动重新组成；触碰受保护段落的改动不会进入最终稿。产品提供的是一项具体的文本控制能力，真实含义、事实正确性及未被保护的上下文仍需用户判断。

首版面向 300–2,000 字中文通知、客户说明和工作邮件。它是一个可断网使用的本地小工具，不要求更换 AI 助手，也不要求模型接口、账号、GPU 或训练数据。成功标准是用户能更少漏掉不想要的改动，同时总核对时间不增加。

项目中文名：改稿守约。英文名：Edit Pact。slug：edit-pact。正式目录：agent project auto/P012-edit-pact/。

## 2 研究依据与去重

### 2.1 已读取材料

本轮已真正读取工厂总索引正文、P011 项目书全文、P011 实施计划全文及 P011 文件夹的直接子目录列表。P011 的两个 DOCX 仅取得文件元数据，未据此声称已检查排版或源代码。未审阅既有项目的发布源码，本轮不重新评定任何历史项目是否通过终审。

- FACTORY_INDEX.md：https://drive.google.com/file/d/1qHHIqtkjZMd96A7mcTOCmDhUhcxSZO_n/view
- P011 PROJECT_BOOK.md：https://drive.google.com/file/d/1CAp3qQHUBVRo2n4aoWFUFV-Wkioj5wSh/view
- P011 IMPLEMENTATION_PLAN.md：https://drive.google.com/file/d/1vcOZK32zFA9tbuNfc40Ss_H0yLO-IGSG/view
- P011 文件夹：https://drive.google.com/drive/folders/1Nz2nVW-LYv6NxxiOrxM-vZsNc4XrAdHO

本文沿用 P011 的版本标识、编号章节、固定契约、原子任务交接和终审证据组织方式。旧手册中的“每轮另开终审对话”与当前用户指令冲突时，以当前指令为准：在本 P012 立项对话完成终审，超过 5 轮仍未通过才带完整历史进入续审对话。

### 2.2 排除的既有主题

| 既有项目 | 已知核心范围 | 本项目的边界 |
| --- | --- | --- |
| P0001 TopoTide | 地貌与拓扑 | 不处理地理或拓扑数据 |
| P0002 ShardLens | Reed–Solomon 纠删码恢复 | 不做数据恢复或有限域实验 |
| P0006 NoiseScope | 随机反应与分布 | 不做化学或随机过程仿真 |
| P0007 FocusWitness | 计算光学与像差反演 | 不做图像反演 |
| P0008 JoinWitness | SQL JOIN 倍增与数据质量 | 不做表关联或账目归因 |
| P0009 TimeFold | 时区歧义与重复日程 | 文本中的日期只作为文字，不做时间计算 |
| P010 GainFront | 音频 DSP 与响度 | 不处理声音 |
| P011 Context Capsule | 七栏对话交接、规则提取、确认、导出 | 不总结对话、不管理长期记忆、不续接会话 |
| 额外排除 | AlphaSentinel、Silicon CSI、既有技术情报方向 | 不重新提出财务审计、半导体取证或趋势平台 |

P012 的工作单位是一对短文版本和一次修改授权，P011 的工作单位是跨会话交接信息。二者可能同样采用本地网页与人工确认，这些是通用实现方式，核心问题与成功指标不同。

### 2.3 可核查的外部依据

Microsoft 的人机交互指南把纠错、用户控制和长期互动列为设计问题。[R1] Word 的比较与修订、editGPT 的逐项采纳、DocWriter 的本地审阅工作流已存在。[R2–R4] 因此，差异视图、逐项确认、本地运行均不能单独被包装为新发明。

进一步核查发现，Word 已支持局部可编辑区域，QuillBot 与 PrecisionWrite 已公开介绍冻结词句或段落，inline-scribe 已实现本地差异审阅和仅应用已接受项。[R11–R14] 本项目的组合差异是：针对跨助手复制粘贴流程，事先选定不可改段落，在结果合成层强制保留原文，授权失效时重新审阅，并完全脱离特定模型运行。本轮公开资料未确认竞品是否已具备完整相同组合，不能宣称独占。新颖性保守评为 2/5，属于值得验证的工作流组合。

认知促发研究发现减少过度依赖与增加操作负担可能同时发生。[R5] 本项目据此把设置耗时、总完成时间与放弃率列入验证，不能仅用“用户觉得更安心”宣告产品有效。

## 3 目标用户与痛点假设

### 3.1 首要用户

首要用户是每周至少三次使用聊天式 AI 改写通知或客户说明、需要保留已确认信息的中文运营编辑。典型场景是工作日下午在 Windows 笔记本上，一边打开聊天页，一边整理即将发出的活动通知。次要用户是课程运营和小型社群组织者。首版不为长篇论文、代码、复杂排版或专业诊断设计。

### 3.2 待验证的痛点

下列数值是招募筛选与排期假设，未进行真人访谈，不是人口统计或现成实验结果。

| 维度 | 假设与需采集的证据 |
| --- | --- |
| 频率 | 每周 3–6 次短文改稿；访谈要求回忆最近一次并提供脱敏前后稿 |
| 强度 | 4/5；需要用户说明出错后果，不能由研究员代填 |
| 单次代价 | 全文复核 5–12 分钟，漏改后返工另计 |
| 现有办法 | 提示“其他不变”、另存旧稿、Word 比较、肉眼逐句检查 |
| 现有办法不足 | 提示不能证明遵守；普通差异工具不直接表达本次哪些段落禁止采纳 |
| 采用成本 | 多一次往返粘贴、圈定保护范围、逐项决定；同样需要实际测量 |

每周 3–6 次乘以每次 5–12 分钟，对应 15–72 分钟的情景成本区间；这只是输入假设的运算。八个入围方案的产品 Confidence 统一设为 40%，不得因有相关论文就上调为已验证需求。

### 3.3 三透镜初筛

合意性：存在可描述的失败时刻，能找到具体角色与当前替代办法；尚需证明用户愿意多开一个工具。

可行性：输入是两段文本和明确的保护范围，核心保证可用确定性计算验证，8 人日实现与 2 人日缓冲的目标合理。

生存性：原型可以零模型费用长期运行，不依赖平台页面结构或付费账号；维护对象有限。此处指独立小工具能持续维护，未证明用户付费意愿，也不据此制定订阅业务。

若真人比较中多数人继续选择原方法且没有可量化漏改收益，则缩减为内部工具或停止扩展，不能用增加功能掩盖差异不足。

## 4 核心机制与完整使用流程

用户先粘贴原稿，点击一至三个必须保留的段落，再将自己现有 AI 助手给出的改稿贴回来。工具显示每项变化以及是否触碰保护段，用户逐项接受或保留原文，最后复制合成结果。

流程固定为：

1. 输入原稿，确认只处理纯文本与换行。
2. 选择必须逐字保留的段落，可填写一句修改目标。
3. 可选复制改稿说明，然后自行去现有助手处理；应用不发送任何内容。
4. 粘贴改稿并比较。
5. 审阅允许范围内的变更；受保护变更直接保留原文并显示原因。
6. 处理全部待审项，或明确选择“其余保留原文”。
7. 阅读完整结果，复制或下载成稿；可另外下载不含正文的审阅回执。
8. 选择“清空本次内容”结束会话。

首版只保护整段。界面中的“段”明确指两个换行符之间的一行非空文本；自动折行不创建新段。为保持两周范围，不做任意字符拖选保护。用户要调整段落边界时，先在原稿中自行换行，再开始本轮审阅。

## 5 目标与非目标

### 5.1 必须实现

- 原稿、改稿、最终稿均可清楚查看。
- 用户能看清自己选定的受保护原文，并能解除或删除保护设置。
- 保护段对应的原文在本轮最终稿中逐字保留，符合第 8 节的精确范围定义。
- 只有本轮有效授权的变更进入最终稿；待审项不能被悄悄接受。
- 输入、保护范围变化后，旧的接受决定失效。
- 核心流程可在断开外网的本机浏览器中完成。
- 中文界面、键盘操作、普通桌面窗口可用。

### 5.2 明确不纳入首版

不做自动事实核查、真实性评分、语义等价判断、自动识别人名金额等敏感信息、聊天记录抓取、浏览器扩展、模型调用、账号、云端同步、长期记忆、多人协作、富文本 DOCX 编辑、PDF 导入、自动发送、医学诊断或金融建议。

产品不会阻止外部 AI 改写。保护作用发生在本工具构造最终文本时。用户手工复制 AI 原始改稿，或在导出后继续编辑文件，不属于本轮保护范围。

## 6 功能需求与优先级

| ID | 需求 | 优先级 | 可观察的完成条件 |
| --- | --- | --- | --- |
| FR01 | 粘贴或载入 UTF-8 TXT/MD 原稿与改稿 | P0 | 完整展示有效输入，越限有明确错误 |
| FR02 | 按换行显示段落，选择保护段 | P0 | 范围与原文对应；空白段不可选 |
| FR03 | 生成可选改稿说明 | P1 | 只复制用户当前看到的内容，不自动发送 |
| FR04 | 精确文本比较 | P0 | 每项变更有原位置、旧文、新文和类型 |
| FR05 | 保护冲突判定 | P0 | 触碰保护范围的变更不可接受 |
| FR06 | 逐项接受或保留原文 | P0 | 状态立即反映到列表与计数，无默认批量接受 |
| FR07 | 其余保留原文 | P0 | 明确把待审项转为保留原文，结果可解释 |
| FR08 | 授权失效与重算 | P0 | 任一相关输入变化清除旧决定 |
| FR09 | 确定性结果合成 | P0 | 从原稿应用合法变更，拒绝陈旧分析 |
| FR10 | 最终稿复制和 TXT 下载 | P0 | UTF-8、LF 换行，内容与屏幕预览一致 |
| FR11 | 审阅回执 JSON | P1 | 只有哈希、数量、区间和状态，无正文 |
| FR12 | 全部清空 | P0 | 页面、Worker 和导出对象不再引用旧正文 |
| FR13 | 取消比较与超时处理 | P0 | 取消后不接收迟到结果，界面仍可操作 |
| FR14 | 无外网依赖 | P0 | 核心操作仅使用本地资源，无外部请求 |
| FR15 | 可访问的中文界面 | P0 | Tab 可操作核心按钮，状态不只依赖颜色 |

P1 为本次计划内功能，但不得挤占 P0 的正确性。若排期紧张，仅可在规范版本更新、明确记录影响后删减 P1；不能由施工会话静默跳过。

## 7 UI 与交互规格

### 7.1 页面结构

采用单页三步骤工作台：准备原稿、核对改动、复制成稿。桌面宽度至少 1,024 CSS px；1,280 × 800 为必须验证的演示尺寸。低于 768 px 时改为逐步单栏，保留核心功能，不在两周内承诺手机端精细文本选择。

页面顶部显示名称、当前步骤和“内容仅在本页处理”说明。主操作使用深蓝，普通文字深灰，冲突使用琥珀色和“保留原文”文字；不得用盾牌或绿色百分比暗示事实已核实。

准备页左侧为原稿编辑区，右侧为按段列出的保护清单。每段有复选框、段号和全文；过长内容可展开但不省略成无法辨认的片段。最多 20 段保护。修改目标为可选输入，最多 120 UTF-16 单元。

核对页左侧为原稿与保护标记，中间为变更列表，右侧在有 pending 时显示审阅计数和“处理完剩余项后生成全文”，不生成混合状态的成稿。pending 清零后调用 compose，右侧才显示完整成稿预览。宽度不足时使用上下结构。变更条目展示“原稿第几段”、删除文字、新增文字、“采用这处修改”和“保留原文”。纯插入在相邻位置展示上下文。

触碰保护段的条目显示“这处修改碰到了你保护的第 N 段，成稿保留原文”，没有接受按钮。需要修改该段时，用户点击“返回调整保护”，看到旧决定将清空，再继续。

成稿页完整展示文本、受保护段数、采用数、保留数。只显示“已按本轮保护范围合成”，同时保留一句“文字保留不代表语义或事实已经核查”。

### 7.2 状态与文案

| 状态 | 用户可见行为 |
| --- | --- |
| 原稿为空 | 显示一个 80 字以内的内置虚构例子入口，不自动加载私人内容 |
| 未选择保护 | 允许普通比较，但清楚显示“本轮没有受保护段落” |
| 两稿相同 | 显示“未发现文字改动”，允许导出原稿 |
| 比较中 | 显示进度状态和取消按钮，不用伪造百分比 |
| 待审未清 | 成稿复制禁用，提示剩余项数，可选择其余保留原文 |
| 保护冲突 | 明确指出保护段和被拒绝的改动，允许继续审阅其他项 |
| 改动过大或超时 | 保留当前输入，提示缩短为一段再比较，不自动产出近似结果 |
| 剪贴板失败 | 展示可手工全选的最终文本和 TXT 下载入口 |
| 清空 | 有内容时确认一次，执行后回到空状态并终止 Worker |
| 原稿改动 | 说明将清除改稿、保护和决定；确认后返回准备页 |

不得在输入的每次按键时自动比较、联网或弹窗。保护选择后不立即要求第二次确认；用户开始比较即冻结本轮保护契约。

## 8 关键算法与正确性边界

### 8.1 规范化和输入限制

唯一规范化是 CRLF 与单独 CR 转换成 LF。不得 trim、替换空格、改变全半角、转换繁简体或执行 Unicode NFC/NFKC。保证针对规范化后的文字，不承诺文件字节级原样保留。

原稿必须非空；改稿可为空，用于显式删除场景。每稿最多 12,000 UTF-16 代码单元、最多 200 个换行分段，单个导入文件最多 100 KiB。超限拒绝本次导入，保留之前输入。文件只接受 UTF-8，使用严格解码；不猜测 GBK。不接受包含不成对 surrogate 的 JS 字符串。

段落范围为 [start, end)，不包含段末 LF。空白段展示但不能保护。所有偏移均指规范化原稿中的 UTF-16 代码单元位置。段内原始空格保留，空白判定仅用于确定复选框是否可用。

### 8.2 精确差异

使用 Intl.Segmenter 的 grapheme 粒度切分两稿，再把完整字符串 token 数组传入锁定版本的 jsdiff `diffArrays`，用严格相等比较，大小写和空格都敏感。[R6] 累计各 token 的 JS string.length 建立 UTF-16 偏移映射，不把 token 个数或 change.count 当 UTF-16 长度。不使用忽略空白的词级比较。浏览器缺少 Intl.Segmenter 时明确停止比较，不静默退化为会拆开 emoji 的实现。

冻结实际浏览器版本并记录环境；不同 Unicode 分段实现可能产生不同的展示分块，不能承诺跨浏览器分块完全一致。重建文本与保护不变量在每个支持环境均必须成立。所有保护端点和变更端点均落在完整 grapheme 边界，段落按 LF 分割的规则保持不变。

连续的非相等差异项合并为一个原子变更块；任何相等项结束当前块。得到按原稿位置升序、不交叠的 Hunk。删除和插入相连时作为同一替换，不能把替换拆开批准，避免只接受删除造成内容丢失。

每个 Hunk 保存 start、end、oldText、newText。必须满足 original.slice(start,end) === oldText。所有 Hunk 全部应用时应精确得到规范化改稿；全部保留原文时应精确得到规范化原稿。这两条分别用独立拼接器验证，不能仅断言 UI 看起来相似。

diff 在单独 Web Worker 内运行，maxEditLength 设为 2,048、算法 timeout 设为 800 ms，主线程在 1,500 ms 仍未收到有效结果时终止 Worker。算法返回 undefined 时进入 TOO_COMPLEX，不得视作“没有差异”。超时值属于需在 VM 验证的工程预算；修改预算须同步规范与测试。

MVP 不承诺句义对齐、段落移动识别或唯一最短差异。重复文本可能产生多种合法对齐。为避免靠模糊匹配迁移授权，保护始终绑定原稿位置；遇到影响保护判断的重复或跨段变更，应显示完整相关段和保留原文的安全路径，不自动寻找另一个“相同句子”替代。

### 8.3 冲突规则

对于非空原稿范围的删除或替换 h=[a,b)，保护范围 p=[s,e)：

冲突当且仅当 a < e 且 b > s。

对于纯插入 a=b，若 s <= a <= e 则冲突。两端也拦截，避免在保护文字紧贴位置加入前后缀后继续宣称该段未受影响。所有冲突块状态为 blocked，自动保留原文，用户不得在本轮强行接受。

保护保证是原稿位置对应片段的字面保留。其他段落加入否定、改换标题或改变承诺对象，仍可能改变整篇含义；软件不把“没有保护冲突”当作语义正确。相关示例必须进入产品演示和测试说明。

### 8.4 合成与授权

compose 遇到任何 pending 立即返回 PENDING_REVIEW，不返回预览文字。最终稿只由原稿与本轮 accepted 且无冲突的变更合成。顺序遍历 Hunk，复制原稿未改片段，按状态插入 newText 或 oldText，最后复制剩余原稿。UI 不自行拼接待审预览。

合成前重新检查输入哈希、分析 ID、原文范围、保护冲突与状态完整性。不得使用补丁库的模糊 applyPatch、上下文搜索或位置偏移修复。任一检查失败返回明确错误，不能退回使用整份 AI 改稿。

每次原稿、改稿、保护范围变化都增加 revision。Worker 请求和响应携带 revision 与 jobId，迟到结果直接丢弃。原稿变化清除旧改稿、保护、分析与决定；改稿变化保留原稿和保护但清除分析与决定；保护变化保留两稿但清除决定并重算。

pending 不可导出。blocked 保留原文且不计为 pending。用户可显式选择“其余保留原文”，把所有 pending 改为 rejected；该操作不触及已接受项。每次实际改变决定（包括批量保留）增加独立的 decisionRevision，并立即清空已缓存的最终预览、复制/下载资格和回执。幂等的相同决定不增加。第一版不提供“全部接受”。

### 8.5 特殊字符与可解释限制

Unicode 代理对、组合字符与 emoji ZWJ 序列不得被拆开批准；差异显示包含所在完整段上下文。首版不以视觉字符长度宣传“逐字数准确率”。已接受与已拒绝的不同变更组合可能影响语气或语法，最终全文预览不可省略。中文输入法 composition 尚未结束时禁止冻结与计算，避免把半个输入过程当作用户定稿。

保护统计不通过在成稿中搜索同样的字符串得出，而使用合成时的原稿区间映射核对。重复出现同样的文字不能用来掩盖受保护位置被错误替换。

## 9 数据结构与模块接口

### 9.1 核心类型

```typescript
type Decision = "pending" | "accepted" | "rejected" | "blocked";

interface ProtectedRange {
  id: string;
  paragraphId: string;
  start: number;
  end: number;
}

interface Hunk {
  id: string;
  start: number;
  end: number;
  oldText: string;
  newText: string;
  conflicts: string[];
  decision: Decision;
}

type RawHunk = Pick<Hunk,
  "id" | "start" | "end" | "oldText" | "newText">;

interface Analysis {
  schemaVersion: "1.0.0";
  engineVersion: string;
  revision: number;
  jobId: string;
  analysisId: string;
  originalHash: string;
  candidateHash: string;
  protections: ProtectedRange[];
  hunks: Hunk[];
}

interface ReviewSession {
  original: string;
  candidate: string;
  revision: number;
  decisionRevision: number;
  phase: "prepare" | "comparing" | "review" | "ready" | "error";
  protections: ProtectedRange[];
  analysis: Analysis | null;
}
```

analysisId 为固定字段顺序的 JSON 数组经 UTF-8 编码后的 SHA-256：schemaVersion、engineVersion、revision、jobId、originalHash、candidateHash、按 start/end/id 排序的保护项。jobId 每次比较重新生成，clear 后也不能复用；测试使用注入的固定 ID。内容恢复为旧值仍是新批准轮次。不得使用用户输入作为 HTML ID 或代码路径。Hunk ID 是本分析内稳定序号，不跨分析复用批准。

engineVersion 记录核心规则版本及实际 diff 包版本。哈希用于版本一致性，不是内容真实性认证。哈希统一使用 Web Crypto SHA-256，对 TextEncoder 生成的 UTF-8 字节计算并转小写十六进制；因此 analyze 和 compose 均为异步。localhost 支持环境必须实测，缺少 Web Crypto 时返回 UNSUPPORTED_ENV，不另写未经核验的同步替代。

### 9.2 对外接口

```typescript
canonicalize(text: string): string
validateInput(text: string, field: "original" | "candidate"): InputIssue[]
splitParagraphs(original: string): Paragraph[]
classifyHunks(original: string, hunks: RawHunk[],
  protections: ProtectedRange[]): GuardResult
analyze(request: AnalyzeRequest): Promise<AnalyzeResult>
setDecision(
  session: ReviewSession,
  analysisId: string,
  hunkId: string,
  decision: "accepted" | "rejected"
): DecisionResult
compose(session: Readonly<ReviewSession>): Promise<ComposeResult>
makeReceipt(session: Readonly<ReviewSession>, result: ComposeSuccess): ReviewReceipt
exportText(text: string): Blob
clearSession(session: ReviewSession): ReviewSession
```

公共辅助类型如下，T002 只能将这些定义落到代码，不得自行改语义：

```typescript
type ErrorCode = "INVALID_INPUT" | "TOO_COMPLEX" | "CANCELLED"
  | "STALE_ANALYSIS" | "PENDING_REVIEW" | "PROTECTED_CHANGE"
  | "INVALID_PATCH" | "UNKNOWN_HUNK" | "UNSUPPORTED_ENV";
interface InputIssue {
  code: "EMPTY_ORIGINAL" | "TOO_LONG" | "TOO_MANY_PARAGRAPHS"
    | "INVALID_UNICODE" | "INVALID_UTF8" | "FILE_TOO_LARGE";
  field: "original" | "candidate";
  limit: number | null;
  actual: number | null;
}
interface Paragraph {
  id: string; start: number; end: number;
  text: string; isBlank: boolean;
}
interface AnalyzeRequest {
  original: string; candidate: string;
  protections: ProtectedRange[];
  revision: number; jobId: string; engineVersion: string;
}
type AnalyzeResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; errorCode: ErrorCode;
      revision: number; jobId: string };
type GuardResult =
  | { ok: true; hunks: Hunk[] }
  | { ok: false; errorCode: ErrorCode };
type DecisionResult =
  | { ok: true; session: ReviewSession }
  | { ok: false; errorCode: ErrorCode };
interface ProtectedMapping {
  protectionId: string;
  sourceStart: number; sourceEnd: number;
  outputStart: number; outputEnd: number;
}
interface ComposeSuccess {
  ok: true; text: string; outputHash: string;
  analysisId: string; revision: number;
  decisionRevision: number;
  protectedMappings: ProtectedMapping[];
}
type ComposeResult = ComposeSuccess
  | { ok: false; errorCode: ErrorCode };
interface ReviewReceipt {
  schemaVersion: "1.0.0"; engineVersion: string;
  analysisId: string; revision: number;
  decisionRevision: number;
  originalHash: string; candidateHash: string; outputHash: string;
  protections: ProtectedRange[];
  protectedMappings: ProtectedMapping[];
  hunks: { id: string; start: number; end: number;
    decision: Exclude<Decision, "pending"> }[];
  counts: { accepted: number; rejected: number; blocked: number };
}
```

setDecision 对陈旧 analysisId、未知 Hunk 或接受 blocked 分别返回 STALE_ANALYSIS、UNKNOWN_HUNK、PROTECTED_CHANGE；不改变原 session。相同决定重复提交为幂等成功，blocked 的保留操作保持 blocked。其他合法项可在 accepted 与 rejected 间修改。

compose 首先取得不可变快照，哈希完成后返回该快照的 analysisId、revision、decisionRevision。UI 在显示、复制、下载、回执生成之前再次比较三个标识；等待期间如输入或采纳决定变化，则丢弃结果，不能用旧预览导出。reducer 采用不可变更新，不能原地修改旧快照的 Hunk。makeReceipt 要求当前 session.analysis 与结果的 analysisId、revision、decisionRevision 均一致且无 pending，否则抛出带错误码的受控错误，由 I/O 显示，禁止把旧 outputHash 配上新决定。

classifyHunks 先验证区间与 oldText，再计算 conflicts；有冲突标 blocked，其余标 pending，不接受任何旧决定。T005 交付该函数；T004 在其完成后由 src/core/analyze.ts 组装哈希、差异和保护结果，返回完整 Analysis，workers/client.ts 暴露异步 analyze。UI 只能调用契约层，不重新实现冲突公式。Worker 不读浏览器存储，不生成 UI 提示文案。输入输出层不得绕过 compose 直接下载 candidate。

### 9.3 审阅回执

JSON 回执字段包括 schemaVersion、engineVersion、analysisId、revision、decisionRevision、三个文本哈希、保护范围与映射、hunk 原稿区间、decision、accepted/rejected/blocked 计数。不得包含 original、candidate、oldText、newText 或用户目标文本。

回执是可选的本次审阅记录，不是便携记忆包，不支持导入恢复，也不发送给模型。回执可证明版本对应关系，不能单独重建全文，不能证明模型输出为真。

## 10 架构与版本策略

| 层 | 采用方案 | 职责 |
| --- | --- | --- |
| 界面 | React 与 TypeScript | 中文输入、保护选择、变更审阅、最终预览 |
| 构建 | Vite | 开发和本地静态包 |
| 比较 | grapheme 切分与 jsdiff 的 diffArrays | 有限输入内的精确文字差异 |
| 核心规则 | 纯 TypeScript | 区间冲突、状态转换、合成、回执 |
| 运行隔离 | 单 Web Worker | 比较、取消、超时和迟到结果控制 |
| 校验 | Zod 或手写严格类型守卫 | 内部消息和回执契约 |
| 测试 | Vitest 与 Playwright | 核心、性质、浏览器和离线检查 |
| 本机服务 | Node 内置静态文件服务 | 仅绑定 127.0.0.1，不接受业务上传 |

Muse 在 S0 读取真实 VM 环境。默认支持 Windows；若 VM 当前为 Linux，以该 Linux 为首个必测环境，并把未实测的 Windows 明确写为 NOT_TESTED。不能用本会话容器版本冒充 Muse 的 VM。

优先复用已验证的受维护 Node LTS 与同代兼容前端版本。S0 从官方资料核对，选定稳定版本后写精确版本、package-lock.json、Node 版本文件和 ENVIRONMENT.md；后续一律 npm ci。禁止浮动 CDN、运行时拉取字体、生产安装 latest、在验收后升级依赖。本文未伪造尚未实测的具体补丁版本。

模块边界如下：

- src/domain/types.ts、schema.ts：唯一契约与错误码。
- src/core/text.ts：规范化、限制、分段。
- src/core/diff.ts：差异转换及区间。
- src/core/analyze.ts：完整分析组装，调用分类接口，归属 T004。
- src/core/guards.ts：保护冲突与映射。
- src/core/reducer.ts：状态与批准有效期。
- src/core/compose.ts：结果合成及不变量检查。
- src/core/receipt.ts：无正文回执。
- src/workers/diff.worker.ts、src/workers/client.ts：执行、取消、超时。
- src/io/files.ts、clipboard.ts：本地导入导出。
- src/components/：展示组件；src/app/：工作流集成。
- scripts/：跨平台验证、静态启动和发布工具。

运行只需要浏览器和本机静态资源。开发依赖首次下载与浏览器测试安装可能需要联网，这不等于产品运行依赖外网。交付必须包含已构建的 dist 和可离线启动的本机服务。

## 11 可复现样例

### 11.1 正常混合采纳

原稿：

```text
请于周五确认。
人数上限为30人。
谢谢配合。
```

用户保护第二段“人数上限为30人。”。

改稿：

```text
请在周五前回复确认。
人数上限为50人。
感谢配合。
```

用户接受第一段和第三段的允许改动后，期望最终稿为：

```text
请在周五前回复确认。
人数上限为30人。
感谢配合。
```

30 改为 50 的变更必须显示保护冲突并保留 30。实际 Hunk 数量由锁定的精确算法决定，测试以正确合成结果和保护不变量为准，不把某一种漂亮分块误当业务正确性。

### 11.2 不应误导的例子

原稿某段为“仅向已报名成员开放”，即使这段逐字保留，其他段增加“未报名也可参加”仍会制造矛盾。产品不得显示“含义完全未变”或“全部承诺已验证”。用户必须阅读最终全文；这类语义冲突不属于首版自动检测指标。

### 11.3 固定样本集

提供 24 组完全合成、无私人内容的 fixture。每组含 case.json，以及案例需要的 original.txt、candidate.txt、protections.json 和 decisions.json。case.json 固定声明 kind（compose、validation 或 workflow）、有序 actions、expectedOutcome（success、error 或 state）、expectedErrorCode、hasText。正常合成且 hasText=true 时必须有 expected.txt，合法空结果也以空 expected.txt 表示；错误与仅状态案例 hasText=false，不提供 expected.txt，避免混淆失败和合法删除。

workflow 的 actions 明确每步输入 revision、jobId、取消/清空/迟到响应及 expectedState（phase、analysis 是否为空、是否可导出）。超时单元例使用受控时钟，真实耗时另由性能测试证明。覆盖正常局部修改、日期/人数变动、保护段删除、边界插入、重复段、重排、多行替换、空改稿、无保护、全部保护、CRLF、emoji、组合字符、恶意 HTML、过长输入、超时、取消、迟到结果、清空后重算。

每组的金标准保护范围和最终结果由独立审查会话核对。不得从实现输出自动生成 expected 文件再称为独立 oracle。

## 12 验证指标与实验设计

### 12.1 工程验收

| 指标 | 门槛 | 证据 |
| --- | --- | --- |
| 保护段字面保留 | 合法导出中 100% | 区间映射核对与 24 组固定样本 |
| 越权采纳 | 0 | 保护冲突、陈旧批准、待审误导出用例 |
| 重建一致性 | 全采纳得改稿，全拒绝得原稿 | 无保护模式性质检查与独立拼接器 |
| Unicode 与换行 | 契约覆盖样例全部符合预期 | 中文、代理对、组合符与 CRLF fixtures |
| 常规性能 | 固定 EP-P01 负载，5 次预热后 30 次正式测量，P95 不超过 500 ms | 目标 VM、浏览器版本、原始时间记录 |
| 大输入失败路径 | Worker 终止预算 1,500 ms，界面恢复的实测上限 1,800 ms | 超时/取消实录及日志 |
| 外部网络请求 | 核心流程为 0 | 生产包请求日志与断外网操作 |
| 内容残留 | 清空后应用状态与持久化区无正文 | Storage 检查和行为回归 |
| 导出一致性 | 下载、复制与最终预览一致 | E2E 下载读取及剪贴板回退 |

EP-P01 冻结为 20 行各 99 个 CJK 基本区字符再接 LF，共 2,000 UTF-16 单元；在各行固定 5 个位置替换为不同的单个字符，共 100 个替换，候选长度相同；保护第 4、8、12、16、20 行。T002 固定正文和 SHA-256，不以运行中随机文本替代。计时从用户点击比较的处理函数起，到结果经轮次验证写入状态、可审阅控件出现后的下一次 requestAnimationFrame 止，包含分段、哈希、Worker 往返和首次 UI 更新。P95 取升序第 ceil(0.95*n) 个值，n=30 时第 29 个；保存所有正式测量，不删慢样本。

性能是目标门槛，不是本轮测得跑分。平台系统调度抖动记录实际环境，不能通过只报告最佳一次掩盖长尾。

### 12.2 最小用户实验

计划招募 8 位首要用户；最低 6 位用于探索结果。招募和联系由用户或 Muse 在已有授权渠道执行，本轮没有发送邀请。先收集最近一次可脱敏的实际改稿经历，验证频率与代价是否成立。

每人完成 4 个配对任务，内容不同但错误类型、文本长度、可改范围相当；每份含 1–2 个事先定义的未经授权改动。对照为参与者真实现用方法，允许 Word 比较，不强制设一个弱基线；另用标准差异查看器测试保护契约是否额外有价值。顺序按 AB/BA 平衡，用户不重复处理相同正文。

从打开原稿到得到可交付文本计时，包含粘贴、保护设置、回外部页面和审阅操作。改稿采用冻结的预置样本，避免模型波动混淆界面效果。独立评估者按金标准检查最终文本，参与者不能看到预埋错误答案。

主要指标：不想要的改动进入最终稿的任务比例、正确合稿率、总完成时间、保护设置时间、未完成比例。次要指标：是否愿意在下次同类任务继续用，及用户能否说出“文字保护不等于事实核查”。

探索性继续门槛：至少 6/8 人的未经授权采纳数不高于自己的基线；合计漏采不想要改动的数量下降；总时间中位数不增加；保护设置中位数不超过 45 秒；至少 5/8 人愿意在同类任务再用。若只招到 6 人，人数门槛分别为 5/6 与 4/6，并原样报告分母。

样本量不足以做市场推广的普遍效果声明。研究结果必须区分机器不变量、合成任务表现和真人使用表现。真人未测时写 USER_VALUE_NOT_MEASURED，不能让 Coding Agent 角色扮演替代参与者。

### 12.3 终审中的指标地位

核心工程门槛是本原型终审的阻断项。用户实验是产品价值证据，必须有实际结果，或明确列出尚未测量与具体原因；未招到用户不阻塞本地技术原型的审查，但终审须登记为非阻断限制，不得声称已经证明节省时间或长期信任。

若已完成实验显示保护配置带来的代价超过收益，应如实记录 PRODUCT_VALUE_FAIL，暂停扩展和效果宣传。工程 PASS 不能覆盖这个产品结论。

## 13 隐私与开源合规

正文仅存当前页面和 Worker 内存，首版不使用 localStorage、IndexedDB、服务端数据库、遥测、第三方字体和分析 SDK。刷新会丢失内容，准备页需提前说明。用户可修改两稿、移除段落、清空本次内容；这些动作触发对应授权失效。

“删除”指应用内状态清空、Worker 终止、Blob URL 撤销与引用释放，不承诺物理擦除浏览器或系统内存。已经下载的 TXT、系统剪贴板、外部 AI 会话和用户截图由用户自行管理，应用不宣称能够远程删除。复制按钮失败时不能假报成功。

所有输入作为文本渲染，禁止用 innerHTML 执行用户内容。文件导入仅解码文本，文件名不作为任意路径。日志只记录错误码、时长、计数、版本，不记录正文。截图和测试材料只使用合成数据。

自身源码采用 MIT；jsdiff 仓库标示 BSD-3-Clause，应保留其版权和许可证。[R6] 其他依赖按 S0 实际锁文件生成清单，不先行宣称全部合规。借鉴产品行为与公开算法，独立设计中文流程，不复制竞品品牌、文案、界面截图或未经许可的代码。

## 14 风险与最大反对意见

| 风险 | 级别 | 决策 |
| --- | --- | --- |
| 字面保留被误当为语义正确 | P0 | 使用精确文案、保留全文预览和反例，不提供真实性百分比 |
| 旧批准在新文本上继续生效 | P0 | revision、analysisId 与哈希检查，变更后清空决定 |
| 保护位置错配或重复句被误用 | P0 | 绑定原稿坐标、禁止模糊补丁、映射验证 |
| 全文改写导致 diff 超预算 | P1 | 硬限与取消，提示分段处理，输入不丢失 |
| 保护整段导致可用改动也被拦截 | P1 | 显示完整冲突，可返回调整；不偷偷放宽保护 |
| 用户宁愿使用 Word 或原有工具 | 产品风险 | 与真实现用方法比较，不把已有能力当原创 |
| 剪贴板或浏览器差异 | P1 | TXT 下载和手工复制回退，真实浏览器证据 |
| 少数 emoji 显示片段不美观 | P2 | 保留完整上下文；不影响结果时登记延后 |

最大反对意见是：“我已经可以在 Word 里比较，为什么还要打开一个网页？”只有事前保护与强制合成确实减少用户漏掉的越界改动，并且新增设置成本可接受，P012 才值得继续。第一周就验证这个反对意见，第二周只完善已经证明可用的短文路径。

## 15 交付结构与完成条件

正式规范四件套为 PROJECT_BOOK.md、PROJECT_BOOK.docx、IMPLEMENTATION_PLAN.md、IMPLEMENTATION_PLAN.docx。Markdown 与 DOCX 共用本文内容源，不删章；图示如转换须保持信息完整。

施工交付包含源码、package-lock.json、运行指南、环境记录、24 组合成样本、单元及浏览器测试、性能原始记录、网络/隐私检查、许可证清单、演示截图、源码清单、发布哈希、独立审查报告、REVIEW_INDEX.md 与分批源码正文 REVIEW_PACK_XX.md。

四份规范齐备后可按计划开始施工。本轮文档交付不表示产品已经完成。最终发布与项目完成通知必须等待本立项对话的 ChatGPT 独立终审 PASS。源码和证据必须对应同一冻结提交，不能用开发者自评替代验收。

## 16 参考资料及借鉴边界

以下访问日期均为 2026-11-05。论文只支持对应研究范围，不提供本项目目标用户的痛点频率数据。

R1 Microsoft Research Guidelines for Human AI Interaction  
https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/  
用途：纠错、控制和长期协作设计原则。借鉴设计问题分类，不将指南当需求规模证明。

R2 Microsoft Word Compare document differences using the legal blackline option  
https://support.microsoft.com/en-gb/word/compare-document-differences-using-the-legal-blackline-option  
https://support.microsoft.com/en-us/word/training/track-changes-in-word  
用途：最接近的传统替代方案。承认比较和采纳已成熟；不复制其界面。

R3 editGPT 官方页面与 Quick Start Guide  
https://editgpt.app/  
https://editgpt.app/quick-start-guide  
用途：核实 AI 改稿逐项接受/拒绝已经存在。官网搜索正文可读，直接打开指南仅得到页面壳，因此不声称已体验其应用或穷尽当前功能；不以公开资料未提某功能证明该功能不存在。

R4 DocWriter 官方 GitHub README  
https://github.com/docwriter-org/docwriter  
用途：核实本地 Markdown 与 AI 改动审阅先例。借鉴显式审阅原则；不复制代码、项目文件管理或代理集成，不能把本地属性当独占创新。

R5 Buçinca Z et al 2021 To Trust or to Think  
https://doi.org/10.1145/3449287  
https://iis.seas.harvard.edu/papers/bucinca21trust.pdf  
用途：认知促发与过度依赖、操作负担的权衡。已读论文摘要及正文开头；不将其 N=199 实验效果外推为本产品效果。

R6 jsdiff 官方仓库与 API  
https://github.com/kpdecker/jsdiff  
用途：精确差异、code point、timeout/maxEditLength 与 BSD-3-Clause。可按许可证使用依赖；不能把上游差异算法声称为本项目发明。

R7 Testoni A and Fernández R 2024 Asking the Right Question at the Right Time  
https://aclanthology.org/2024.eacl-long.16/  
用途：问前分岔备选的澄清策略依据。已读摘要和发表元数据；不声称其验证了本项目模板。

R8 Sharma M et al Towards Understanding Sycophancy in Language Models  
https://www.anthropic.com/research/towards-understanding-sycophancy-in-language-models  
https://arxiv.org/abs/2310.13548  
用途：反附和对照备选的研究背景；不以一句赞美判断模型奉承。

R9 Intercom RICE  
https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers  
用途：RICE 公式与估计纪律。候选排序将时间单位明确改为人日，所有输入是假设，不是市场预测。

R10 OpenAI Introducing canvas  
https://openai.com/index/introducing-canvas/  
用途：局部编辑与历史回退的历史先例。发布文反映 2024 年介绍，不能当作 2026 年每个账户的完整功能清单；本轮未核实当前完整 Canvas 帮助页。

R11 Microsoft Allow changes to parts of a protected Word document  
https://support.microsoft.com/en-us/word/allow-changes-to-parts-of-a-protected-word-document  
用途：核实局部编辑授权已经存在。比较跨助手回贴工作流，不将段落保护称为原创。

R12 inline-scribe 官方 GitHub README  
https://github.com/mk668a/inline-scribe  
用途：本地模型校对、差异审阅及只应用已接受项的近似先例。仅作行为参考，不复刻扩展；是否拥有完全相同授权失效机制未核实。

R13 QuillBot Freeze Words 官方帮助  
https://help.quillbot.com/hc/en-us/articles/35855113357847-What-is-Freeze-Words-in-Quillbot  
用途：冻结词语与短语的直接先例；不把保护已定用词作为新发明，不采购其服务。

R14 PrecisionWrite Freeze Key Terms 官方页面  
https://precisionwrite.app/workflow/freeze-key-terms  
用途：官方已介绍保护词、句、段，作为降低新颖性评分的依据。未安装运行，不验证宣传效果。

R15 MDN Intl Segmenter  
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter  
用途：核实 grapheme 分段 API 与浏览器支持边界。实现仍须在冻结 VM 浏览器验证，不将文档支持表当实测结果。

