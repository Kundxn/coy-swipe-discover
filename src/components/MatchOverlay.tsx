import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Send, Star } from 'lucide-react';
import { ME_AVATAR_URL, type Profile } from '../../lib/types.ts';

interface MatchOverlayProps {
  matchedProfile: Profile | null;
  isSuperMatch?: boolean;
  mePhotoUrl?: string;
  onKeepSwiping: () => void;
  onOpenChat: (profile: Profile) => void;
  onSendQuickMessage: (profile: Profile, text: string) => Promise<void>;
}

const CONFETTI_BITS = [
  { id: 1, x: -115, y: -135, rotate: -35, color: '#E84855', delay: 0.04 },
  { id: 2, x: 105, y: -140, rotate: 42, color: '#F59E0B', delay: 0.06 },
  { id: 3, x: -140, y: -35, rotate: 28, color: '#10B981', delay: 0.08 },
  { id: 4, x: 145, y: -45, rotate: -48, color: '#F472B6', delay: 0.05 },
  { id: 5, x: -95, y: 115, rotate: 60, color: '#F59E0B', delay: 0.09 },
  { id: 6, x: 110, y: 110, rotate: -25, color: '#38BDF8', delay: 0.07 },
  { id: 7, x: -45, y: -165, rotate: 18, color: '#38BDF8', delay: 0.03 },
  { id: 8, x: 52, y: -160, rotate: -22, color: '#10B981', delay: 0.05 },
  { id: 9, x: -155, y: 40, rotate: -55, color: '#E84855', delay: 0.1 },
  { id: 10, x: 155, y: 38, rotate: 52, color: '#2563EB', delay: 0.08 },
  { id: 11, x: -20, y: 145, rotate: 14, color: '#F472B6', delay: 0.09 },
  { id: 12, x: 35, y: 140, rotate: -18, color: '#E84855', delay: 0.06 },
];

export function MatchOverlay({
  matchedProfile,
  isSuperMatch = false,
  mePhotoUrl = ME_AVATAR_URL,
  onKeepSwiping,
  onOpenChat,
  onSendQuickMessage,
}: MatchOverlayProps) {
  const prefersReducedMotion = useReducedMotion();
  const [opener, setOpener] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOpener('');
    setSending(false);
  }, [matchedProfile?.id]);

  useEffect(() => {
    if (!matchedProfile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onKeepSwiping();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matchedProfile, onKeepSwiping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedProfile || !opener.trim() || sending) return;
    setSending(true);
    try {
      await onSendQuickMessage(matchedProfile, opener.trim());
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {matchedProfile && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[#141413]/90 backdrop-blur-md"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            className="relative w-full max-w-[360px] rounded-3xl bg-[#FAF9F7] p-6 text-center shadow-2xl border border-white/15 overflow-visible"
          >
            {/* Lightweight confetti burst */}
            {!prefersReducedMotion && (
              <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible"
              >
                {CONFETTI_BITS.map((bit) => (
                  <motion.span
                    key={bit.id}
                    initial={{ x: 0, y: -16, scale: 0, opacity: 1, rotate: 0 }}
                    animate={{
                      x: bit.x,
                      y: bit.y,
                      scale: [0, 1.15, 0.9],
                      opacity: [1, 1, 0],
                      rotate: bit.rotate,
                    }}
                    transition={{
                      duration: 0.85,
                      delay: bit.delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{ backgroundColor: bit.color }}
                    className="absolute w-2.5 h-2.5 rounded-sm"
                  />
                ))}
              </div>
            )}

            {/* Side-by-side avatars */}
            <div className="flex items-center justify-center -space-x-4 mt-2 mb-5 relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#FAF9F7] shadow-md bg-[#E5E0D8] relative z-10">
                <img
                  src={mePhotoUrl}
                  alt="Your profile photo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#FAF9F7] shadow-md bg-[#E5E0D8] relative z-20">
                <img
                  src={matchedProfile.photo_url}
                  alt={matchedProfile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              {isSuperMatch && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-30 w-8 h-8 rounded-full bg-[#2563EB] text-white border-2 border-[#FAF9F7] flex items-center justify-center shadow-sm">
                  <Star className="w-4 h-4 fill-current" />
                </div>
              )}
            </div>

            <h2
              id="match-heading"
              className="font-display text-3xl font-extrabold tracking-tight text-[#141413]"
            >
              {isSuperMatch ? 'Super Match!' : "It's a match!"}
            </h2>

            <p className="text-sm text-[#6B6862] mt-2 leading-relaxed">
              You and <span className="font-semibold text-[#141413]">{matchedProfile.name}</span> both liked each other.
            </p>

            {/* Quick Opener Form */}
            <form onSubmit={handleSubmit} className="mt-5 flex items-center gap-2">
              <input
                type="text"
                value={opener}
                onChange={(e) => setOpener(e.target.value)}
                placeholder={`Say hi to ${matchedProfile.name.split(' ')[0]}...`}
                aria-label="Send an opening message"
                className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] placeholder:text-[#8A857C] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
              />
              <button
                type="submit"
                disabled={!opener.trim() || sending}
                aria-label="Send opening message"
                className="w-11 h-11 shrink-0 rounded-xl bg-[#D63846] text-white flex items-center justify-center hover:bg-[#BE2F3C] transition-colors disabled:opacity-45"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onOpenChat(matchedProfile)}
                className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#141413] text-white text-sm font-semibold hover:bg-[#2A2A28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413] focus-visible:ring-offset-2"
              >
                Open chat
              </button>

              <button
                type="button"
                onClick={onKeepSwiping}
                className="w-full min-h-[44px] px-5 py-2 rounded-xl text-[#6B6862] hover:text-[#141413] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#141413]"
              >
                Keep swiping
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
