import { useCallback, useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { Heart, RotateCcw, SlidersHorizontal, Sparkles, Star, X } from 'lucide-react';
import type { Profile, SwipeAction } from '../../lib/types.ts';
import { ProfileCard } from './ProfileCard.tsx';

interface SwipeDeckProps {
  profiles: Profile[];
  loading: boolean;
  error: string | null;
  canRewind: boolean;
  isOverlayOpen: boolean;
  hasActiveFilters: boolean;
  toastMessage: string | null;
  onDismissToast: () => void;
  onRetry: () => void;
  onSwipe: (profile: Profile, action: SwipeAction) => void;
  onRewind: () => void;
  onInspectProfile: (profile: Profile) => void;
  onOpenPreferences: () => void;
  onViewMatches: () => void;
}

interface DraggableTopCardProps {
  profile: Profile;
  pendingAction: SwipeAction | null;
  onTriggerSwipe: (action: SwipeAction) => void;
  onOpenDetails: () => void;
  registerFlyOut: (fn: ((action: SwipeAction) => Promise<void>) | null) => void;
}

function DraggableTopCard({
  profile,
  pendingAction,
  onTriggerSwipe,
  onOpenDetails,
  registerFlyOut,
}: DraggableTopCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [24, 110], [0, 1]);
  const nopeOpacity = useTransform(x, [-110, -24], [1, 0]);
  const superLikeOpacity = useTransform(y, [-110, -32], [1, 0]);
  const isAnimatingRef = useRef(false);

  const flyOut = useCallback(
    async (action: SwipeAction) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      const duration = prefersReducedMotion ? 0.08 : 0.22;

      if (action === 'superlike') {
        await animate(y, -560, { duration, ease: [0.22, 1, 0.36, 1] });
      } else {
        const targetX = action === 'like' ? 460 : -460;
        await animate(x, targetX, { duration, ease: [0.22, 1, 0.36, 1] });
      }
    },
    [prefersReducedMotion, x, y],
  );

  useEffect(() => {
    registerFlyOut(flyOut);
    return () => registerFlyOut(null);
  }, [flyOut, registerFlyOut]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (isAnimatingRef.current) return;

    const swipedUp =
      (info.offset.y < -110 || info.velocity.y < -520) &&
      Math.abs(info.offset.x) < 90;
    const swipedRight = info.offset.x > 100 || info.velocity.x > 500;
    const swipedLeft = info.offset.x < -100 || info.velocity.x < -500;

    if (swipedUp) {
      onTriggerSwipe('superlike');
    } else if (swipedRight) {
      onTriggerSwipe('like');
    } else if (swipedLeft) {
      onTriggerSwipe('pass');
    } else {
      animate(x, 0, { type: 'spring', stiffness: 460, damping: 32 });
      animate(y, 0, { type: 'spring', stiffness: 460, damping: 32 });
    }
  };

  return (
    <motion.div
      style={{
        x,
        y,
        rotate: prefersReducedMotion ? 0 : rotate,
        touchAction: 'none',
      }}
      drag={pendingAction ? false : true}
      dragElastic={0.75}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      whileDrag={{ cursor: 'grabbing' }}
      className="absolute inset-0 cursor-grab z-10 will-change-transform"
    >
      <ProfileCard
        profile={profile}
        likeOpacity={likeOpacity}
        nopeOpacity={nopeOpacity}
        superLikeOpacity={superLikeOpacity}
        forcedOverlay={pendingAction}
        onOpenDetails={onOpenDetails}
        interactivePhotos
      />
    </motion.div>
  );
}

