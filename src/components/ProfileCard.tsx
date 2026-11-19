import { useRef, useState } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { BadgeCheck, ChevronUp } from 'lucide-react';
import type { Profile, SwipeAction } from '../../lib/types.ts';

interface ProfileCardProps {
  profile: Profile;
  likeOpacity?: MotionValue<number>;
  nopeOpacity?: MotionValue<number>;
  superLikeOpacity?: MotionValue<number>;
  forcedOverlay?: SwipeAction | null;
  onOpenDetails?: () => void;
  interactivePhotos?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function ProfileCard({
  profile,
  likeOpacity,
  nopeOpacity,
  superLikeOpacity,
  forcedOverlay = null,
  onOpenDetails,
  interactivePhotos = false,
}: ProfileCardProps) {
  const photos = profile.photos.length > 0 ? profile.photos : [profile.photo_url];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const safeIndex = Math.min(photoIndex, photos.length - 1);
  const currentPhoto = photos[safeIndex];
  const isImageBroken = failedIndices.has(safeIndex);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactivePhotos) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactivePhotos || !pointerDownPos.current) return;
    const dx = Math.abs(e.clientX - pointerDownPos.current.x);
    const dy = Math.abs(e.clientY - pointerDownPos.current.y);
    pointerDownPos.current = null;

    // Ignore drags; only treat clean taps as photo navigation
    if (dx > 8 || dy > 8) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    // Taps near bottom copy area open details if handler exists
    if (relY > 0.72 && onOpenDetails) {
      onOpenDetails();
      return;
    }

    if (photos.length <= 1) return;
    if (relX < 0.35) {
      setPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
    } else if (relX > 0.65) {
      setPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
    }
  };

  return (
    <article
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className="relative w-full h-full rounded-3xl overflow-hidden bg-[#E5E0D8] border border-black/8 shadow-[0_14px_34px_-14px_rgba(20,20,19,0.22)] select-none"
    >
      {!isImageBroken ? (
        <img
          src={currentPhoto}
          alt={`${profile.name}, ${profile.age} — photo ${safeIndex + 1} of ${photos.length}`}
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() =>
            setFailedIndices((prev) => new Set(prev).add(safeIndex))
          }
          className="w-full h-full object-cover object-center pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#DED7CC] to-[#C8BFB2] text-[#3B3834] p-6">
          <span className="font-display text-4xl font-bold tracking-tight mb-2">
            {getInitials(profile.name)}
          </span>
          <span className="text-sm font-medium">{profile.name}</span>
        </div>
      )}

      {/* Story Progress Bars */}
      {photos.length > 1 && (
        <div
          aria-hidden="true"
          className="absolute top-3 inset-x-3.5 flex items-center gap-1.5 z-20 pointer-events-none"
        >
          {photos.map((_, idx) => (
            <div
              key={idx}
              className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden backdrop-blur-xs"
            >
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  idx === safeIndex ? 'w-full bg-white' : 'w-0 bg-white'
                }`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Measured contrast scrim for legible bottom metadata */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/92 via-black/52 to-transparent pointer-events-none"
      />

      {/* LIKE overlay stamp */}
      {likeOpacity && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: forcedOverlay === 'like' ? 1 : likeOpacity }}
          className="absolute top-8 left-5 px-3.5 py-1.5 rounded-xl border-[3px] border-[#16A34A] bg-white/95 -rotate-12 pointer-events-none shadow-sm z-20"
        >
          <span className="font-display text-2xl font-extrabold tracking-wider text-[#15803D]">
            LIKE
          </span>
        </motion.div>
      )}

      {/* NOPE overlay stamp */}
      {nopeOpacity && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: forcedOverlay === 'pass' ? 1 : nopeOpacity }}
          className="absolute top-8 right-5 px-3.5 py-1.5 rounded-xl border-[3px] border-[#DC2626] bg-white/95 rotate-12 pointer-events-none shadow-sm z-20"
        >
          <span className="font-display text-2xl font-extrabold tracking-wider text-[#DC2626]">
            NOPE
          </span>
        </motion.div>
      )}

      {/* FAV / SUPER LIKE overlay stamp */}
      {superLikeOpacity && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: forcedOverlay === 'superlike' ? 1 : superLikeOpacity }}
          className="absolute bottom-36 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl border-[3px] border-[#2563EB] bg-white/95 -rotate-6 pointer-events-none shadow-md z-20 whitespace-nowrap"
        >
          <span className="font-display text-xl font-extrabold tracking-wider text-[#1D4ED8]">
            FAV ★
          </span>
        </motion.div>
      )}

      {/* Profile copy */}
      <div className="absolute inset-x-0 bottom-0 p-5 text-white z-10">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-[25px] font-bold tracking-tight leading-tight truncate">
                {profile.name}
              </h2>
              <span className="font-display text-[22px] font-medium text-white/90 tabular-nums shrink-0">
                {profile.age}
              </span>
              {profile.verified && (
                <BadgeCheck
                  aria-label="Verified profile"
                  className="w-5 h-5 text-[#38BDF8] shrink-0 fill-[#38BDF8]/20"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-white/85 mt-0.5">
              <span>{profile.job_or_major || profile.city_or_college}</span>
              <span aria-hidden="true" className="text-white/50">
                ·
              </span>
              <span>{profile.city_or_college}</span>
              {profile.distance_miles > 0 && (
                <>
                  <span aria-hidden="true" className="text-white/50">
                    ·
                  </span>
                  <span className="tabular-nums">{profile.distance_miles} mi</span>
                </>
              )}
            </div>
          </div>

          {onOpenDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              aria-label={`View full profile for ${profile.name}`}
              className="shrink-0 min-w-[44px] min-h-[44px] rounded-full bg-white/18 hover:bg-white/28 backdrop-blur-md text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          )}
        </div>

        <p className="text-[14px] leading-snug text-white/95 mt-2 line-clamp-2 pointer-events-none">
          {profile.bio}
        </p>

        {profile.interests.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-medium text-white/80 pointer-events-none">
            {profile.interests.map((interest, idx) => (
              <span key={interest} className="inline-flex items-center gap-1.5">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-white/50">
                    ·
                  </span>
                )}
                <span>{interest}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
