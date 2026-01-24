import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface TooltipProps {
  children: React.ReactNode;
  content: string;
  className?: string;
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  ({ children, content, className }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const timeoutRef = React.useRef<number>();
    const childRef = React.useRef<HTMLDivElement>(null);

    const updatePosition = () => {
      if (childRef.current) {
        const rect = childRef.current.getBoundingClientRect();
        setPosition({
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 5,
        });
      }
    };

    const showTooltip = () => {
      timeoutRef.current = window.setTimeout(() => {
        updatePosition();
        setIsVisible(true);
      }, 100);
    };

    const hideTooltip = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsVisible(false);
    };

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    return (
      <div
        className="relative inline-block"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        ref={childRef}
      >
        <div className="cursor-help">{children}</div>
        {isVisible && (
          <div
            ref={ref}
            className={cn(
              'absolute z-50 px-3 py-2 text-sm text-white bg-slate-900 rounded shadow-lg max-w-[300px] break-words',
              className
            )}
            style={{
              left: position.x,
              top: position.y,
              transform: 'translateX(-50%)',
            }}
          >
            {content}
          </div>
        )}
      </div>
    );
  }
);

Tooltip.displayName = 'Tooltip';

export { Tooltip };
