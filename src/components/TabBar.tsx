import { Compass, MessageCircle, User } from 'lucide-react';

export type AppTab = 'discover' | 'matches' | 'profile';

interface TabBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  matchCount?: number;
}

export function TabBar({ activeTab, onSelectTab, matchCount = 0 }: TabBarProps) {
  return (
    <nav
      aria-label="Primary navigation"
      className="shrink-0 bg-[#FAF9F7]/95 backdrop-blur-md border-t border-black/8 pb-safe z-30 touch-none select-none"
    >
      <div className="grid grid-cols-3 h-14">
        <button
          type="button"
          onClick={() => onSelectTab('discover')}
          aria-current={activeTab === 'discover' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D63846] ${
            activeTab === 'discover'
              ? 'text-[#D63846]'
              : 'text-[#6B6862] hover:text-[#141413]'
          }`}
        >
          <Compass className="w-5 h-5" strokeWidth={activeTab === 'discover' ? 2.4 : 1.8} />
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap shrink-0">
            Discover
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('matches')}
          aria-current={activeTab === 'matches' ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D63846] ${
            activeTab === 'matches'
              ? 'text-[#D63846]'
              : 'text-[#6B6862] hover:text-[#141413]'
          }`}
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5" strokeWidth={activeTab === 'matches' ? 2.4 : 1.8} />
            {matchCount > 0 && (
              <span
                aria-label={`${matchCount} mutual matches`}
                className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#D63846] text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
              >
                {matchCount}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap shrink-0">
            Matches
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('profile')}
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D63846] ${
            activeTab === 'profile'
              ? 'text-[#D63846]'
              : 'text-[#6B6862] hover:text-[#141413]'
          }`}
        >
          <User className="w-5 h-5" strokeWidth={activeTab === 'profile' ? 2.4 : 1.8} />
          <span className="text-[11px] font-medium tracking-tight whitespace-nowrap shrink-0">
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
}
