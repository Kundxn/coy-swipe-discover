import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BadgeCheck,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { Profile, SwipeAction } from '../../lib/types.ts';

interface ProfileDetailModalProps {
  profile: Profile | null;
  onClose: () => void;
  onAction?: (action: SwipeAction) => void;
  onReport?: (profile: Profile) => void;
}

export function ProfileDetailModal({
  profile,
  onClose,
  onAction,
  onReport,
}: ProfileDetailModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [profile, onClose]);

  const photos = profile
    ? profile.photos.length > 0
      ? profile.photos
      : [profile.photo_url]
    : [];

  return (
    <AnimatePresence>
      {profile && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Full profile for ${profile.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] h-[92dvh] sm:h-[85dvh] bg-[#FAF9F7] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-black/10"
          >
            {/* Top Bar */}
            <div className="shrink-0 h-[52px] px-4 flex items-center justify-between border-b border-black/8 bg-[#FAF9F7]">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="font-display text-base font-bold text-[#141413] truncate">
                  {profile.name}, <span className="tabular-nums">{profile.age}</span>
                </h2>
                {profile.verified && (
                  <span
                    aria-label="Verified profile"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] shrink-0"
                  >
                    <BadgeCheck className="w-4 h-4 text-[#0284C7] fill-[#38BDF8]/20" />
                    <span>Verified</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile details"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#6B6862] hover:text-[#141413] hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Profile Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Photo Carousel */}
              <div className="relative aspect-[3/4] w-full bg-[#E5E0D8]">
                <img
                  src={photos[Math.min(photoIndex, photos.length - 1)]}
                  alt={`${profile.name} photo ${photoIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />

                {photos.length > 1 && (
                  <>
                    <div className="absolute top-3 inset-x-4 flex gap-1.5 pointer-events-none">
                      {photos.map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            idx === photoIndex ? 'bg-white' : 'bg-white/35'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPhotoIndex((prev) =>
                          prev > 0 ? prev - 1 : photos.length - 1,
                        )
                      }
                      aria-label="Previous photo"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/35 text-white hover:bg-black/55 flex items-center justify-center backdrop-blur-xs transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPhotoIndex((prev) =>
                          prev < photos.length - 1 ? prev + 1 : 0,
                        )
                      }
                      aria-label="Next photo"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/35 text-white hover:bg-black/55 flex items-center justify-center backdrop-blur-xs transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Structured Profile Details */}
              <div className="p-5 space-y-6">
                {/* Basics */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#141413]">
                    <Briefcase className="w-4 h-4 text-[#6B6862] shrink-0" />
                    <span className="font-medium">
                      {profile.job_or_major || 'Student & Creative'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#141413]">
                    <MapPin className="w-4 h-4 text-[#6B6862] shrink-0" />
                    <span>
                      {profile.city_or_college}
                      {profile.distance_miles > 0 && (
                        <span className="text-[#6B6862] tabular-nums">
                          {' '}
                          · {profile.distance_miles} miles away
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#141413]">
                    <Sparkles className="w-4 h-4 text-[#6B6862] shrink-0" />
                    <span>Looking for: {profile.looking_for}</span>
                  </div>
                </div>

                {/* About */}
                <div className="pt-4 border-t border-black/8">
                  <h3 className="text-xs font-semibold text-[#6B6862] mb-1.5">
                    About
                  </h3>
                  <p className="text-[15px] leading-relaxed text-[#141413]">
                    {profile.bio}
                  </p>
                </div>

                {/* Bumble/Hinge style Q&A Prompts */}
                {profile.prompts.length > 0 && (
                  <div className="pt-4 border-t border-black/8 space-y-4">
                    <h3 className="text-xs font-semibold text-[#6B6862]">
                      Prompts
                    </h3>
                    {profile.prompts.map((prompt) => (
                      <div
                        key={prompt.question}
                        className="rounded-2xl bg-[#F2EFE9] p-4 border border-black/6"
                      >
                        <p className="text-xs font-semibold text-[#6B6862]">
                          {prompt.question}
                        </p>
                        <p className="font-display text-base font-semibold text-[#141413] mt-1.5 leading-snug">
                          {prompt.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interests */}
                {profile.interests.length > 0 && (
                  <div className="pt-4 border-t border-black/8 pb-2">
                    <h3 className="text-xs font-semibold text-[#6B6862] mb-2">
                      Interests
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#141413]">
                      {profile.interests.map((interest, idx) => (
                        <span key={interest} className="inline-flex items-center gap-2">
                          {idx > 0 && (
                            <span aria-hidden="true" className="text-[#9E9990]">
                              ·
                            </span>
                          )}
                          <span>{interest}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {onReport && (
                  <div className="pt-4 border-t border-black/8 pb-4 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onReport(profile);
                      }}
                      className="text-xs font-semibold text-[#6B6862] hover:text-[#DC2626] py-2 px-3 transition-colors"
                    >
                      Block or report {profile.name.split(' ')[0]}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Footer when inspecting a discovery card */}
            {onAction && (
              <div className="shrink-0 px-6 py-3 bg-[#FAF9F7] border-t border-black/8 flex items-center justify-center gap-5 pb-safe">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAction('pass');
                  }}
                  aria-label={`Pass on ${profile.name}`}
                  className="w-13 h-13 rounded-full bg-white border border-black/12 text-[#DC2626] flex items-center justify-center shadow-sm hover:bg-[#FEF2F2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                >
                  <X className="w-6 h-6" strokeWidth={2.5} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAction('superlike');
                  }}
                  aria-label={`Fav (Super Like) ${profile.name}`}
                  title="Fav / Super Like"
                  className="w-12 h-12 rounded-full bg-white border border-[#2563EB]/25 text-[#2563EB] flex items-center justify-center shadow-sm hover:bg-[#EFF6FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <Star className="w-5 h-5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAction('like');
                  }}
                  aria-label={`Like ${profile.name}`}
                  className="w-13 h-13 rounded-full bg-[#D63846] text-white flex items-center justify-center shadow-md shadow-[#D63846]/25 hover:bg-[#BE2F3C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846]"
                >
                  <Heart className="w-6 h-6 fill-current" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
