import * as React from 'react';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { MyPluginSettings } from '@/app/settings/types';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { MCPServerConfig } from '@/service/mcp/types';
import { MCPServerCard } from './MCPServerCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MCPServerSectionProps {
	settings: MyPluginSettings;
	settingsUpdates: SettingsUpdates;
}

// ---------------------------------------------------------------------------
// MCPServerSection
// ---------------------------------------------------------------------------

export function MCPServerSection({ settings, settingsUpdates }: MCPServerSectionProps) {
	const [tick, setTick] = useState(0);
	const bump = () => setTick(t => t + 1);
	void tick;

	const servers = settings.mcpServers ?? [];

	const persistServers = (updated: MCPServerConfig[]) => {
		settingsUpdates.update('mcpServers', updated);
		bump();
	};

	const handleAdd = () => {
		const newServer: MCPServerConfig = {
			id: crypto.randomUUID(),
			name: 'New Server',
			enabled: true,
			transport: 'stdio',
			command: '',
			args: [],
		};
		persistServers([...servers, newServer]);
	};

	const handleUpdate = (id: string, updates: Partial<MCPServerConfig>) => {
		const updated = servers.map(s =>
			s.id === id ? { ...s, ...updates, id } : s,
		);
		persistServers(updated);
	};

	const handleDelete = (id: string) => {
		persistServers(servers.filter(s => s.id !== id));
	};

	return (
		<div className="pktw-space-y-4">
			{/* Header */}
			<div>
				<span className="pktw-text-base pktw-font-semibold">MCP Servers</span>
				<span className="pktw-block pktw-text-xs pktw-text-pk-foreground-faint pktw-mt-1">
					Connect external MCP servers to extend agent capabilities with additional tools.
				</span>
			</div>

			{/* Server cards */}
			{servers.length === 0 && (
				<div className="pktw-text-sm pktw-text-pk-muted-foreground pktw-text-center pktw-py-8">
					No MCP servers configured. Add one to get started.
				</div>
			)}
			{servers.map(s => (
				<MCPServerCard
					key={s.id}
					config={s}
					onUpdate={handleUpdate}
					onDelete={handleDelete}
				/>
			))}

			{/* Add button */}
			<Button
				variant="outline"
				className="pktw-w-full pktw-border-dashed pktw-border-pk-border pktw-text-pk-muted-foreground pktw-h-11 pktw-gap-1.5"
				onClick={handleAdd}
			>
				<Plus size={16} />
				Add Server
			</Button>
		</div>
	);
}
