
我们要优化展示的 ui 了，我们现在 @src/ui/view/quick-search/components/ai-analysis-sections/StepsDisplay.tsx 还是不错的，但是我们的 slot recon classify evidence 阶段没有更好的展示的ui，现在的太单调了， 根本看不到好的过程，只能看到字。所以我们设计了一套新的ui

这些 ui 我一开始通过与 gemini 讨论得到了，本目录下的 
gemini_ui_instruction_first.md
gemini_ui_instruction_second.md
的指导文件，然后通过 figma 生成了 ui ，我把关键代码提取到了本目录下，其他例如 shadcn ui 的组件代码，css等我没有大量放到这里，呃呃呃呃，css 也放过来了，你看着能用到的就用，不要全部使用，要符合我们现在项目的主题

我在这个文件里引导你要用什么，不要用什么。大概张什么样式的 image 示例。

首先，维度识别 classify 的时候，使用的是 classify_dimensions.png 这个示例，可能来自 DimensionPulse.tsx 这个文件，当然呢，我们肯定要用我们真实的 dimension 数据

然后呢，按照我们代码的流程，我们会开始进行一轮 recon，这个 recon 本身会给每个维度扫描出来一堆文件，和 report 等，效果是 dimension_recon.png 然后代码是 ReconStream.tsx 这里的，但是，我们不要完全按照这个来，应该是在刚才的一圈维度上，每个维度旁边开始浮现各种点，每当一个 stream 返回的时候就涟漪那个点，从而表示正在 stream，表示 recon

然后我们去掉所有 dimension 的文字，但是点还留着，执行 evidence_groups.png 了，代码 SemanticGrouping，聚合后的 group 等等都得使用我们的真实数据

然后并行化 evidence 每个 group 的数据，evidence_progress_ui.png ，这里注意，每个 group 扫描哪个文件，拿到哪些证据都在这个 image 里可以看到 EvidenceMining.tsx 

然后最终开始 plan，plan 的时候我们就显示一个 plan 列表那种样式就行，每一步完成就标记 check，样式类似 plan_list.png 然后我们同时还要渲染一个骨架屏 类似效果  result_frame.png 这个，每个 section 输出的时候一道扫描然后完成，代码可能在 stage5-holographic-report.tsx 这里参考

我们的 stepdisplay 可能最大高度得调整下，因为我们这些动画要占用一定的空间

然后呢，这个 sources_evidence_view.png 作为我们 sourcesSection 的一个新视图，这意味着我们这里三个视图了，list视图、graph视图、evidence 视图等