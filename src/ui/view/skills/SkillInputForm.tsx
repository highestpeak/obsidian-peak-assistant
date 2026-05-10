/**
 * Dynamic form that collects required inputs before executing a skill.
 * Renders fields based on SkillInput[] definition from the skill YAML.
 */

import React, { useState } from 'react';
import { FileText, Type, MousePointerClick, StickyNote } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { SkillInput } from '@/service/skills/types';
import { cn } from '@/ui/react/lib/utils';

const INPUT_TYPE_ICONS = {
	text: Type,
	file: FileText,
	selection: MousePointerClick,
	'active-note': StickyNote,
} as const;

interface SkillInputFormProps {
	inputs: SkillInput[];
	onSubmit: (values: Record<string, string>) => void;
	onCancel: () => void;
}

export const SkillInputForm: React.FC<SkillInputFormProps> = ({ inputs, onSubmit, onCancel }) => {
	const [values, setValues] = useState<Record<string, string>>(() => {
		const defaults: Record<string, string> = {};
		for (const input of inputs) {
			if (input.default) defaults[input.name] = input.default;
		}
		return defaults;
	});

	const handleChange = (name: string, value: string) => {
		setValues((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = () => {
		// Validate required fields
		for (const input of inputs) {
			if (input.required && !values[input.name]?.trim()) return;
		}
		onSubmit(values);
	};

	const allRequiredFilled = inputs
		.filter((i) => i.required)
		.every((i) => values[i.name]?.trim());

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			{inputs.map((input) => {
				const Icon = INPUT_TYPE_ICONS[input.type] ?? Type;
				return (
					<div key={input.name} className="pktw-flex pktw-flex-col pktw-gap-1.5">
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
							<span className="pktw-text-sm pktw-font-medium" style={{ color: 'var(--text-normal)' }}>
								{input.name}
								{input.required && (
									<span className="pktw-text-red-400 pktw-ml-0.5">*</span>
								)}
							</span>
						</div>
						{input.description && (
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-5">
								{input.description}
							</span>
						)}
						{(input.type === 'text' || input.type === 'file') && (
							<input
								className={cn(
									'pktw-ml-5 pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-rounded',
									'pktw-border pktw-border-solid',
								)}
								style={{
									backgroundColor: 'var(--background-modifier-form-field)',
									borderColor: 'var(--background-modifier-border)',
									color: 'var(--text-normal)',
								}}
								type="text"
								value={values[input.name] ?? ''}
								onChange={(e) => handleChange(input.name, e.target.value)}
								placeholder={input.default ?? ''}
							/>
						)}
						{input.type === 'selection' && (
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-5 pktw-italic">
								Current editor selection will be used
							</span>
						)}
						{input.type === 'active-note' && (
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-ml-5 pktw-italic">
								Current active note will be used
							</span>
						)}
					</div>
				);
			})}

			<div className="pktw-flex pktw-justify-end pktw-gap-2 pktw-mt-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					size="sm"
					disabled={!allRequiredFilled}
					onClick={handleSubmit}
				>
					Run Skill
				</Button>
			</div>
		</div>
	);
};
