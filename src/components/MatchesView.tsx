import { useState } from 'react';
import { BadgeCheck, ChevronRight, Heart, RotateCcw, Search, Star } from 'lucide-react';
import type { MatchProfile } from '../../lib/types.ts';

interface MatchesViewProps {
  currentUserId: string;
  matches: MatchProfile[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onGoToSwipe: () => void;
  onOpenChat: (match: MatchProfile) => void;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Now';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NewMatchAvatar({
  match,
  onSelect,
}: {
  match: MatchProfile;
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="shrink-0 w-[74px] flex flex-col items-center gap-1.5 group focus-visible:outline-none"
    >
      <div className="relative w-16 h-16 rounded-full p-0.5 bg-gradient-to-tr from-[#D63846] to-[#F59E0B] group-focus-visible:ring-2 group-focus-visible:ring-[#D63846]">
        <div className="w-full h-full rounded-full overflow-hidden border-2 border-[#FAF9F7] bg-[#E5E0D8]">
          {!failed ? (
            <img
              src={match.photo_url}
              alt={match.name}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-display font-bold text-[#3B3834]">
              {match.name[0]}
            </div>
          )}
        </div>
        {match.is_super_match && (
          <span
            aria-label="Super Match"
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#2563EB] text-white border-2 border-[#FAF9F7] flex items-center justify-center"
          >
            <Star className="w-2.5 h-2.5 fill-current" />
          </span>
        )}
      </div>
      <span className="text-xs font-semibold text-[#141413] truncate w-full text-center">
        {match.name.split(' ')[0]}
      </span>
    </button>
  );
}

function ConversationRow({
  currentUserId,
  match,
  onSelect,
}: {
  currentUserId: string;
  match: MatchProfile;
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const lastMsg = match.last_message;
  const hasUnread = match.unread_count > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3.5 py-3 px-2 rounded-2xl hover:bg-black/4 active:bg-black/6 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846]"
    >
      <div className="relative w-14 h-14 rounded-full overflow-hidden bg-[#E5E0D8] shrink-0 border border-black/8">
        {!failed ? (
          <img
            src={match.photo_url}
            alt={match.name}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-display font-bold text-[#3B3834]">
            {match.name[0]}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-display text-[15px] font-bold text-[#141413] truncate">
              {match.name}
            </h3>
            {match.verified && (
              <BadgeCheck
                aria-label="Verified"
                className="w-3.5 h-3.5 text-[#0284C7] fill-[#38BDF8]/20 shrink-0"
              />
            )}
            {match.is_super_match && (
              <Star className="w-3.5 h-3.5 text-[#2563EB] fill-current shrink-0" />
            )}
          </div>
          <span className="text-[11px] text-[#6B6862] tabular-nums shrink-0">
            {formatRelativeTime(lastMsg?.created_at ?? match.matched_at)}
          </span>
        </div>

        <p
          className={`text-xs truncate mt-0.5 ${
            hasUnread ? 'font-semibold text-[#141413]' : 'text-[#6B6862]'
          }`}
        >
          {lastMsg
            ? `${lastMsg.sender_id === currentUserId ? 'You: ' : ''}${lastMsg.body}`
            : `Matched ${formatRelativeTime(match.matched_at)} · Say hello`}
        </p>
      </div>

      {hasUnread ? (
        <span
          aria-label={`${match.unread_count} unread messages`}
          className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#D63846] text-white text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0"
        >
          {match.unread_count}
        </span>
      ) : (
        <ChevronRight className="w-4 h-4 text-[#9E9990] shrink-0" />
      )}
    </button>
  );
}

export function MatchesView({
  currentUserId,
  matches,
  loading,
  error,
  onRetry,
  onGoToSwipe,
  onOpenChat,
}: MatchesViewProps) {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favs'>('all');

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((slot) => (
            <div key={slot} className="w-16 h-16 rounded-full bg-[#E8E3DA] animate-pulse shrink-0" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="h-16 rounded-2xl bg-[#E8E3DA] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mb-4">
          <RotateCcw className="w-5 h-5" />
        </div>
        <h2 className="font-display text-lg font-bold text-[#141413]">
          Couldn&apos;t load matches
        </h2>
        <p className="text-sm text-[#6B6862] mt-1.5 max-w-[260px]">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#141413] text-white text-sm font-semibold hover:bg-[#2A2A28] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FCE7EA] text-[#D63846] flex items-center justify-center mb-4">
          <Heart className="w-6 h-6" />
        </div>
        <h2 className="font-display text-xl font-bold text-[#141413] tracking-tight">
          No matches yet
        </h2>
        <p className="text-sm text-[#6B6862] mt-2 max-w-[260px] leading-relaxed">
          Interest stays completely private until both of you like each other.
        </p>
        <button
          type="button"
          onClick={onGoToSwipe}
          className="mt-6 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#D63846] text-white text-sm font-semibold hover:bg-[#BE2F3C] transition-colors"
        >
          Start swiping
        </button>
      </div>
    );
  }

  const favMatchesCount = matches.filter((m) => m.is_super_match).length;
  const modeMatches =
    filterMode === 'favs' ? matches.filter((m) => m.is_super_match) : matches;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredMatches = normalizedQuery
    ? modeMatches.filter(
        (m) =>
          m.name.toLowerCase().includes(normalizedQuery) ||
          m.city_or_college.toLowerCase().includes(normalizedQuery),
      )
    : modeMatches;

  const newMatches = filteredMatches.filter((m) => !m.last_message);
  const conversations = [...filteredMatches].sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.matched_at;
    const bTime = b.last_message?.created_at ?? b.matched_at;
    return bTime.localeCompare(aTime);
  });

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* Search Bar & Filter */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8A857C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search matches..."
            aria-label="Search matches"
            className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#ECE8E1]/75 text-sm text-[#141413] placeholder:text-[#8A857C] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#D63846]"
          />
        </div>

        <div
          role="tablist"
          aria-label="Filter matches"
          className="grid grid-cols-2 p-1 rounded-xl bg-[#ECE8E1]/75"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === 'all'}
            onClick={() => setFilterMode('all')}
            className={`min-h-[34px] rounded-lg text-xs font-semibold transition-all ${
              filterMode === 'all'
                ? 'bg-white text-[#141413] shadow-xs'
                : 'text-[#6B6862] hover:text-[#141413]'
            }`}
          >
            All ({matches.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === 'favs'}
            onClick={() => setFilterMode('favs')}
            className={`min-h-[34px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
              filterMode === 'favs'
                ? 'bg-white text-[#1D4ED8] shadow-xs'
                : 'text-[#6B6862] hover:text-[#141413]'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-current text-[#2563EB]" />
            Favs ({favMatchesCount})
          </button>
        </div>
      </div>

      {newMatches.length > 0 && (
        <section aria-label="New matches">
          <div className="flex items-baseline justify-between mb-2.5">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[#6B6862]">
              New matches
            </h2>
            <span className="text-xs text-[#6B6862] tabular-nums">
              {newMatches.length}
            </span>
          </div>

          <div className="flex items-start gap-3 overflow-x-auto pb-1">
            {newMatches.map((match) => (
              <NewMatchAvatar
                key={match.id}
                match={match}
                onSelect={() => onOpenChat(match)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Messages">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[#6B6862]">
            Messages
          </h2>
          <span className="text-xs text-[#6B6862] tabular-nums">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <p className="text-xs text-[#6B6862] py-6 text-center">
            {normalizedQuery
              ? <>No matches match &ldquo;{query}&rdquo;.</>
              : 'No Fav matches yet. Tap Fav (★) or swipe up on someone special.'}
          </p>
        ) : (
          <div className="divide-y divide-black/6">
            {conversations.map((match) => (
              <ConversationRow
                key={match.id}
                currentUserId={currentUserId}
                match={match}
                onSelect={() => onOpenChat(match)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
