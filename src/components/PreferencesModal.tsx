import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import type { DiscoveryPreferences } from '../../lib/types.ts';

interface PreferencesModalProps {
  open: boolean;
  preferences: DiscoveryPreferences;
  saving: boolean;
  onClose: () => void;
  onSave: (prefs: DiscoveryPreferences) => void;
}

export function PreferencesModal({
  open,
  preferences,
  saving,
  onClose,
  onSave,
}: PreferencesModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [minAge, setMinAge] = useState(preferences.min_age);
  const [maxAge, setMaxAge] = useState(preferences.max_age);
  const [maxDistance, setMaxDistance] = useState(preferences.max_distance);
  const [verifiedOnly, setVerifiedOnly] = useState(preferences.verified_only);

  useEffect(() => {
    if (open) {
      setMinAge(preferences.min_age);
      setMaxAge(preferences.max_age);
      setMaxDistance(preferences.max_distance);
      setVerifiedOnly(preferences.verified_only);
    }
  }, [open, preferences]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleReset = () => {
    setMinAge(18);
    setMaxAge(28);
    setMaxDistance(50);
    setVerifiedOnly(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prefs-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[#FAF9F7] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-black/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/8">
              <h2
                id="prefs-heading"
                className="font-display text-lg font-bold text-[#141413]"
              >
                Discovery preferences
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preferences"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#6B6862] hover:text-[#141413] hover:bg-black/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 space-y-6">
              {/* Age Range */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="pref-min-age"
                    className="text-sm font-semibold text-[#141413]"
                  >
                    Age range
                  </label>
                  <span className="text-sm font-medium text-[#6B6862] tabular-nums">
                    {minAge} – {maxAge}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[11px] text-[#6B6862] mb-1">
                      Minimum age
                    </span>
                    <input
                      id="pref-min-age"
                      type="range"
                      min={18}
                      max={28}
                      value={minAge}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMinAge(val);
                        if (val > maxAge) setMaxAge(val);
                      }}
                      className="w-full accent-[#D63846]"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B6862] mb-1">
                      Maximum age
                    </span>
                    <input
                      id="pref-max-age"
                      aria-label="Maximum age"
                      type="range"
                      min={18}
                      max={28}
                      value={maxAge}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMaxAge(val);
                        if (val < minAge) setMinAge(val);
                      }}
                      className="w-full accent-[#D63846]"
                    />
                  </div>
                </div>
              </div>

              {/* Maximum Distance */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="pref-distance"
                    className="text-sm font-semibold text-[#141413]"
                  >
                    Maximum distance
                  </label>
                  <span className="text-sm font-medium text-[#6B6862] tabular-nums">
                    Up to {maxDistance} mi
                  </span>
                </div>
                <input
                  id="pref-distance"
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  className="w-full accent-[#D63846]"
                />
              </div>

              {/* Verified Only */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <p className="text-sm font-semibold text-[#141413]">
                    Verified profiles only
                  </p>
                  <p className="text-xs text-[#6B6862] mt-0.5">
                    Show only photo-verified members in your feed.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={verifiedOnly}
                  aria-label="Verified profiles only"
                  onClick={() => setVerifiedOnly((v) => !v)}
                  className={`relative w-12 h-7 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D63846] ${
                    verifiedOnly ? 'bg-[#D63846]' : 'bg-[#D6D1C8]'
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      verifiedOnly ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-black/8 flex items-center gap-3 pb-safe">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-black/12 text-sm font-semibold text-[#141413] hover:bg-[#F3F0EA] transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onSave({
                    min_age: minAge,
                    max_age: maxAge,
                    max_distance: maxDistance,
                    verified_only: verifiedOnly,
                  })
                }
                className="flex-[1.6] min-h-[46px] px-4 py-2.5 rounded-xl bg-[#D63846] text-white text-sm font-semibold hover:bg-[#BE2F3C] transition-colors disabled:opacity-60"
              >
                {saving ? 'Applying...' : 'Apply filters'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
