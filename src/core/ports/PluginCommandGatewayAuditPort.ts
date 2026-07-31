import type { PluginCommandGatewayAuditReceipt } from '@/core/types/plugin-command-gateway';

export interface PluginCommandGatewayAuditPort {
	append(receipt: PluginCommandGatewayAuditReceipt): Promise<void>;
	listRecent(limit: number): Promise<readonly PluginCommandGatewayAuditReceipt[]>;
	drain(): Promise<void>;
}
