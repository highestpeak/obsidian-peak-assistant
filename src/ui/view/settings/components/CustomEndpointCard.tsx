import * as React from 'react';
import { useState } from 'react';
import { Server, Plug, PlugZap, Trash2, RefreshCw, ChevronRight } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import type { OpenAICompatibleEndpoint } from '@/core/profiles/types';
import { testConnection } from '@/core/providers/openai-compatible/OpenAICompatibleService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomEndpointCardProps {
	endpoint: OpenAICompatibleEndpoint;
	onUpdate: (id: string, updates: Partial<OpenAICompatibleEndpoint>) => void;
	onDelete: (id: string) => void;
}

type ConnectionStatus = 'untested' | 'testing' | 'connected' | 'error';

const INPUT_CLS = 'pktw-w-full pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-px-2.5 pktw-py-1.5 pktw-text-sm pktw-outline-none focus:pktw-border-pk-accent/60 pktw-transition-colors';

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

function StatusDot({ status, modelCount, error }: { status: ConnectionStatus; modelCount: number; error?: string }) {
	const colors: Record<ConnectionStatus, string> = {
		untested: 'pktw-bg-pk-foreground-faint',
		testing: 'pktw-bg-yellow-400 pktw-animate-pulse',
		connected: 'pktw-bg-green-500',
		error: 'pktw-bg-red-500',
	};
	const labels: Record<ConnectionStatus, string> = {
		untested: 'Not tested',
		testing: 'Testing...',
		connected: `Connected (${modelCount} models)`,
		error: error ?? 'Connection failed',
	};

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5">
			<div className={cn('pktw-w-2 pktw-h-2 pktw-rounded-full', colors[status])} />
			<span className="pktw-text-[11px] pktw-text-pk-foreground-faint">{labels[status]}</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// CustomEndpointCard
// ---------------------------------------------------------------------------

export function CustomEndpointCard({ endpoint, onUpdate, onDelete }: CustomEndpointCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [status, setStatus] = useState<ConnectionStatus>('untested');
	const [modelCount, setModelCount] = useState(0);
	const [errorMsg, setErrorMsg] = useState<string | undefined>();

	const handleTestConnection = async () => {
		setStatus('testing');
		setErrorMsg(undefined);
		try {
			const result = await testConnection({ baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey });
			setModelCount(result.modelCount);
			setStatus('connected');
		} catch (e) {
			setErrorMsg(e instanceof Error ? e.message : String(e));
			setStatus('error');
		}
	};

	return (
		<div className="pktw-border pktw-border-pk-border pktw-rounded-lg pktw-overflow-hidden">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-3 pktw-cursor-pointer hover:pktw-bg-pk-accent/5 pktw-transition-colors"
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
					{endpoint.name}
				</span>
				<StatusDot status={status} modelCount={modelCount} error={errorMsg} />
			</div>

			{/* Expanded body */}
			{expanded && (
				<div className="pktw-px-4 pktw-pb-4 pktw-border-t pktw-border-pk-border pktw-space-y-3 pktw-pt-3">
					<FieldRow label="Name">
						<input
							className={INPUT_CLS}
							value={endpoint.name}
							onChange={e => onUpdate(endpoint.id, { name: e.target.value })}
						/>
					</FieldRow>

					<FieldRow label="Base URL">
						<input
							className={INPUT_CLS}
							value={endpoint.baseUrl}
							placeholder="http://localhost:1234/v1"
							onChange={e => onUpdate(endpoint.id, { baseUrl: e.target.value })}
						/>
					</FieldRow>

					<FieldRow label="API Key">
						<input
							className={INPUT_CLS}
							type="password"
							value={endpoint.apiKey ?? ''}
							placeholder="Optional"
							onChange={e => onUpdate(endpoint.id, { apiKey: e.target.value || undefined })}
						/>
					</FieldRow>

					{/* Actions */}
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-3">
						<Button
							variant="outline"
							size="sm"
							onClick={handleTestConnection}
							disabled={status === 'testing'}
							className="pktw-gap-1.5"
						>
							{status === 'testing' ? (
								<RefreshCw size={14} className="pktw-animate-spin" />
							) : status === 'connected' ? (
								<PlugZap size={14} />
							) : (
								<Plug size={14} />
							)}
							Test Connection
						</Button>

						<Button
							variant="outline"
							size="sm"
							onClick={() => onUpdate(endpoint.id, { enabled: !endpoint.enabled })}
						>
							{endpoint.enabled ? 'Disable' : 'Enable'}
						</Button>

						<div className="pktw-flex-1" />

						<Button
							variant="ghost"
							size="sm"
							onClick={() => onDelete(endpoint.id)}
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
