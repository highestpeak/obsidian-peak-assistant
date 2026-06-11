import * as React from 'react';
import { useState } from 'react';
import { Server, Plug, PlugZap, Trash2, ChevronRight, Power, PowerOff } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { MCPServerConfig, MCPConnectionStatus } from '@/service/mcp/types';
import { MCPClientManager } from '@/service/mcp/MCPClientManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerCardProps {
	config: MCPServerConfig;
	onUpdate: (id: string, updates: Partial<MCPServerConfig>) => void;
	onDelete: (id: string) => void;
}

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent pktw-transition-colors';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="pktw-grid pktw-items-center pktw-gap-3" style={{ gridTemplateColumns: '130px 1fr' }}>
			<span className="pktw-text-xs pktw-text-pk-foreground-faint">{label}</span>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function StatusDot({ status, toolCount, error }: { status: MCPConnectionStatus; toolCount: number; error?: string }) {
	const colors: Record<MCPConnectionStatus, string> = {
		disconnected: 'pktw-bg-pk-foreground-faint',
		connecting: 'pktw-bg-yellow-400 pktw-animate-pulse',
		connected: 'pktw-bg-green-500',
		error: 'pktw-bg-red-500',
	};
	const labels: Record<MCPConnectionStatus, string> = {
		disconnected: 'Disconnected',
		connecting: 'Connecting...',
		connected: `Connected (${toolCount} tools)`,
		error: error ?? 'Error',
	};

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5">
			<div className={cn('pktw-w-2 pktw-h-2 pktw-rounded-full', colors[status])} />
			<span className="pktw-text-[11px] pktw-text-pk-foreground-faint">{labels[status]}</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// MCPServerCard
// ---------------------------------------------------------------------------

export function MCPServerCard({ config, onUpdate, onDelete }: MCPServerCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [connStatus, setConnStatus] = useState<MCPConnectionStatus>('disconnected');
	const [toolCount, setToolCount] = useState(0);
	const [errorMsg, setErrorMsg] = useState<string | undefined>();
	const [connecting, setConnecting] = useState(false);

	// Sync with manager state
	React.useEffect(() => {
		const info = MCPClientManager.getInstance().getConnectionInfo(config.id);
		if (info) {
			setConnStatus(info.status);
			setToolCount(info.toolCount);
			setErrorMsg(info.error);
		}
	}, [config.id]);

	const handleConnect = async () => {
		setConnecting(true);
		setConnStatus('connecting');
		setErrorMsg(undefined);
		try {
			await MCPClientManager.getInstance().connect(config);
			const info = MCPClientManager.getInstance().getConnectionInfo(config.id);
			setConnStatus(info?.status ?? 'connected');
			setToolCount(info?.toolCount ?? 0);
		} catch (e) {
			setConnStatus('error');
			setErrorMsg(e instanceof Error ? e.message : String(e));
		}
		setConnecting(false);
	};

	const handleDisconnect = async () => {
		await MCPClientManager.getInstance().disconnect(config.id);
		setConnStatus('disconnected');
		setToolCount(0);
	};

	return (
		<div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent-tint pktw-transition-colors"
				onClick={() => setExpanded(v => !v)}
			>
				<ChevronRight
					size={14}
					className={cn(
						'pktw-text-pk-muted-foreground pktw-transition-transform pktw-duration-200',
						expanded && 'pktw-rotate-90',
					)}
				/>
				<Server size={16} className="pktw-text-pk-foreground-faint" />
				<span className="pktw-text-sm pktw-font-medium pktw-flex-1">
					{config.name}
				</span>
				<span className="pktw-text-[11px] pktw-text-pk-foreground-faint pktw-uppercase">
					{config.transport}
				</span>
				<StatusDot status={connStatus} toolCount={toolCount} error={errorMsg} />
			</div>

			{/* Expanded body */}
			{expanded && (
				<div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-3 pktw-pt-3">
					<FieldRow label="Name">
						<input
							className={INPUT_CLS}
							value={config.name}
							onChange={e => onUpdate(config.id, { name: e.target.value })}
						/>
					</FieldRow>

					<FieldRow label="Transport">
						<select
							className={INPUT_CLS}
							value={config.transport}
							onChange={e => onUpdate(config.id, { transport: e.target.value as 'stdio' | 'sse' })}
						>
							<option value="stdio">stdio (local process)</option>
							<option value="sse">SSE (remote)</option>
						</select>
					</FieldRow>

					{config.transport === 'stdio' && (
						<>
							<FieldRow label="Command">
								<input
									className={INPUT_CLS}
									value={config.command ?? ''}
									placeholder="npx @modelcontextprotocol/..."
									onChange={e => onUpdate(config.id, { command: e.target.value })}
								/>
							</FieldRow>
							<FieldRow label="Arguments">
								<input
									className={INPUT_CLS}
									value={(config.args ?? []).join(' ')}
									placeholder="arg1 arg2"
									onChange={e => onUpdate(config.id, { args: e.target.value.split(/\s+/).filter(Boolean) })}
								/>
							</FieldRow>
						</>
					)}

					{config.transport === 'sse' && (
						<FieldRow label="URL">
							<input
								className={INPUT_CLS}
								value={config.url ?? ''}
								placeholder="https://mcp.example.com/sse"
								onChange={e => onUpdate(config.id, { url: e.target.value })}
							/>
						</FieldRow>
					)}

					{/* Actions */}
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-3">
						{connStatus === 'connected' ? (
							<Button
								variant="outline"
								size="sm"
								onClick={handleDisconnect}
								className="pktw-gap-1.5"
							>
								<PowerOff size={14} />
								Disconnect
							</Button>
						) : (
							<Button
								variant="outline"
								size="sm"
								onClick={handleConnect}
								disabled={connecting}
								className="pktw-gap-1.5"
							>
								<Power size={14} />
								Connect
							</Button>
						)}

						<Button
							variant="outline"
							size="sm"
							onClick={() => onUpdate(config.id, { enabled: !config.enabled })}
						>
							{config.enabled ? 'Disable' : 'Enable'}
						</Button>

						<div className="pktw-flex-1" />

						<Button
							variant="ghost"
							size="sm"
							onClick={() => onDelete(config.id)}
							className="pktw-text-red-500 hover:pktw-text-red-600 hover:pktw-bg-red-500/10"
						>
							<Trash2 size={14} />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
