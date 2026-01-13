import React from 'react';
import { Sparkles, Brain, FileText, Repeat, Cpu, Layers, Clock } from 'lucide-react';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';

export type ControlType = 'slider' | 'select';

export interface OutputControlSettingItemConfig {
	key: keyof LLMOutputControlSettings;
	label: string;
	paramName: string;
	tooltip: string;
	icon: React.ReactNode;
	type: ControlType;
	// For slider controls
	min?: number;
	max?: number;
	step?: number;
	// For select controls
	options?: { value: string; label: string }[];
}

export const OUTPUT_CONTROL_SETTINGS_ITEMS: readonly OutputControlSettingItemConfig[] = [
	{
		key: 'frequencyPenalty',
		label: 'Vocabulary Richness',
		paramName: 'frequency_penalty',
		tooltip: 'The higher the value, the more diverse and rich the vocabulary; the lower the value, the simpler and more straightforward the language.',
		icon: <FileText className="pktw-size-4" />,
		type: 'slider',
		min: -2.0,
		max: 2.0,
		step: 0.1,
	},
	{
		key: 'presencePenalty',
		label: 'Expression Divergence',
		paramName: 'presence_penalty',
		tooltip: 'The higher the value, the more likely the model is to discuss new topics; the lower the value, the more likely it is to repeat existing topics.',
		icon: <Repeat className="pktw-size-4" />,
		type: 'slider',
		min: -2.0,
		max: 2.0,
		step: 0.1,
	},
	{
		key: 'temperature',
		label: 'Creativity Level',
		paramName: 'temperature',
		tooltip: 'Controls randomness. Higher values make output more creative and random; lower values make it more deterministic and focused.',
		icon: <Sparkles className="pktw-size-4" />,
		type: 'slider',
		min: 0.0,
		max: 2.0,
		step: 0.1,
	},
	{
		key: 'topP',
		label: 'Openness to Ideas',
		paramName: 'top_p',
		tooltip: 'Nucleus sampling. Controls diversity via probability mass. Lower values focus on top tokens; higher values consider more options.',
		icon: <Brain className="pktw-size-4" />,
		type: 'slider',
		min: 0.0,
		max: 1.0,
		step: 0.01,
	},
	{
		key: 'reasoningEffort',
		label: 'Reasoning Intensity',
		paramName: 'reasoning_effort',
		tooltip: 'Controls how much reasoning and thinking the model should do before generating a response. Higher levels may result in more thoughtful but slower responses.',
		icon: <Cpu className="pktw-size-4" />,
		type: 'select',
		options: [
			{ value: 'none', label: 'None' },
			{ value: 'low', label: 'Low' },
			{ value: 'medium', label: 'Medium' },
			{ value: 'high', label: 'High' },
		],
	},
	{
		key: 'textVerbosity',
		label: 'Output Text Detail Level',
		paramName: 'text_verbosity',
		tooltip: 'Controls the level of detail and verbosity in the generated text. Higher levels provide more detailed responses.',
		icon: <Layers className="pktw-size-4" />,
		type: 'select',
		options: [
			{ value: 'low', label: 'Low' },
			{ value: 'medium', label: 'Medium' },
			{ value: 'high', label: 'High' },
		],
	},
	{
		key: 'timeoutTotalMs',
		label: 'Total Timeout',
		paramName: 'timeout_total_ms',
		tooltip: 'Maximum time in milliseconds for the entire LLM call including all steps. Prevents long-running conversations.',
		icon: <Clock className="pktw-size-4" />,
		type: 'slider',
		min: 10000, // 10 seconds
		max: 600000, // 10 minutes
		step: 10000, // 10 seconds
	},
	{
		key: 'timeoutStepMs',
		label: 'Step Timeout',
		paramName: 'timeout_step_ms',
		tooltip: 'Maximum time in milliseconds for each individual LLM call step. Prevents individual steps from hanging.',
		icon: <Clock className="pktw-size-4" />,
		type: 'slider',
		min: 5000, // 5 seconds
		max: 300000, // 5 minutes
		step: 5000, // 5 seconds
	},
] as const;

export const DEFAULT_OUTPUT_CONTROL_VALUES: Record<keyof LLMOutputControlSettings, number | string> = DEFAULT_AI_SERVICE_SETTINGS.defaultOutputControl as Record<keyof LLMOutputControlSettings, number | string>;

