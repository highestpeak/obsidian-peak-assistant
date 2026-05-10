/**
 * Modal for browsing and selecting skills.
 *
 * Shows all available skills (built-in + vault) in a grid layout.
 * Selecting a skill shows the SkillInputForm for collecting inputs,
 * then triggers execution via SkillExecutor.
 */

import { Modal } from 'obsidian';
import React, { useState, useMemo } from 'react';
import {
	Calendar, BookOpen, Activity, Workflow, Zap,
	Search, ArrowLeft, Tag,
} from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { SkillRegistry } from '@/service/skills/SkillRegistry';
import { SkillExecutor } from '@/service/skills/SkillExecutor';
import { SkillInputForm } from './SkillInputForm';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type { SkillDefinition } from '@/service/skills/types';

/** Map skill icon names to Lucide components. */
const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
	calendar: Calendar,
	'book-open': BookOpen,
	activity: Activity,
	workflow: Workflow,
	zap: Zap,
};

function getSkillIcon(iconName?: string): React.FC<{ className?: string }> {
	if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
	return Zap;
}

const SkillCard: React.FC<{
	skill: SkillDefinition;
	onClick: () => void;
}> = ({ skill, onClick }) => {
	const Icon = getSkillIcon(skill.icon);
	return (
		<Button
			variant="ghost"
			className={cn(
				'pktw-flex pktw-flex-col pktw-items-start pktw-gap-1.5',
				'pktw-p-3 pktw-h-auto pktw-w-full',
				'pktw-rounded-lg pktw-border pktw-border-solid',
				'hover:pktw-border-blue-400/40',
			)}
			style={{ borderColor: 'var(--background-modifier-border)' }}
			onClick={onClick}
		>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full">
				<Icon className="pktw-w-4 pktw-h-4 pktw-text-blue-400 pktw-shrink-0" />
				<span className="pktw-text-sm pktw-font-medium pktw-truncate" style={{ color: 'var(--text-normal)' }}>
					{skill.name}
				</span>
				<span className={cn(
					'pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-ml-auto pktw-shrink-0',
					skill.type === 'pipeline' ? 'pktw-bg-purple-500/10 pktw-text-purple-400' : 'pktw-bg-blue-500/10 pktw-text-blue-400',
				)}>
					{skill.type}
				</span>
			</div>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-line-clamp-2 pktw-text-left">
				{skill.description}
			</span>
			{skill.tags.length > 0 && (
				<div className="pktw-flex pktw-gap-1 pktw-flex-wrap">
					{skill.tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded"
							style={{
								backgroundColor: 'var(--background-modifier-hover)',
								color: 'var(--text-muted)',
							}}
						>
							{tag}
						</span>
					))}
				</div>
			)}
			{skill.source === 'vault' && (
				<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-italic">
					vault skill
				</span>
			)}
		</Button>
	);
};

