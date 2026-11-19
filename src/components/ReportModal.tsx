import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ShieldAlert, X } from 'lucide-react';
import type { Profile, ReportReason } from '../../lib/types.ts';
import { apiFetch } from '../utils/api.ts';

interface ReportModalProps {
  target: Profile | null;
  onClose: () => void;
  onCompleted: (targetId: string, blocked: boolean) => void;
}

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'inappropriate_content', label: 'Inappropriate photos or bio' },
  { value: 'harassment', label: 'Harassment or disrespectful behavior' },
  { value: 'spam_or_fake', label: 'Spam, scam, or fake profile' },
  { value: 'other', label: 'Something else' },
];

export function ReportModal({ target, onClose, onCompleted }: ReportModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const [reason, setReason] = useState<ReportReason>('inappropriate_content');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setReason('inappropriate_content');
      setDetails('');
      setAlsoBlock(true);
    }
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(target.id)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, details, block: alsoBlock }),
      });
      if (res.ok) {
        onCompleted(target.id, alsoBlock);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs"
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { y: 36, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: 36, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[#FAF9F7] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-black/10"
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/8">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#DC2626]" />
                <h2 id="report-heading" className="font-display text-base font-bold text-[#141413]">
                  Report {target.name.split(' ')[0]}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close report dialog"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#6B6862] hover:text-[#141413]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pt-4 space-y-4">
              <div className="space-y-2">
                {REASONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      reason === opt.value
                        ? 'bg-white border-[#D63846] text-[#141413]'
                        : 'bg-white/60 border-black/8 text-[#3B3834]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={opt.value}
                      checked={reason === opt.value}
                      onChange={() => setReason(opt.value)}
                      className="accent-[#D63846]"
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                  Additional details (optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Share context for our safety team..."
                  className="w-full p-3 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-medium text-[#141413] cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={(e) => setAlsoBlock(e.target.checked)}
                  className="w-4 h-4 accent-[#D63846] rounded"
                />
                <span>Also block {target.name.split(' ')[0]} and hide our conversation</span>
              </label>

              <div className="flex gap-2.5 pt-2 pb-safe">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[46px] rounded-xl bg-white border border-black/12 text-sm font-semibold text-[#141413]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[46px] rounded-xl bg-[#DC2626] text-white text-sm font-semibold hover:bg-[#B91C1C] disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
