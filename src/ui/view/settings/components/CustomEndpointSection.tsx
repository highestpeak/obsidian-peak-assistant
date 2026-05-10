import * as React from 'react';
import { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { OPENAI_COMPATIBLE_PRESETS } from '@/core/constant';
import type { OpenAICompatibleEndpoint } from '@/core/profiles/types';
import { CustomEndpointCard } from './CustomEndpointCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomEndpointSectionProps {
	endpoints: OpenAICompatibleEndpoint[];
	onUpdate: () => void;
}

type PresetKey = keyof typeof OPENAI_COMPATIBLE_PRESETS;

// ---------------------------------------------------------------------------
// CustomEndpointSection
// ---------------------------------------------------------------------------

export function CustomEndpointSection({ endpoints, onUpdate }: CustomEndpointSectionProps) {
	const registry = ProfileRegistry.getInstance();
	const [showPresets, setShowPresets] = useState(false);

	const createEndpoint = (
		name: string,
		baseUrl: string,
		preset?: OpenAICompatibleEndpoint['preset'],
	) => {
		registry.addCustomEndpoint({
			id: crypto.randomUUID(),
			name,
			baseUrl,
			preset: preset ?? 'custom',
			enabled: true,
		});
		onUpdate();
	};

	const handlePreset = (key: PresetKey) => {
		const p = OPENAI_COMPATIBLE_PRESETS[key];
		createEndpoint(p.name, p.baseUrl, key);
		setShowPresets(false);
	};

	const handleCustom = () => {
		createEndpoint('Custom Endpoint', 'http://localhost:8080/v1', 'custom');
		setShowPresets(false);
	};

	const handleUpdate = (id: string, updates: Partial<OpenAICompatibleEndpoint>) => {
		registry.updateCustomEndpoint(id, updates);
		onUpdate();
	};

	const handleDelete = (id: string) => {
		registry.deleteCustomEndpoint(id);
		onUpdate();
	};

	return (
		<div className="pktw-space-y-3">
			{/* Section heading */}
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-font-semibold pktw-text-pk-foreground-faint pktw-whitespace-nowrap">
					Custom Endpoints
				</span>
				<div className="pktw-flex-1 pktw-h-px pktw-bg-pk-border" />
			</div>

			{/* Endpoint cards */}
			{endpoints.length === 0 && (
				<div className="pktw-text-xs pktw-text-pk-muted-foreground pktw-text-center pktw-py-4">
					No custom endpoints configured.
				</div>
			)}
			{endpoints.map(ep => (
				<CustomEndpointCard
					key={ep.id}
					endpoint={ep}
					onUpdate={handleUpdate}
					onDelete={handleDelete}
				/>
			))}

			{/* Add buttons */}
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				<div className="pktw-relative">
					<Button
						variant="outline"
						size="sm"
						className="pktw-gap-1.5"
						onClick={() => setShowPresets(v => !v)}
					>
						<Plus size={14} />
						Add from Preset
						<ChevronDown size={12} />
					</Button>
					{showPresets && (
						<div className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-z-50 pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-md pktw-shadow-lg pktw-py-1 pktw-min-w-[160px]">
							{(Object.keys(OPENAI_COMPATIBLE_PRESETS) as PresetKey[]).map(key => (
								<div
									key={key}
									className="pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-cursor-pointer hover:pktw-bg-pk-accent/10 pktw-transition-colors"
									onClick={() => handlePreset(key)}
								>
									{OPENAI_COMPATIBLE_PRESETS[key].name}
								</div>
							))}
						</div>
					)}
				</div>

				<Button
					variant="outline"
					size="sm"
					className="pktw-gap-1.5"
					onClick={handleCustom}
				>
					<Plus size={14} />
					Add Custom
				</Button>
			</div>
		</div>
	);
}
