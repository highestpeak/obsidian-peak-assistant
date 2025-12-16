import React, { useState, useEffect } from 'react';
import { Sparkles, Save, FileText, TrendingUp, AlertCircle, AlertTriangle } from 'lucide-react';
import { GraphVisualization } from './components/GraphVisualization';
import { TagCloud } from './components/TagCloud';
import { SaveDialog } from './components/ResultSaveDialog';
import { KeyboardShortcut } from './components/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';

interface AISearchTabProps {
	searchQuery: string;
	triggerAnalysis: number;
}

/**
 * Error state component for AI search failures
 */
const ErrorState: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-20 pktw-h-20 pktw-rounded-full pktw-bg-red-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<AlertTriangle className="pktw-w-10 pktw-h-10 pktw-text-red-400" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2 pktw-text-lg">
			Oops! Something went wrong
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
			{error}
		</span>
		<Button
			onClick={onRetry}
			className="pktw-px-4 pktw-py-2 pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md"
		>
			Try Again
		</Button>
	</div>
);

/**
 * Loading state component showing analysis in progress
 */
const LoadingState: React.FC = () => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-bg-violet-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<Sparkles className="pktw-w-8 pktw-h-8 pktw-text-primary pktw-animate-pulse" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			Analyzing...
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d]">
			AI is processing your query and searching through your vault...
		</span>
	</div>
);

/**
 * Empty state component when waiting for analysis trigger
 */
const EmptyState: React.FC = () => (
	<div className="pktw-h-full pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-8">
		<div className="pktw-w-16 pktw-h-16 pktw-rounded-full pktw-bg-violet-50 pktw-flex pktw-items-center pktw-justify-center pktw-mb-4">
			<Sparkles className="pktw-w-8 pktw-h-8 pktw-text-primary" />
		</div>
		<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-mb-2">
			Ready to Analyze with AI
		</span>
		<span className="pktw-text-sm pktw-text-[#6c757d] pktw-mb-4 pktw-max-w-md">
			Enter your question and click <strong>Analyze</strong> or press <strong>Enter</strong> to
			start deep knowledge retrieval. The system will automatically choose the best search
			strategy.
		</span>
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-amber-600 pktw-bg-amber-50 pktw-px-3 pktw-py-2 pktw-rounded-md">
			<AlertCircle className="pktw-w-4 pktw-h-4" />
			<span>This action will consume AI tokens</span>
		</div>
	</div>
);

/**
 * AI analysis result section component
 */
const AnalysisSection: React.FC = () => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-font-semibold pktw-text-[#2e3338] pktw-text-lg">AI Analysis</span>
			<span className="pktw-text-xs pktw-text-[#999999] pktw-bg-white pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-border-[#e5e7eb]">
				Auto-selected: Local RAG + Web
			</span>
		</div>
		<div className="pktw-space-y-3 pktw-text-sm pktw-text-[#2e3338] pktw-leading-relaxed">
			<span>
				Based on your vault&apos;s content,{' '}
				<mark className="pktw-bg-violet-100 pktw-text-violet-800 pktw-px-1 pktw-rounded">
					machine learning
				</mark>{' '}
				is a recurring theme across multiple domains. The core concepts appear in your notes
				about AI fundamentals, project implementations, and research materials.
			</span>
			<span>
				Your notes emphasize the <strong>practical application</strong> of ML techniques,
				with a focus on neural networks and deep learning architectures. The connection
				between theoretical concepts and real-world deployment strategies is well
				documented.
			</span>
			<span>
				Key insights suggest you are actively working on ML pipeline implementation, with
				cross-references between meeting notes, technical documentation, and research
				papers.
			</span>
		</div>
	</div>
);

/**
 * Tag cloud section component
 */
const TagCloudSection: React.FC = () => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Key Topics</span>
		</div>
		<TagCloud />
		<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-3">
			Click any topic to search
		</span>
	</div>
);

/**
 * Top sources section component showing relevant files
 */
