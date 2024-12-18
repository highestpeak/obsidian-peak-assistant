## 待完成的任务列表

### 数据收集功能
- [ ] 确保所有需要的原始指标（如 `chars_added_count`、`chars_removed_count` 等）都能正确收集。
- [ ] 实现 `buildStatisticsMetricListener` 来收集 `Copilot Activity`、`文档编辑和查看 Activity`、`应用停留 Activity` 等数据。

### 数据处理和分析功能
- [ ] 完善 `processOneDay` 函数，确保能够处理并返回所有需要的原始和衍生指标。
- [ ] 实现 `analyzeLogEntries` 函数，分析日志条目并计算应用和文档活动。

### 数据展示
- [ ] 完善 `DailyAnalysis.tsx` 中的数据展示组件，确保能够展示所有需要的分析结果。
- [ ] 使用 G2 图表库绘制热力图和雷达图，展示情绪状态和文档活动。

### 集成到 Obsidian 插件
- [ ] 确保插件加载时能够正确初始化事件监听器和数据处理逻辑。
- [ ] 使用 `registerHTMLViews` 注册 HTML 视图，展示数据分析结果。

### 导出功能
- [ ] 在 `DailyAnalysis.tsx` 中，添加导出报告的按钮和功能。