export function SwipeDeck({
  profiles,
  loading,
  error,
  canRewind,
  isOverlayOpen,
  hasActiveFilters,
  toastMessage,
  onDismissToast,
  onRetry,
  onSwipe,
  onRewind,
  onInspectProfile,
  onOpenPreferences,
  onViewMatches,
}: SwipeDeckProps) {
  const [pendingAction, setPendingAction] = useState<SwipeAction | null>(null);
  const flyOutRef = useRef<((action: SwipeAction) => Promise<void>) | null>(null);

  const topProfile = profiles[0] ?? null;
  const nextProfile = profiles[1] ?? null;

  const registerFlyOut = useCallback(
    (fn: ((action: SwipeAction) => Promise<void>) | null) => {
      flyOutRef.current = fn;
    },
    [],
  );

  const handleAction = useCallback(
    async (action: SwipeAction) => {
      if (!topProfile || pendingAction || isOverlayOpen) return;
      setPendingAction(action);
      try {
        if (flyOutRef.current) {
          await flyOutRef.current(action);
        }
        onSwipe(topProfile, action);
      } finally {
        setPendingAction(null);
      }
    },
    [isOverlayOpen, onSwipe, pendingAction, topProfile],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isOverlayOpen || loading || error || pendingAction) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === 'z' || event.key === 'Z') {
        if (canRewind) {
          event.preventDefault();
          onRewind();
        }
        return;
      }

      if (!topProfile) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void handleAction('pass');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        void handleAction('like');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        void handleAction('superlike');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canRewind,
    error,
    handleAction,
    isOverlayOpen,
    loading,
    onRewind,
    pendingAction,
    topProfile,
  ]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col px-4 pt-3 pb-4 overflow-hidden">
        <div
          aria-label="Loading profiles"
          aria-busy="true"
          className="flex-1 rounded-3xl bg-[#E8E3DA] animate-pulse relative overflow-hidden"
        >
          <div className="absolute inset-x-0 bottom-0 p-5 space-y-3">
            <div className="h-7 w-44 rounded-lg bg-black/10" />
            <div className="h-4 w-32 rounded-md bg-black/10" />
            <div className="h-4 w-full rounded-md bg-black/10" />
            <div className="h-4 w-3/4 rounded-md bg-black/10" />
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-center gap-4 pt-4 pb-1">
          <div className="w-11 h-11 rounded-full bg-[#E8E3DA] animate-pulse" />
          <div className="w-14 h-14 rounded-full bg-[#E8E3DA] animate-pulse" />
          <div className="w-12 h-12 rounded-full bg-[#E8E3DA] animate-pulse" />
          <div className="w-14 h-14 rounded-full bg-[#E8E3DA] animate-pulse" />
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
          Couldn&apos;t load profiles
        </h2>
        <p className="text-sm text-[#6B6862] mt-1.5 max-w-[260px]">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#141413] text-white text-sm font-semibold hover:bg-[#2A2A28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846] focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!topProfile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FCE7EA] text-[#D63846] flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="font-display text-xl font-bold text-[#141413] tracking-tight">
          You&apos;re all caught up
        </h2>
        <p className="text-sm text-[#6B6862] mt-2 max-w-[270px] leading-relaxed">
          {hasActiveFilters
            ? 'No remaining profiles match your current filters. Try widening your preferences.'
            : 'You’ve seen everyone nearby for now. Check back soon or chat with your mutual matches.'}
        </p>

        <div className="mt-6 flex flex-col w-full max-w-[240px] gap-2.5">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onOpenPreferences}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-semibold hover:bg-[#2A2A28] transition-colors inline-flex items-center justify-center gap-2"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Adjust filters
            </button>
          )}
          <button
            type="button"
            onClick={onViewMatches}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D63846] text-white text-sm font-semibold hover:bg-[#BE2F3C] transition-colors"
          >
            View matches
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-3 pb-4 overflow-hidden overscroll-none relative">
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-3 left-4 right-4 z-30 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-medium shadow-lg"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={onDismissToast}
            aria-label="Dismiss notification"
            className="p-1 text-white/70 hover:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Card Stack Stage */}
      <div className="flex-1 min-h-0 relative touch-none overscroll-none">
        {nextProfile && (
          <div
            aria-hidden="true"
            className="absolute inset-0 scale-[0.95] translate-y-2.5 opacity-85 transition-transform duration-200 pointer-events-none"
          >
            <ProfileCard profile={nextProfile} />
          </div>
        )}

        <DraggableTopCard
          key={topProfile.id}
          profile={topProfile}
          pendingAction={pendingAction}
          onTriggerSwipe={handleAction}
          onOpenDetails={() => onInspectProfile(topProfile)}
          registerFlyOut={registerFlyOut}
        />
      </div>

      {/* 4-Button Tactile Bumble/Tinder Action Bar */}
      <div className="shrink-0 relative z-20 flex items-center justify-center gap-5 pt-3.5 pb-1 select-none touch-none">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 flex items-center justify-center">
            <button
              type="button"
              onClick={onRewind}
              disabled={!canRewind || Boolean(pendingAction)}
              aria-label="Swipe back (Rewind last swipe)"
              title="Swipe back (Z)"
              className="w-11 h-11 rounded-full bg-white border border-black/10 text-[#D97706] flex items-center justify-center shadow-xs hover:bg-[#FFFBEB] active:scale-95 transition-all disabled:opacity-35 disabled:hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706]"
            >
              <RotateCcw className="w-4.5 h-4.5" strokeWidth={2.3} />
            </button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#6B6862] leading-none">
            Back
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 flex items-center justify-center">
            <button
              type="button"
              onClick={() => void handleAction('pass')}
              disabled={Boolean(pendingAction)}
              aria-label={`Pass on ${topProfile.name}`}
              title="Pass (Left Arrow)"
              className="w-14 h-14 rounded-full bg-white border border-black/12 text-[#DC2626] flex items-center justify-center shadow-sm hover:bg-[#FEF2F2] hover:border-[#DC2626]/40 active:scale-95 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2"
            >
              <X className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#6B6862] leading-none">
            Nope
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 flex items-center justify-center">
            <button
              type="button"
              onClick={() => void handleAction('superlike')}
              disabled={Boolean(pendingAction)}
              aria-label={`Fav (Super Like) ${topProfile.name}`}
              title="Fav / Super Like (Up Arrow)"
              className="w-12 h-12 rounded-full bg-white border border-[#2563EB]/25 text-[#2563EB] flex items-center justify-center shadow-sm hover:bg-[#EFF6FF] active:scale-95 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <Star className="w-5 h-5 fill-current" />
            </button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#2563EB] leading-none">
            Fav
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 flex items-center justify-center">
            <button
              type="button"
              onClick={() => void handleAction('like')}
              disabled={Boolean(pendingAction)}
              aria-label={`Like ${topProfile.name}`}
              title="Like (Right Arrow)"
              className="w-14 h-14 rounded-full bg-[#D63846] text-white flex items-center justify-center shadow-md shadow-[#D63846]/25 hover:bg-[#BE2F3C] active:scale-95 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846] focus-visible:ring-offset-2"
            >
              <Heart className="w-6 h-6 fill-current" />
            </button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#D63846] leading-none">
            Like
          </span>
        </div>
      </div>
    </div>
  );
}
