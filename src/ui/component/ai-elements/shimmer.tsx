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
  as: Component = "p",
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
        "pktw-relative pktw-inline-block pktw-bg-[length:250%_100%,auto] pktw-bg-clip-text pktw-text-transparent",
        "pktw-[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] pktw-[background-repeat:no-repeat,padding-box]",
        "pktw-animate-[shimmer_2s_linear_infinite]",
        className
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);

