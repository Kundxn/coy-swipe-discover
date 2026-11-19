import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CURRENT_USER_ID,
  ME_AVATAR_URL,
  type DiscoveryPreferences,
  type FeedResponse,
  type MatchProfile,
  type MatchesResponse,
  type Profile,
  type SwipeAction,
  type SwipeResponse,
  type UndoSwipeResponse,
} from '../lib/types.ts';
import { ChatView } from './components/ChatView.tsx';
import { DiscoverHeader } from './components/DiscoverHeader.tsx';
import { MatchOverlay } from './components/MatchOverlay.tsx';
import { MatchesView } from './components/MatchesView.tsx';
import { MyProfileView } from './components/MyProfileView.tsx';
import { PreferencesModal } from './components/PreferencesModal.tsx';
import { ProfileDetailModal } from './components/ProfileDetailModal.tsx';
import { ReportModal } from './components/ReportModal.tsx';
import { SwipeDeck } from './components/SwipeDeck.tsx';
import { TabBar, type AppTab } from './components/TabBar.tsx';
import { apiFetch, getEventsUrl } from './utils/api.ts';

const DEFAULT_PREFS: DiscoveryPreferences = {
  min_age: 18,
  max_age: 35,
  max_distance: 50,
  verified_only: false,
};

const INITIAL_PROFILE: Profile = {
  id: CURRENT_USER_ID,
  name: 'Alex',
  age: 23,
  photo_url: ME_AVATAR_URL,
  photos: [ME_AVATAR_URL],
  bio: 'Designing interfaces by day, hunting down matcha spots and film screenings by night.',
  city_or_college: 'San Francisco, CA',
  job_or_major: 'Product Designer',
  distance_miles: 0,
  verified: false,
  looking_for: 'Long-term, open to short',
  interests: ['Matcha', '35mm Film', 'Design', 'Bouldering'],
  prompts: [],
};

