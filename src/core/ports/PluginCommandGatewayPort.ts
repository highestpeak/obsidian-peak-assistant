import type { ToolDef } from '@/core/types/tool';
import type {
	CompiledCommandSkill,
	PluginCommandGatewaySnapshot,
	PluginCommandReviewInput,
} from '@/core/types/plugin-command-gateway';

/**
 * UI/tool-provider view of the app-owned plugin command gateway runtime.
 */
export interface PluginCommandGatewayPort {
	getSnapshot(): Promise<PluginCommandGatewaySnapshot>;
	refresh(): Promise<PluginCommandGatewaySnapshot>;
	curate(): Promise<PluginCommandGatewaySnapshot>;
	review(commandId: string, input: PluginCommandReviewInput): Promise<PluginCommandGatewaySnapshot>;
	clearReview(commandId: string): Promise<PluginCommandGatewaySnapshot>;
	compileApprovedSkill(): Promise<CompiledCommandSkill>;
	getToolDefinitions(): Promise<readonly ToolDef[]>;
}
