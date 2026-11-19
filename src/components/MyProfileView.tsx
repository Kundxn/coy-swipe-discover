import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  Check,
  Eye,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Profile, ProfilePrompt } from '../../lib/types.ts';
import { apiFetch } from '../utils/api.ts';
import { compressImageFile } from '../utils/imageUpload.ts';
import { CameraVerificationModal } from './CameraVerificationModal.tsx';
import { ProfileCard } from './ProfileCard.tsx';

interface MyProfileViewProps {
  profile: Profile;
  matchCount: number;
  profileSavedOnce?: boolean;
  onProfileUpdated: (profile: Profile) => void;
  onProfileSavedOnce?: () => void;
}

const LOOKING_FOR_OPTIONS = [
  'Long-term partner',
  'Long-term, open to short',
  'Something genuine',
  'New friends & dating',
  'Figuring it out',
];

const PROMPT_SUGGESTIONS = [
  'My ideal Sunday morning',
  'I get oddly competitive about',
  'A non-negotiable for me',
  'Perfect first date',
  'Two truths and a lie',
  'Green flag I look for',
];

export function MyProfileView({
  profile,
  matchCount,
  profileSavedOnce = false,
  onProfileUpdated,
  onProfileSavedOnce,
}: MyProfileViewProps) {
  const [mode, setMode] = useState<'overview' | 'edit' | 'preview'>(
    profileSavedOnce ? 'overview' : 'edit',
  );
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age);
  const [city, setCity] = useState(profile.city_or_college);
  const [job, setJob] = useState(profile.job_or_major);
  const [lookingFor, setLookingFor] = useState(profile.looking_for);
  const [bio, setBio] = useState(profile.bio);
  const [photos, setPhotos] = useState<string[]>(
    profile.photos.length > 0 ? profile.photos : [profile.photo_url],
  );
  const [interestsInput, setInterestsInput] = useState(profile.interests.join(', '));
  const [prompts, setPrompts] = useState<ProfilePrompt[]>(profile.prompts);

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setAge(profile.age);
    setCity(profile.city_or_college);
    setJob(profile.job_or_major);
    setLookingFor(profile.looking_for);
    setBio(profile.bio);
    setPhotos(profile.photos.length > 0 ? profile.photos : [profile.photo_url]);
    setInterestsInput(profile.interests.join(', '));
    setPrompts(profile.prompts);
  }, [profile]);

  const parsedInterests = interestsInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const previewProfile: Profile = {
    ...profile,
    name: name.trim() || profile.name,
    age,
    photo_url: photos[0] ?? profile.photo_url,
    photos,
    city_or_college: city.trim() || profile.city_or_college,
    job_or_major: job.trim(),
    looking_for: lookingFor || profile.looking_for,
    bio: bio.trim(),
    interests: parsedInterests,
    prompts,
  };

  const handlePhotoUpload = async (
    slotIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileError(null);
    try {
      const compressed = await compressImageFile(file);
      setPhotos((prev) => {
        const next = [...prev];
        if (slotIndex < next.length) {
          next[slotIndex] = compressed;
        } else {
          next.push(compressed);
        }
        return next.slice(0, 6);
      });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to upload image.');
    }
  };

  const handleRemovePhoto = (index: number) => {
    if (photos.length <= 1) return;
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    setProfileError(null);
    try {
      const res = await apiFetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age,
          city_or_college: city.trim(),
          job_or_major: job.trim(),
          looking_for: lookingFor,
          bio: bio.trim(),
          photos,
          interests: parsedInterests,
          prompts,
        }),
      });
      const data = (await res.json()) as { profile?: Profile; error?: string };
      if (!res.ok || !data.profile) {
        setProfileError(data.error ?? 'Could not save profile.');
        return;
      }
      onProfileUpdated(data.profile);
      onProfileSavedOnce?.();
      setMode('overview');
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAF9F7]">
      {/* Header */}
      <header className="shrink-0 h-[52px] px-4 flex items-center justify-between border-b border-black/8">
        <h1 className="font-display text-lg font-bold text-[#141413]">
          Profile
        </h1>

        <div
          role="tablist"
          aria-label="Profile mode"
          className="inline-flex items-center p-1 rounded-xl bg-[#ECE8E1]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'edit'}
            onClick={() =>
              setMode((prev) =>
                prev === 'edit' && profileSavedOnce ? 'overview' : 'edit',
              )
            }
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'edit'
                ? 'bg-white text-[#141413] shadow-xs'
                : 'text-[#6B6862] hover:text-[#141413]'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            onClick={() =>
              setMode((prev) =>
                prev === 'preview'
                  ? profileSavedOnce
                    ? 'overview'
                    : 'edit'
                  : 'preview',
              )
            }
            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'preview'
                ? 'bg-white text-[#141413] shadow-xs'
                : 'text-[#6B6862] hover:text-[#141413]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        </div>
      </header>

      {mode === 'preview' ? (
        <div className="flex-1 p-4 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <ProfileCard profile={previewProfile} interactivePhotos />
          </div>
          <p className="text-center text-xs text-[#6B6862] pt-3">
            Tap left or right on the photo to cycle through your gallery.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* Identity Header */}
          <div className="flex items-center gap-4">
            <img
              src={photos[0] ?? profile.photo_url}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-18 h-18 rounded-full object-cover border-2 border-white shadow-md bg-[#E5E0D8]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-xl font-bold text-[#141413] truncate">
                  {previewProfile.name}, <span className="tabular-nums">{previewProfile.age}</span>
                </h2>
                {profile.verified && (
                  <BadgeCheck
                    aria-label="Verified profile"
                    className="w-5 h-5 text-[#0284C7] fill-[#38BDF8]/20 shrink-0"
                  />
                )}
              </div>
              <p className="text-xs text-[#6B6862] truncate mt-0.5">
                {previewProfile.city_or_college}
              </p>
              <p className="text-xs text-[#6B6862] mt-0.5 tabular-nums">
                {matchCount} mutual {matchCount === 1 ? 'match' : 'matches'}
                {profile.verified ? ' · Blue Check Verified' : ' · Unverified'}
              </p>
            </div>
          </div>

          {/* Blue Check Camera Verification Card */}
          <section
            aria-label="Profile verification"
            className={`rounded-2xl p-4 border ${
              profile.verified
                ? 'bg-[#F0F9FF] border-[#0284C7]/20'
                : 'bg-white border-black/10 shadow-xs'
            }`}
          >
            {profile.verified ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {profile.verification_photo_url ? (
                    <img
                      src={profile.verification_photo_url}
                      alt="Stored camera verification selfie"
                      className="w-12 h-12 rounded-xl object-cover border border-[#0284C7]/25 shrink-0 bg-[#E5E0D8]"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#0284C7]/12 text-[#0284C7] flex items-center justify-center shrink-0">
                      <BadgeCheck className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <BadgeCheck className="w-4 h-4 text-[#0284C7] fill-[#38BDF8]/25 shrink-0" />
                      <span className="font-display text-sm font-bold text-[#0C4A6E]">
                        Verified
                      </span>
                    </div>
                    <p className="text-[11px] text-[#0369A1] mt-0.5 truncate">
                      {profile.verified_at
                        ? `Blue check active · ${new Date(profile.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Blue check active on your profile'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(true)}
                  className="shrink-0 px-3 py-2 min-h-[36px] rounded-xl bg-white border border-[#0284C7]/25 text-xs font-semibold text-[#0369A1] hover:bg-[#E0F2FE] transition-colors"
                >
                  Retake
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[#141413]">
                      Get Blue Check Verified
                    </h3>
                    <p className="text-xs text-[#6B6862] mt-0.5 leading-snug">
                      Take a quick camera selfie to display the verified badge on your profile.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(true)}
                  className="shrink-0 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#0284C7] text-white text-xs font-semibold hover:bg-[#0369A1] transition-colors inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Verify
                </button>
              </div>
            )}
          </section>

          {mode === 'overview' && savedNotice && (
            <div
              role="status"
              className="w-full py-1 text-xs font-semibold text-[#15803D] flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Profile saved
            </div>
          )}

          {mode === 'edit' && (
            <>
              {profileError && (
                <p role="alert" className="text-xs font-medium text-[#DC2626]">
                  {profileError}
                </p>
              )}

              {/* Profile Form */}
              <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Photos Grid */}
            <div>
              <span className="block text-xs font-semibold text-[#6B6862] mb-2">
                Photos (up to 3)
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {[0, 1, 2].map((slot) => {
                  const src = photos[slot];
                  return (
                    <div
                      key={slot}
                      className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#ECE8E1] border border-black/10"
                    >
                      {src ? (
                        <>
                          <img
                            src={src}
                            alt={`Profile photo ${slot + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {photos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(slot)}
                              aria-label={`Remove photo ${slot + 1}`}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <label className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 text-[#141413] flex items-center justify-center cursor-pointer shadow-xs">
                            <Camera className="w-3.5 h-3.5" />
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => handlePhotoUpload(slot, e)}
                              className="sr-only"
                            />
                          </label>
                        </>
                      ) : (
                        <label className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#6B6862] hover:text-[#141413] cursor-pointer">
                          <Plus className="w-5 h-5" />
                          <span className="text-[11px] font-medium">Add</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handlePhotoUpload(slot, e)}
                            className="sr-only"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                  Display name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                  Age
                </label>
                <input
                  type="number"
                  min={18}
                  max={99}
                  required
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                  Role or major
                </label>
                <input
                  type="text"
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                  City or college
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                Looking for
              </label>
              <select
                value={lookingFor}
                onChange={(e) => setLookingFor(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
              >
                {LOOKING_FOR_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                Bio
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#D63846]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#6B6862] mb-1">
                Interests (comma-separated)
              </label>
              <input
                type="text"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-white border border-black/12 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
              />
            </div>

            {/* Prompts Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6B6862]">
                  Profile prompts (up to 3)
                </span>
                {prompts.length < 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      setPrompts((prev) => [
                        ...prev,
                        {
                          question: PROMPT_SUGGESTIONS[prev.length % PROMPT_SUGGESTIONS.length],
                          answer: '',
                        },
                      ])
                    }
                    className="text-xs font-semibold text-[#D63846] hover:underline"
                  >
                    + Add prompt
                  </button>
                )}
              </div>

              {prompts.map((prompt, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-[#F2EFE9] border border-black/8 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={prompt.question}
                      onChange={(e) =>
                        setPrompts((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, question: e.target.value } : p,
                          ),
                        )
                      }
                      className="flex-1 h-9 px-2.5 rounded-lg bg-white border border-black/10 text-xs font-semibold text-[#141413]"
                    >
                      {Array.from(new Set([prompt.question, ...PROMPT_SUGGESTIONS])).map(
                        (q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setPrompts((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove prompt"
                      className="w-8 h-8 flex items-center justify-center text-[#6B6862] hover:text-[#DC2626]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={220}
                    value={prompt.answer}
                    placeholder="Write your answer..."
                    onChange={(e) =>
                      setPrompts((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, answer: e.target.value } : p,
                        ),
                      )
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white border border-black/10 text-sm text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
                  />
                </div>
              ))}
            </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#D63846] text-white text-sm font-semibold hover:bg-[#BE2F3C] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <CameraVerificationModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        onVerified={(updated) => onProfileUpdated(updated)}
      />
    </div>
  );
}
