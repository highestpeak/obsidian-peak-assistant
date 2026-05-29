/**
 * Placeholder shown for steps that will land in PR3 (preferences, running
 * curator, review recommendation). Keeps the wizard navigable end-to-end in
 * PR2 so users can verify the flow up to the bootstrap pick.
 */

import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { ChevronLeft, Hammer } from 'lucide-react';

export interface CuratorPlaceholderStepProps {
    onBack: () => void;
    onClose: () => void;
}

export function CuratorPlaceholderStep({ onBack, onClose }: CuratorPlaceholderStepProps) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-5 pktw-py-8 pktw-px-8">
            <Hammer size={32} className="pktw-text-[--text-muted]" />
            <div className="pktw-text-center pktw-max-w-md">
                <span className="pktw-block pktw-text-base pktw-font-semibold pktw-text-[--text-normal] pktw-mb-2">
                    配置助手即将上线 (PR3)
                </span>
                <span className="pktw-block pktw-text-sm pktw-text-[--text-muted] pktw-leading-relaxed">
                    Bootstrap model 已记录。下一步会回答 2 个偏好问题，
                    然后让配置助手基于你的环境推荐三档绑定。
                </span>
            </div>
            <div className="pktw-flex pktw-gap-2">
                <Button variant="ghost" size="sm" onClick={onBack} className="pktw-gap-1">
                    <ChevronLeft size={14} /> 返回
                </Button>
                <Button size="sm" onClick={onClose}>
                    暂时关闭
                </Button>
            </div>
        </div>
    );
}
