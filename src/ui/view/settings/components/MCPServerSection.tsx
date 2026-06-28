import * as React from 'react';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import type { SettingsUpdates } from '../hooks/useSettingsUpdate';
import type { MCPServerConfig } from '@/core/types/mcp';
import { MCPServerCard } from './MCPServerCard';
import { DEFAULT_SETTINGS_STRINGS, loadSettingsStrings, type SettingsStrings } from '../settingsStrings';

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

	const [strings, setStrings] = useState<SettingsStrings>(DEFAULT_SETTINGS_STRINGS);
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const loaded = await loadSettingsStrings();
			if (!cancelled) setStrings(loaded);
		})();
		return () => {
			cancelled = true;
		};
	}, []);
	const copy = strings.externalTools;

	const servers = settings.mcpServers ?? [];

	const persistServers = (updated: MCPServerConfig[]) => {
		settingsUpdates.update('mcpServers', updated);
		bump();
	};

	const handleAdd = () => {
		const newServer: MCPServerConfig = {
			id: crypto.randomUUID(),
			name: copy.defaultServerName,
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
			{/* Heading intentionally omitted — ToolsTab already renders the
			    section title + sub for this surface. Keeping it here produced
			    a duplicate "External tools" header. */}

			{/* Server cards */}
			{servers.length === 0 && (
				<div className="pktw-text-sm pktw-text-pk-muted-foreground pktw-text-center pktw-py-8">
					{copy.emptyHint}
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
				{copy.addCta}
			</Button>
		</div>
	);
}
