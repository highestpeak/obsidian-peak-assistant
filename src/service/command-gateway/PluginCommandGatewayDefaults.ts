import type { PluginCommandGatewayConfig } from '@/core/types/plugin-command-gateway';

/**
 * Compiled fallback mirroring `templates/config/plugin-command-gateway.json`.
 * Runtime code should prefer TemplateManager and use this only when config
 * loading or validation fails.
 */
export const DEFAULT_PLUGIN_COMMAND_GATEWAY_CONFIG: PluginCommandGatewayConfig = {
	discovery: {
		maxCommands: 400,
	},
	curation: {
		batchSize: 60,
		batchTimeoutMs: 20000,
	},
	observation: {
		settleDelayMs: 120,
		maxChangedPaths: 30,
	},
	audit: {
		rotationBytes: 1048576,
		retentionFiles: 4,
		recentLimit: 12,
	},
	classification: {
		destructivePatterns: [
			'\\b(delete|remove|trash|wipe|purge|destroy|reset)\\b',
			'删除|移除|清空|重置',
		],
		editPatterns: [
			'\\b(create|insert|append|write|update|replace|rename|move|format|toggle|capture|add|apply|duplicate|paste|sort|reorder|save|import|restore)\\b',
			'创建|插入|追加|写入|更新|替换|重命名|移动|格式化|切换|添加|应用|复制|粘贴|排序|保存|导入|恢复',
		],
		readPatterns: [
			'\\b(open|show|reveal|search|find|view|preview|focus|navigate|copy|jump|go|select|expand|collapse)\\b',
			'打开|显示|查找|搜索|预览|定位|复制|跳转|选择|展开|折叠',
		],
		modalPatterns: [
			'\\b(modal|dialog|prompt|picker|quickadd)\\b',
			'弹窗|对话框|选择器',
		],
		purposePatterns: {
			navigation: ['\\b(open|show|reveal|focus|navigate|view)\\b', '打开|显示|定位|导航'],
			capture: ['\\b(capture|quickadd|inbox|append)\\b', '捕获|收集|收件箱|追加'],
			planning: ['\\b(plan|daily|weekly|calendar|periodic)\\b', '计划|日记|周记|日历'],
			tasks: ['\\b(task|todo|checklist)\\b', '任务|待办|清单'],
			query: ['\\b(query|search|find|dataview)\\b', '查询|搜索|查找'],
			formatting: ['\\b(format|lint|prettify|style)\\b', '格式化|排版|样式'],
			system: ['\\b(setting|config|reload|reset|system)\\b', '设置|配置|重载|系统'],
		},
	},
};
