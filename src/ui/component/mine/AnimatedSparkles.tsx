import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Animated Sparkles component that only animates during search/analysis
 */
const AnimatedSparkles: React.FC<{ isAnimating: boolean }> = ({ isAnimating }) => {
	return (
		<div className="pktw-relative pktw-w-16 pktw-h-16">
			<style dangerouslySetInnerHTML={{
				__html: `
					@keyframes colorChange {
						0%, 100% { stroke: #3b82f6; }
						50% { stroke: #8b5cf6; }
					}
					@keyframes sparkRotate {
						0% { transform: rotate(0deg); }
						50% { transform: rotate(360deg); }
						100% { transform: rotate(360deg); }
					}
					@keyframes scanArc {
						0%    {clip-path: polygon(50% 50%,0       0,  50%   0%,  50%    0%, 50%    0%, 50%    0%, 50%    0% )}
						12.5% {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100%   0%, 100%   0%, 100%   0% )}
						25%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 100% 100%, 100% 100% )}
						50%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
						62.5% {clip-path: polygon(50% 50%,100%    0, 100%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
						75%   {clip-path: polygon(50% 50%,100% 100%, 100% 100%,  100% 100%, 100% 100%, 50%  100%, 0%   100% )}
						100%  {clip-path: polygon(50% 50%,50%  100%,  50% 100%,   50% 100%,  50% 100%, 50%  100%, 0%   100% )}
					}
					@keyframes rotateFlip {
						0%    {transform:scaleY(1)  rotate(0deg)}
						49.99%{transform:scaleY(1)  rotate(135deg)}
						50%   {transform:scaleY(-1) rotate(0deg)}
						100%  {transform:scaleY(-1) rotate(-135deg)}
					}
				`
			}} />

			{/* Ring background - only shown during animation */}
			{isAnimating && (
				<div
					className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-border pktw-border-blue-200"
					style={{
						borderWidth: '1px',
					}}
				/>
			)}

			{/* Arc scan bar - only shown during animation */}
			{isAnimating && (
				<div
					className="pktw-absolute pktw-inset-0 pktw-rounded-full"
					style={{
						background: 'linear-gradient(90deg, transparent 0%, #8b5cf6 10%, #8b5cf6 50%, #3b82f6 80%, #ef4444 90%, transparent 100%)',
						animation: 'scanArc 0.8s infinite linear alternate, rotateFlip 1.6s infinite linear',
					}}
				/>
			)}

			{/* Center icon */}
			<div className="pktw-absolute pktw-inset-1 pktw-flex pktw-items-center pktw-justify-center pktw-rounded-full pktw-bg-white">
				<Sparkles
					className="pktw-w-7 pktw-h-7"
					style={{
						color: '#3b82f6',
						animation: isAnimating ? 'colorChange 1.5s ease-in-out infinite, sparkRotate 2.5s ease-in-out infinite' : 'none',
					}}
				/>
			</div>
		</div>
	);
};

export { AnimatedSparkles };