const SkillPickerContent: React.FC<{
	onRun: (skill: SkillDefinition, inputs: Record<string, string>) => void;
	onClose: () => void;
}> = ({ onRun, onClose }) => {
	const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [filterTag, setFilterTag] = useState<string | null>(null);

	const skills = useMemo(() => SkillRegistry.getInstance().getAll(), []);

	const allTags = useMemo(() => {
		const tagSet = new Set<string>();
		for (const skill of skills) {
			for (const tag of skill.tags) tagSet.add(tag);
		}
		return Array.from(tagSet).sort();
	}, [skills]);

	const filtered = useMemo(() => {
		let result = skills;
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q),
			);
		}
		if (filterTag) {
			result = result.filter((s) => s.tags.includes(filterTag));
		}
		return result;
	}, [skills, searchQuery, filterTag]);

	// Skill detail / input collection view
	if (selectedSkill) {
		const hasInputs = selectedSkill.inputs && selectedSkill.inputs.length > 0;
		return (
			<div className="pktw-p-4 pktw-flex pktw-flex-col pktw-gap-4">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button variant="ghost" size="sm" onClick={() => setSelectedSkill(null)}>
						<ArrowLeft className="pktw-w-4 pktw-h-4" />
					</Button>
					<span className="pktw-text-sm pktw-font-semibold" style={{ color: 'var(--text-normal)' }}>
						{selectedSkill.name}
					</span>
				</div>
				<span className="pktw-text-xs pktw-text-muted-foreground">
					{selectedSkill.description}
				</span>
				{hasInputs ? (
					<SkillInputForm
						inputs={selectedSkill.inputs!}
						onSubmit={(inputs) => onRun(selectedSkill, inputs)}
						onCancel={() => setSelectedSkill(null)}
					/>
				) : (
					<div className="pktw-flex pktw-justify-end pktw-gap-2">
						<Button variant="ghost" size="sm" onClick={() => setSelectedSkill(null)}>
							Cancel
						</Button>
						<Button size="sm" onClick={() => onRun(selectedSkill, {})}>
							Run Skill
						</Button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="pktw-p-4 pktw-flex pktw-flex-col pktw-gap-4">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<span className="pktw-text-sm pktw-font-semibold" style={{ color: 'var(--text-normal)' }}>
					Skills
				</span>
				<span className="pktw-text-xs pktw-text-muted-foreground">
					{skills.length} available
				</span>
			</div>

			{/* Search */}
			<div className="pktw-relative">
				<Search className="pktw-absolute pktw-left-2.5 pktw-top-1/2 pktw-transform pktw--translate-y-1/2 pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
				<input
					className="pktw-w-full pktw-pl-8 pktw-pr-3 pktw-py-1.5 pktw-text-sm pktw-rounded pktw-border pktw-border-solid"
					style={{
						backgroundColor: 'var(--background-modifier-form-field)',
						borderColor: 'var(--background-modifier-border)',
						color: 'var(--text-normal)',
					}}
					placeholder="Search skills..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
			</div>

			{/* Tag filter */}
			{allTags.length > 0 && (
				<div className="pktw-flex pktw-gap-1 pktw-flex-wrap">
					<Button
						variant={filterTag === null ? 'default' : 'ghost'}
						size="sm"
						className="pktw-text-xs pktw-h-6"
						onClick={() => setFilterTag(null)}
					>
						All
					</Button>
					{allTags.map((tag) => (
						<Button
							key={tag}
							variant={filterTag === tag ? 'default' : 'ghost'}
							size="sm"
							className="pktw-text-xs pktw-h-6"
							onClick={() => setFilterTag(tag === filterTag ? null : tag)}
						>
							<Tag className="pktw-w-3 pktw-h-3 pktw-mr-1" />
							{tag}
						</Button>
					))}
				</div>
			)}

			{/* Skills grid */}
			{filtered.length === 0 ? (
				<div className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-py-8">
					No skills found
				</div>
			) : (
				<div className="pktw-grid pktw-grid-cols-1 pktw-gap-2">
					{filtered.map((skill) => (
						<SkillCard
							key={skill.id}
							skill={skill}
							onClick={() => setSelectedSkill(skill)}
						/>
					))}
				</div>
			)}
		</div>
	);
};

/**
 * Obsidian Modal wrapper for the skill picker.
 */
export class SkillPickerModal extends Modal {
	private renderer: ReactRenderer | null = null;
	private readonly appContext: AppContext;

	constructor(appContext: AppContext) {
		super(appContext.app);
		this.appContext = appContext;
		this.modalEl.addClass('peak-skill-picker-modal');
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.renderer = new ReactRenderer(contentEl);

		const handleRun = (skill: SkillDefinition, inputs: Record<string, string>) => {
			this.close();
			// Execute skill (fire and forget — results stream through existing UI)
			const executor = new SkillExecutor();
			const gen = executor.execute(skill, {
				skillId: skill.id,
				inputs,
			});
			// Consume the generator to trigger execution
			void (async () => {
				try {
					for await (const _ev of gen) {
						// Events could be routed to a UI panel in future
					}
				} catch (e) {
					console.error('[SkillPickerModal] Skill execution failed:', e);
				}
			})();
		};

		const element = createReactElementWithServices(
			SkillPickerContent,
			{ onRun: handleRun, onClose: () => this.close() },
			this.appContext,
		);
		this.renderer.render(element);
	}

	onClose(): void {
		if (this.renderer) {
			this.renderer.unmount();
			this.renderer = null;
		}
		this.contentEl.empty();
	}
}
