# Vault Intelligence：Vault contents、Search 与 AI 状态设计

> [Owner Review Index](./2026-08-12-vault-intelligence-owner-review-index.md) · [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) · [File Property review 合同](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#file-property-review-contract) · [返回产品 Overview](./2026-08-12-vault-intelligence-product-model-and-information-architecture.md#vault-intelligence-design-docs)

本文定义用户如何查看所有 Vault 文件类型、这些类型分布在哪些知识区域，以及为什么某个文件可以被 Search、等待处理、处理失败或不适用某项 AI 能力。`Vault contents` 是 Vault map 内的局部视图，不是新的顶层 `Files & index` 页面。

AI Tags 与 Summary 默认属于 Peak 的 machine knowledge；File Property 则是可能改写用户 frontmatter 的 proposal。只有后者进入逐项 choice、combined diff、显式 Apply 与重新验证的 review 合同，不能把两类状态混成同一个 Accept / Reject 列表。

## 1. 为什么不是顶层页面

- Files 是 Vault map 中的对象；
- Index 是让 Search 工作的内部机制；
- Summary、AI Tags 和 vectors 是并列的机器信息状态；
- 用户进入这个页面通常是为了排障或定向处理，而不是浏览文件正文。

因此，顶层仍是 Overview、Vault map、Work queue 和 Runs。Vault map 内只保留 `Vault contents / Activity` 两个并列视图；Structure 完整合并进 Vault contents，也可以从 Overview、Work queue 和 Runs 携带筛选条件进入。

## 2. 入口

```text
Overview → Vault contents / Search status ──────┐
Vault map → File type / selected objects ───────┤
Work queue → Readiness / enrichment finding ────┼→ Vault contents
Active run → Current / failed item ──────────────┤
Completed run → Failed / skipped objects ────────┘
```

页面保留来源 scope，例如“从 Completed run 的 6 个失败文件进入”，返回后恢复原来的筛选和位置。

## 3. 两个 lens

### 3.1 Files

回答：Vault 中有哪些文件类型，各有多少，能读取到什么程度，应由哪个 View 打开？

### 3.2 Search & AI

回答：基础 Search、semantic search、Summary、AI Tags 和 vectors 对哪些对象适用，目前处于什么状态，失败后怎么重试？

两个 lens 读取同一 inventory，不生成两套文件列表。Files lens 不是一个纯数量页面：它同时承载 Community、Topic、Hub、Orphan、Gap 与 Bridge，因为这些结构对象就是文件内容的 Vault-wide 组织方式。

### 3.3 文件类型分布与下钻连续性

Overview 的 Files 摘要和 Vault contents 必须使用同一份实际文件类型分布。外层显示 Markdown、PDF、DOCX、PPTX、PNG、JPEG、WebP、Audio、Video、Canvas、Bases、Excalidraw、CSV、XLSX、Peak Sheet 和 AI Graph，进入详情后不能再合并成 `Images`、`Office documents` 或 `Structured data`。

Pie 不是装饰图：

- hover / keyboard focus 扇区时，高亮相同类型的图例行并显示数量与比例；
- hover / focus 图例行时，反向高亮对应扇区；
- 点击 Overview Pie 的扇区或图例后，进入 Vault contents 并保留该文件类型筛选；
- 详情页继续显示同一 Pie，点击后联动下方知识结构图、Community 数量、关系证据、能力状态、下一步和 AI interpretation；
- `All types` 明确清除类型筛选。

文件类型 inventory 与 capability status 是两个维度。文件始终出现在分布中，不代表它当前可被读取、索引或 AI 分析。

## 4. 基础状态与可选状态

每个文件先显示基础 Search 链：

```text
Discovered → Readable → Search ready
```

其余能力是并列状态，不是基础链路的必经步骤：

```text
Semantic search    Ready / Missing / Not available
AI summary         Available / Missing / Not used
AI topics / tags   Available / Missing / Not used
Metadata proposal  Pending review / None / Not applicable
```

缺少 Summary 不等于 Search 失败。文件被策略排除也不等于解析错误；页面必须说明具体原因。

## 5. 文件类型策略

| 文件组 | 例子 | Vault Intelligence 显示什么 | 不应该做什么 |
|---|---|---|---|
| 文本与源码 | Markdown、TXT、HTML、JSON、Python、TypeScript、YAML | inventory、读取 / Search、适用 enrichment 与检查 | 假定全部支持 Markdown frontmatter |
| 阅读型文件 | PDF、Image | text extraction、OCR / multimodal、Summary / vector 状态 | 把占位文本冒充视觉理解 |
| 表格与 Dataset | CSV、XLSX、`.peaksheet` | 导入来源、能力状态、Peak Sheet handoff | 把 `.peaksheet` raw JSON 当正文 |
| Obsidian 结构文件 | Canvas、Bases、Excalidraw | 专用 adapter、结构状态和 handoff | 用通用文本 patch 修改 |
| 媒体 | Audio、Video | transcript、timeline / multimodal 状态 | 笼统声称已理解全部内容 |
| Peak 原生产物 | `.peaksheet`、规划中的 `.peakaigraph` | artifact、revision、owner View 和关系 | 把内部 schema 暴露成用户正文 |
| 当前不支持 | DOC/DOCX、PPT/PPTX | `Not used` 与原因 | 从 inventory 中隐藏 |

文件支持必须来自明确 capability policy，不能因为注册了 loader 就推断为完整产品支持。

## 6. Summary、AI Tags、vectors 与 frontmatter

| 信息 | 存放位置 | 是否可重建 | 是否修改用户文件 |
|---|---|---:|---:|
| Indexed Summary | Search / index projection | 是 | 否 |
| Indexed AI Tags | Search / index projection | 是 | 否 |
| Vector embeddings | 本地 vector projection | 是 | 否 |
| User frontmatter / tags | 用户文件 | 否，属于用户真值 | 是 |

AI Tags 可以用于 Search、Graph 和 Agent，但不会自动写入 YAML。任何 frontmatter、tag 或 link 写回都必须进入 proposal review。

## 7. 文件类型选择、结构投影与具体文件下钻

Vault contents 默认不再显示一张“每种文件类型一行”的长表。类型、数量和比例已经由 Pie 与图例表达；重复成表格不会帮助用户理解这些文件在哪里、彼此如何关联，也没有明确动作。

选择一个类型后，Pie 下方必须同步展示：

- 该类型在各 Community / Topic 中的数量和占比；
- 连接这些区域的真实 Bridge document 或 typed relation；
- Search、vectors、Summary、AI Tags、vision、transcript 或专用 parser 等适用能力；
- `Ready / Missing / Not used / Failed / Stale` 及具体原因；
- AI 对分布、孤立、连接质量和需要处理位置的解释；
- AI 结论引用的文件、关系、scan、detector 或 activity 证据；
- `Scan this type`、`Open matching files` 或 `Review findings` 等有确定范围的动作。

Vault contents 的默认状态展示整个 Vault 的结构；选择文件类型后是在同一结构上投影该类型，而不是进入另一张“Structure 图”。页面固定顺序是：文件类型分布 → 结构图 → 图形解释列表与 AI interpretation → 必要时下钻具体文件。

点击结构图中的 Community、Topic 或 Bridge 时，打开对应证据详情，而不是只改变颜色。只有用户显式选择 `Open matching files` 或从某个 finding 下钻时，才展示具体文件列表；该列表至少包含 path、mtime、状态、failure reason、freshness、owner View 和确定的下一步。文件正文浏览仍交给 Obsidian / File Atlas，Vault contents 不复制一个通用文件管理器。

阶段状态必须有证据，不能只显示一个绿色或红色圆点。例如 `Failed` 要说明是读取、解析、chunk、embedding、provider 还是 policy 失败。

## 8. 批量动作

- 对 selected scope 更新基础 Search；
- 生成或刷新 vectors；
- 生成 Summary；
- 生成 AI Tags；
- 重试失败阶段；
- 更改 ignore / capability policy；
- 生成 metadata proposal。

开始前显示范围、适用数量、跳过数量、模型和成本。不会修改用户文件的动作与 proposal / apply 必须在视觉上分开。

## 9. 页面状态

| 状态 | 展示 |
|---|---|
| 未建立 inventory | 说明需要 Prepare Vault，不显示空的成功状态 |
| 部分文件不适用 | `Not available` 或 `Not used`，附 policy 原因 |
| 处理中 | 关联 Active run，显示当前阶段和返回进度入口 |
| 部分失败 | 成功项继续可用，失败项可筛选和定向重试 |
| source 已变化 | 状态变为 stale，等待下一次增量处理 |

## 10. 安全边界

本页面可以更新本地可重建信息。只有用户接受的 metadata / tag / link proposal 才能写入用户文件；写入后必须重新索引并在 Vault Intelligence 中验证。