const TopSourcesSection: React.FC = () => {
	const sources = [
		{ title: 'Machine Learning Fundamentals', path: 'Notes/AI/Concepts', relevance: 95 },
		{ title: 'Project Meeting Notes - 2024-12-10', path: 'Work/Meetings', relevance: 88 },
		{ title: 'Research Paper - Neural Networks', path: 'References/Papers', relevance: 82 },
		{ title: 'Learning Resources', path: 'Resources', relevance: 76 },
		{ title: 'ML Best Practices', path: 'Notes/AI/Guidelines', relevance: 71 },
	];

	return (
		<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">Top Sources</span>
				<span className="pktw-text-xs pktw-text-[#999999]">({sources.length} files)</span>
			</div>
			<div className="pktw-space-y-2">
				{sources.map((source, index) => (
					<div
						key={index}
						className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-2 pktw-rounded hover:pktw-bg-[#f5f5f5] pktw-cursor-pointer pktw-transition-colors pktw-group"
					>
						<div
							className="pktw-w-1 pktw-h-8 pktw-bg-[#7c3aed] pktw-rounded-full"
							style={{ opacity: source.relevance / 100 }}
						/>
						<div className="pktw-flex-1 pktw-min-w-0">
							<div className="pktw-text-sm pktw-text-[#2e3338] pktw-truncate group-hover:pktw-text-[#7c3aed]">
								{source.title}
							</div>
							<div className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
								{source.path}
							</div>
						</div>
						<div className="pktw-text-xs pktw-text-[#6c757d] pktw-font-medium">
							{source.relevance}%
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

/**
 * Knowledge graph section component
 */
const KnowledgeGraphSection: React.FC = () => (
	<div className="pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb]">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-3">
			<TrendingUp className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
			<span className="pktw-text-sm pktw-font-semibold pktw-text-[#2e3338]">
				Knowledge Graph
			</span>
		</div>
		<GraphVisualization />
		<span className="pktw-text-xs pktw-text-[#999999] pktw-mt-2 pktw-text-center">
			2-3 hop relationships
		</span>
	</div>
);

/**
 * Footer hints section for AI search tab
 */
const AISearchFooterHints: React.FC = () => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
		<KeyboardShortcut keys="Esc" description="to close" prefix="Press" />
		<KeyboardShortcut 
			keys="Enter" 
			description="to analyze" 
			prefix="Press"
			warning="• Will consume AI tokens"
			className="pktw-flex pktw-items-center pktw-gap-1"
		/>
	</div>
);

/**
 * AI search tab, showing analysis summary, sources, and insights.
 */
export const AISearchTab: React.FC<AISearchTabProps> = ({ searchQuery, triggerAnalysis }) => {
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [hasAnalyzed, setHasAnalyzed] = useState(false);
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [retryTrigger, setRetryTrigger] = useState(0);

	const performAnalysis = async () => {
		if (!searchQuery.trim()) return;
		setIsAnalyzing(true);
		setError(null);

		try {
			// todo remove this after testing
			// Manual error trigger for testing: if query contains "test-error" or "trigger-error"
			if (searchQuery.toLowerCase().includes('test-error')) {
				await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate some processing time
				throw new Error('Failed to connect to AI service. Please check your network connection and try again.');
			}

			// TODO: Replace with actual API call
			// Example: const response = await aiService.analyze(searchQuery);
			await new Promise(resolve => setTimeout(resolve, 2000));

			setIsAnalyzing(false);
			setHasAnalyzed(true);
			setError(null);
		} catch (err) {
			setIsAnalyzing(false);
			setHasAnalyzed(false);
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to connect to AI service. Please check your network connection and try again.';
			setError(errorMessage);
		}
	};

	useEffect(() => {
		if (triggerAnalysis > 0 && searchQuery.trim()) {
			performAnalysis();
		}
	}, [triggerAnalysis, searchQuery]);

	useEffect(() => {
		if (retryTrigger > 0 && searchQuery.trim()) {
			performAnalysis();
		}
	}, [retryTrigger, searchQuery]);

	const handleRetry = () => {
		setError(null);
		setHasAnalyzed(false);
		setRetryTrigger(prev => prev + 1);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Main Content */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-pt-3 pktw-px-4 pktw-pb-4">
				{error ? (
					<ErrorState error={error} onRetry={handleRetry} />
				) : !hasAnalyzed ? (
					isAnalyzing ? <LoadingState /> : <EmptyState />
				) : (
					// Analysis Results
					<div className="pktw-flex pktw-flex-col pktw-gap-4">
						<AnalysisSection />
						<TagCloudSection />
						<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4">
							<TopSourcesSection />
							<KnowledgeGraphSection />
						</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between pktw-flex-shrink-0">
				<AISearchFooterHints />
				<div className="pktw-flex pktw-items-center pktw-gap-3">
					{hasAnalyzed && (
						<>
							<div className="pktw-text-xs pktw-text-[#999999] pktw-flex pktw-items-center pktw-gap-1">
								<Sparkles className="pktw-w-3 pktw-h-3" />
								<span>
									Used: <strong className="pktw-text-[#2e3338]">~1,240 tokens</strong>
								</span>
							</div>
							<Button
								onClick={() => setShowSaveDialog(true)}
								size="sm"
								className="pktw-px-4 pktw-py-1.5 pktw-text-sm pktw-bg-[#7c3aed] pktw-text-white hover:pktw-bg-[#6d28d9] !pktw-rounded-md"
							>
								<Save className="pktw-w-3.5 pktw-h-3.5" />
								Save to File
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Save Dialog */}
			{showSaveDialog && <SaveDialog onClose={() => setShowSaveDialog(false)} />}
		</div>
	);
};


