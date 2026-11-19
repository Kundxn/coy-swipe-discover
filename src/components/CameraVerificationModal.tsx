import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BadgeCheck, Camera, Check, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import type { Profile, VerifyProfileResponse } from '../../lib/types.ts';
import { apiFetch } from '../utils/api.ts';
import { compressImageFile } from '../utils/imageUpload.ts';

interface CameraVerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (updatedProfile: Profile) => void;
}

export function CameraVerificationModal({
  open,
  onClose,
  onVerified,
}: CameraVerificationModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraState('starting');
    setCameraError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraState('unavailable');
      setCameraError('Live camera access is unavailable in this browser. Use camera upload below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState('ready');
    } catch {
      setCameraState('unavailable');
      setCameraError(
        'Camera permission was denied or no webcam was found. Capture or upload a selfie using your device camera below.',
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCapturedPhoto(null);
      setSubmitError(null);
      return;
    }

    if (!capturedPhoto) {
      void startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open, capturedPhoto, startCamera, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror horizontally to match the front-facing preview
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setCapturedPhoto(dataUrl);
    setSubmitError(null);
  };

  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    try {
      const compressed = await compressImageFile(file, 720);
      stopCamera();
      setCapturedPhoto(compressed);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not read image file.');
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setSubmitError(null);
  };

  const handleSubmitVerification = async () => {
    if (!capturedPhoto || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiFetch('/api/profile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: capturedPhoto }),
      });

      const data = (await res.json()) as Partial<VerifyProfileResponse> & { error?: string };
      if (!res.ok || !data.profile) {
        setSubmitError(data.error ?? 'Could not complete verification.');
        return;
      }

      onVerified(data.profile);
      onClose();
    } catch {
      setSubmitError('Network error while uploading verification photo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Blue check camera verification"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { y: 36, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { y: 36, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[#FAF9F7] rounded-t-3xl sm:rounded-3xl border border-black/10 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
          >
            {/* Header */}
            <div className="shrink-0 h-[54px] px-4 flex items-center justify-between border-b border-black/8">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-5 h-5 text-[#0284C7] fill-[#38BDF8]/20" />
                <h2 className="font-display text-base font-bold text-[#141413]">
                  Photo Verification
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close camera verification"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-[#6B6862] hover:text-[#141413] hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              <p className="text-xs text-[#6B6862] leading-relaxed">
                Take a quick selfie with your camera to earn your{' '}
                <strong className="text-[#141413] font-semibold">Blue Check</strong>{' '}
                verified badge. Your verification photo is stored securely in our database
                and kept private from your public swipe card.
              </p>

              {/* Viewfinder / Captured Photo Stage */}
              <div className="relative aspect-[3/4] w-full max-w-[290px] mx-auto rounded-3xl overflow-hidden bg-[#141413] border border-black/15 shadow-inner flex items-center justify-center">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Captured verification selfie"
                    className="w-full h-full object-cover"
                  />
                ) : cameraState === 'unavailable' ? (
                  <div className="p-6 text-center text-white/85 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto">
                      <Camera className="w-6 h-6 text-[#38BDF8]" />
                    </div>
                    <p className="text-xs leading-relaxed text-white/80">
                      {cameraError}
                    </p>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover -scale-x-100"
                    />
                    {cameraState === 'starting' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-medium">
                        Starting camera...
                      </div>
                    )}
                    {/* Subtle framing oval guide */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-44 h-56 rounded-full border-2 border-dashed border-white/65 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)]" />
                    </div>
                  </>
                )}
              </div>

              {submitError && (
                <p role="alert" className="text-xs font-medium text-[#DC2626] text-center">
                  {submitError}
                </p>
              )}

              {/* Actions */}
              {capturedPhoto ? (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleRetake}
                    disabled={submitting}
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-white border border-black/12 text-sm font-semibold text-[#141413] hover:bg-[#F3F0EA] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitVerification()}
                    disabled={submitting}
                    className="flex-[1.5] min-h-[46px] px-4 rounded-xl bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] inline-flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    {submitting ? 'Verifying...' : 'Get Blue Check'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cameraState === 'ready' && (
                    <button
                      type="button"
                      onClick={handleCaptureFrame}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#0284C7] text-white text-sm font-semibold hover:bg-[#0369A1] transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Camera className="w-4.5 h-4.5" />
                      Take verification photo
                    </button>
                  )}

                  <label className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-black/12 text-xs font-semibold text-[#141413] hover:bg-[#F3F0EA] transition-colors inline-flex items-center justify-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4 text-[#0284C7]" />
                    {cameraState === 'ready'
                      ? 'Or upload selfie from device camera'
                      : 'Open device camera / choose photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="user"
                      onChange={handleFallbackFile}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#6B6862]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Saved privately in Coy DB · Badge shows on your profile</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
