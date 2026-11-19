import { SlidersHorizontal } from 'lucide-react';

interface DiscoverHeaderProps {
  hasActiveFilters: boolean;
  onOpenPreferences: () => void;
}

export function DiscoverHeader({
  hasActiveFilters,
  onOpenPreferences,
}: DiscoverHeaderProps) {
  return (
    <header className="shrink-0 h-[52px] px-4 flex items-center justify-between gap-4 bg-[#FAF9F7]/95 backdrop-blur-md border-b border-black/8 z-20">
      <div className="flex items-baseline">
        <span className="font-display text-lg font-extrabold tracking-tight text-[#141413] whitespace-nowrap shrink-0">
          Coy
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenPreferences}
        aria-label="Discovery preferences"
        className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#141413] hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846]"
      >
        <SlidersHorizontal className="w-5 h-5" strokeWidth={2} />
        {hasActiveFilters && (
          <span
            aria-label="Filters active"
            className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#D63846]"
          />
        )}
      </button>
    </header>
  );
}
