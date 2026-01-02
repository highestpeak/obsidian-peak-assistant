import React, {
  type CSSProperties,
  type ElementType,
  type JSX,
  memo,
  useMemo,
} from "react";
import { cn } from "@/ui/react/lib/utils";

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "span",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  );

  return (
    <Component
      className={cn(
        "pktw-relative pktw-inline-block pktw-bg-clip-text pktw-text-transparent",
        className
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          // Shimmer effect: white highlight moving over text color
          // First gradient: transparent -> white (highlight) -> transparent (moving)
          // Second gradient: solid text color (base layer)
          backgroundImage: `linear-gradient(90deg, transparent calc(50% - var(--spread)), rgba(255, 255, 255, 0.8) calc(50% - var(--spread)), rgba(255, 255, 255, 0.8) calc(50% + var(--spread)), transparent calc(50% + var(--spread))), linear-gradient(var(--text-normal), var(--text-normal))`,
          backgroundSize: "250% 100%, auto",
          backgroundRepeat: "no-repeat, repeat",
          backgroundClip: "text, padding-box",
          WebkitBackgroundClip: "text, padding-box",
          animation: `pktw-shimmer ${duration}s linear infinite`,
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);

