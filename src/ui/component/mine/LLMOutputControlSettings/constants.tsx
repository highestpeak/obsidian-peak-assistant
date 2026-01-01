import React from 'react';
import { Sparkles, Brain, FileText, Repeat } from 'lucide-react';
import type { LLMOutputControlSettings } from '@/core/providers/types';

export interface OutputControlSettingItemConfig {
	key: keyof LLMOutputControlSettings;
	label: string;
	paramName: string;
	tooltip: string;
	icon: React.ReactNode;
	min: number;
	max: number;
	step: number;
}

export const OUTPUT_CONTROL_SETTINGS_ITEMS: readonly OutputControlSettingItemConfig[] = [
	{
		key: 'frequencyPenalty',
		label: 'Vocabulary Richness',
		paramName: 'frequency_penalty',
		tooltip: 'The higher the value, the more diverse and rich the vocabulary; the lower the value, the simpler and more straightforward the language.',
		icon: <FileText className="pktw-size-4" />,
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
		min: 0.0,
		max: 1.0,
		step: 0.01,
	},
] as const;

export const DEFAULT_OUTPUT_CONTROL_VALUES: Record<keyof LLMOutputControlSettings, number> = {
	temperature: 1.0,
	topP: 0.9,
	topK: 50,
	presencePenalty: 0.0,
	frequencyPenalty: 0.0,
	maxOutputTokens: 4096,
};