export default function App() {
  const [myProfile, setMyProfile] = useState<Profile>(INITIAL_PROFILE);
  const [activeTab, setActiveTab] = useState<AppTab>('discover');

  const [feed, setFeed] = useState<Profile[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchProfile[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<DiscoveryPreferences>(DEFAULT_PREFS);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [inspectedProfile, setInspectedProfile] = useState<Profile | null>(null);
  const [inspectedFromFeed, setInspectedFromFeed] = useState(false);
  const [reportTarget, setReportTarget] = useState<Profile | null>(null);

  const [activeMatchOverlay, setActiveMatchOverlay] = useState<{
    profile: Profile;
    isSuperMatch: boolean;
  } | null>(null);

  const [activeChatMatch, setActiveChatMatch] = useState<MatchProfile | null>(null);
  const [chatRefreshTick, setChatRefreshTick] = useState(0);
  const [canRewind, setCanRewind] = useState(false);
  const [profileSavedOnce, setProfileSavedOnce] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const swipedIdsRef = useRef<Set<string>>(new Set());

  const hasActiveFilters =
    preferences.min_age !== DEFAULT_PREFS.min_age ||
    preferences.max_age !== DEFAULT_PREFS.max_age ||
    preferences.max_distance !== DEFAULT_PREFS.max_distance ||
    preferences.verified_only !== DEFAULT_PREFS.verified_only;

  const loadMyProfile = useCallback(async () => {
    try {
      const response = await apiFetch('/api/profile/me');
      if (response.ok) {
        const data = (await response.json()) as { profile?: Profile };
        if (data.profile) {
          setMyProfile(data.profile);
        }
      }
    } catch {
      // keep initial profile fallback
    }
  }, []);

  const loopFeedFromBeginning = useCallback(async () => {
    try {
      const response = await apiFetch('/api/feed/loop', { method: 'POST' });
      if (!response.ok) return;
      const data = (await response.json()) as FeedResponse;
      swipedIdsRef.current.clear();
      setFeed(data.profiles ?? []);
      setCanRewind(false);
    } catch {
      // ignore
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const response = await apiFetch('/api/feed');
      if (!response.ok) throw new Error('Failed');
      const data = (await response.json()) as FeedResponse;
      const filtered = (data.profiles ?? []).filter(
        (profile) => !swipedIdsRef.current.has(profile.id),
      );
      if (filtered.length === 0) {
        const loopRes = await apiFetch('/api/feed/loop', { method: 'POST' });
        if (loopRes.ok) {
          const loopData = (await loopRes.json()) as FeedResponse;
          swipedIdsRef.current.clear();
          setFeed(loopData.profiles ?? []);
          setCanRewind(false);
          return;
        }
      }
      setFeed(filtered);
      setCanRewind(Boolean(data.canRewind));
    } catch {
      setFeedError('Check your connection and try loading the feed again.');
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadMatches = useCallback(async (silent = false) => {
    if (!silent) {
      setMatchesLoading(true);
      setMatchesError(null);
    }
    try {
      const response = await apiFetch('/api/matches');
      if (!response.ok) throw new Error('Failed');
      const data = (await response.json()) as MatchesResponse;
      setMatches(data.matches ?? []);
    } catch {
      if (!silent) {
        setMatchesError('Check your connection and try loading matches again.');
      }
    } finally {
      if (!silent) {
        setMatchesLoading(false);
      }
    }
  }, []);

  const refreshMatchesSilently = useCallback(() => {
    void loadMatches(true);
  }, [loadMatches]);

  const loadPreferences = useCallback(async () => {
    try {
      const response = await apiFetch('/api/preferences');
      if (response.ok) {
        const data = (await response.json()) as { preferences: DiscoveryPreferences };
        setPreferences(data.preferences);
      }
    } catch {
      // keep defaults
    }
  }, []);

  // Load workspace data + open SSE stream immediately without login gating
  useEffect(() => {
    swipedIdsRef.current.clear();
    void loadMyProfile();
    void loadFeed();
    void loadMatches();
    void loadPreferences();

    const source = new EventSource(getEventsUrl());
    const onRealtime = () => {
      void loadMatches(true);
      setChatRefreshTick((n) => n + 1);
    };

    source.addEventListener('match', onRealtime);
    source.addEventListener('message', onRealtime);
    source.addEventListener('read', () => setChatRefreshTick((n) => n + 1));
    source.addEventListener('unmatch', () => {
      setActiveChatMatch(null);
      void loadMatches(true);
    });

    return () => {
      source.close();
    };
  }, [loadMyProfile, loadFeed, loadMatches, loadPreferences]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleSwipe = useCallback(
    (profile: Profile, action: SwipeAction) => {
      swipedIdsRef.current.add(profile.id);
      let isDeckEmptyNow = false;
      setFeed((prev) => {
        const next = prev.filter((item) => item.id !== profile.id);
        isDeckEmptyNow = next.length === 0;
        return next;
      });

      void (async () => {
        try {
          const response = await apiFetch('/api/swipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetId: profile.id, action }),
          });

          if (response.status !== 409) {
            if (!response.ok) throw new Error(`Swipe failed with ${response.status}`);

            const result = (await response.json()) as SwipeResponse;
            if (result.match && result.profile) {
              const matched = result.profile;
              setCanRewind(false);
              setActiveMatchOverlay({
                profile: matched,
                isSuperMatch: Boolean(result.isSuperMatch),
              });
              void loadMatches();
            } else {
              setCanRewind(true);
            }
          }

          if (isDeckEmptyNow) {
            await loopFeedFromBeginning();
          }
        } catch {
          swipedIdsRef.current.delete(profile.id);
          setFeed((prev) => {
            if (prev.some((item) => item.id === profile.id)) return prev;
            return [profile, ...prev];
          });
          setToastMessage(`Couldn't save swipe for ${profile.name}. Card restored.`);
        }
      })();
    },
    [loadMatches, loopFeedFromBeginning],
  );

  const handleRewind = useCallback(async () => {
    try {
      const response = await apiFetch('/api/swipe/undo', { method: 'POST' });
      if (response.status === 409) {
        setCanRewind(false);
        setToastMessage('Mutual matches cannot be rewound.');
        return;
      }
      if (!response.ok) {
        setCanRewind(false);
        return;
      }

      const data = (await response.json()) as UndoSwipeResponse;
      swipedIdsRef.current.delete(data.restored.id);
      setFeed((prev) => {
        const withoutDup = prev.filter((p) => p.id !== data.restored.id);
        return [data.restored, ...withoutDup];
      });
      setCanRewind(Boolean(data.hasMore));
      setToastMessage(`Swiped back to ${data.restored.name}`);
    } catch {
      setToastMessage('Could not rewind last swipe.');
    }
  }, []);

  const handleSavePreferences = async (nextPrefs: DiscoveryPreferences) => {
    setPrefsSaving(true);
    try {
      const response = await apiFetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPrefs),
      });
      if (response.ok) {
        const data = (await response.json()) as { preferences: DiscoveryPreferences };
        setPreferences(data.preferences);
        setPrefsOpen(false);
        await loadFeed();
      }
    } finally {
      setPrefsSaving(false);
    }
  };

  const openChatWithProfile = (profile: Profile) => {
    const existing = matches.find((m) => m.id === profile.id);
    const chatTarget: MatchProfile = existing ?? {
      ...profile,
      matched_at: new Date().toISOString(),
      is_super_match: false,
      unread_count: 0,
      last_message: null,
    };
    setActiveMatchOverlay(null);
    setActiveTab('matches');
    setActiveChatMatch(chatTarget);
  };

  const handleQuickMatchMessage = async (profile: Profile, text: string) => {
    const res = await apiFetch(`/api/matches/${encodeURIComponent(profile.id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) {
      await loadMatches();
      openChatWithProfile(profile);
    }
  };

  const isAnyModalOpen =
    Boolean(activeMatchOverlay) ||
    Boolean(inspectedProfile) ||
    Boolean(reportTarget) ||
    prefsOpen;

  return (
    <div className="fixed inset-0 w-full h-full bg-[#EFECE6] flex justify-center overflow-hidden overscroll-none">
      <div className="w-full max-w-[420px] h-full bg-[#FAF9F7] flex flex-col relative overflow-hidden overscroll-none sm:border-x sm:border-black/10 sm:shadow-[0_24px_60px_-24px_rgba(20,20,19,0.16)] pt-safe">
        {activeTab === 'discover' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <DiscoverHeader
              hasActiveFilters={hasActiveFilters}
              onOpenPreferences={() => setPrefsOpen(true)}
            />
            <SwipeDeck
              profiles={feed}
              loading={feedLoading}
              error={feedError}
              canRewind={canRewind}
              isOverlayOpen={isAnyModalOpen}
              hasActiveFilters={hasActiveFilters}
              toastMessage={toastMessage}
              onDismissToast={() => setToastMessage(null)}
              onRetry={() => void loadFeed()}
              onSwipe={handleSwipe}
              onRewind={() => void handleRewind()}
              onInspectProfile={(profile) => {
                setInspectedProfile(profile);
                setInspectedFromFeed(true);
              }}
              onOpenPreferences={() => setPrefsOpen(true)}
              onViewMatches={() => {
                setActiveTab('matches');
                void loadMatches();
              }}
            />
          </main>
        )}

        {activeTab === 'matches' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeChatMatch ? (
              <ChatView
                currentUserId={CURRENT_USER_ID}
                match={activeChatMatch}
                refreshTrigger={chatRefreshTick}
                onBack={() => {
                  setActiveChatMatch(null);
                  void loadMatches(true);
                }}
                onInspectProfile={(profile) => {
                  setInspectedProfile(profile);
                  setInspectedFromFeed(false);
                }}
                onReportProfile={(profile) => setReportTarget(profile)}
                onUnmatched={(matchId) => {
                  setActiveChatMatch(null);
                  setMatches((prev) => prev.filter((m) => m.id !== matchId));
                }}
                onMessagesUpdated={refreshMatchesSilently}
              />
            ) : (
              <>
                <header className="shrink-0 h-[52px] px-4 flex items-center justify-between border-b border-black/8 bg-[#FAF9F7]">
                  <h1 className="font-display text-lg font-bold text-[#141413]">
                    Matches
                  </h1>
                  <span className="text-xs font-medium text-[#6B6862]">
                    Mutual only
                  </span>
                </header>
                <MatchesView
                  currentUserId={CURRENT_USER_ID}
                  matches={matches}
                  loading={matchesLoading}
                  error={matchesError}
                  onRetry={() => void loadMatches()}
                  onGoToSwipe={() => setActiveTab('discover')}
                  onOpenChat={(match) => setActiveChatMatch(match)}
                />
              </>
            )}
          </main>
        )}

        {activeTab === 'profile' && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <MyProfileView
              profile={myProfile}
              matchCount={matches.length}
              profileSavedOnce={profileSavedOnce}
              onProfileUpdated={(updated) => setMyProfile(updated)}
              onProfileSavedOnce={() => setProfileSavedOnce(true)}
            />
          </main>
        )}

        {!(activeTab === 'matches' && activeChatMatch) && (
          <TabBar
            activeTab={activeTab}
            matchCount={matches.length}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              if (tab === 'matches') {
                setActiveChatMatch(null);
                void loadMatches();
              }
            }}
          />
        )}

        <ProfileDetailModal
          profile={inspectedProfile}
          onClose={() => setInspectedProfile(null)}
          onAction={
            inspectedFromFeed && inspectedProfile
              ? (action) => handleSwipe(inspectedProfile, action)
              : undefined
          }
          onReport={(profile) => setReportTarget(profile)}
        />

        <ReportModal
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onCompleted={(targetId, blocked) => {
            setReportTarget(null);
            if (blocked) {
              swipedIdsRef.current.add(targetId);
              setFeed((prev) => prev.filter((p) => p.id !== targetId));
              setMatches((prev) => prev.filter((m) => m.id !== targetId));
              if (activeChatMatch?.id === targetId) {
                setActiveChatMatch(null);
              }
              setToastMessage('User blocked and reported.');
            } else {
              setToastMessage('Report submitted.');
            }
          }}
        />

        <PreferencesModal
          open={prefsOpen}
          preferences={preferences}
          saving={prefsSaving}
          onClose={() => setPrefsOpen(false)}
          onSave={(prefs) => void handleSavePreferences(prefs)}
        />

        <MatchOverlay
          matchedProfile={activeMatchOverlay?.profile ?? null}
          isSuperMatch={activeMatchOverlay?.isSuperMatch}
          mePhotoUrl={myProfile.photo_url}
          onKeepSwiping={() => setActiveMatchOverlay(null)}
          onOpenChat={openChatWithProfile}
          onSendQuickMessage={handleQuickMatchMessage}
        />
      </div>
    </div>
  );
}
