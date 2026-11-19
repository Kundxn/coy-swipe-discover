import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  MoreVertical,
  Send,
  ShieldAlert,
  User,
  UserX,
} from 'lucide-react';
import type { ChatMessage, MatchProfile, MessagesResponse, Profile } from '../../lib/types.ts';
import { apiFetch } from '../utils/api.ts';

interface ChatViewProps {
  currentUserId: string;
  match: MatchProfile;
  refreshTrigger: number;
  onBack: () => void;
  onInspectProfile: (profile: Profile) => void;
  onReportProfile: (profile: Profile) => void;
  onUnmatched: (matchId: string) => void;
  onMessagesUpdated: () => void;
}

function getIcebreakers(match: Profile): string[] {
  const firstInterest = match.interests[0] ?? 'coffee';
  const prompt = match.prompts[0];
  return [
    `Hey ${match.name.split(' ')[0]}! Favorite spot for ${firstInterest.toLowerCase()}?`,
    prompt
      ? `Loved your prompt about "${prompt.question.toLowerCase()}"!`
      : `How's your week going around ${match.city_or_college}?`,
    `Sunday coffee walk or spontaneous food spot?`,
  ];
}

export function ChatView({
  currentUserId,
  match,
  refreshTrigger,
  onBack,
  onInspectProfile,
  onReportProfile,
  onUnmatched,
  onMessagesUpdated,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmUnmatch, setConfirmUnmatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onMessagesUpdatedRef = useRef(onMessagesUpdated);
  const replyTimersRef = useRef<number[]>([]);

  useEffect(() => {
    onMessagesUpdatedRef.current = onMessagesUpdated;
  }, [onMessagesUpdated]);

  useEffect(() => {
    return () => {
      replyTimersRef.current.forEach((id) => window.clearTimeout(id));
      replyTimersRef.current = [];
    };
  }, [match.id]);

  const loadThread = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/matches/${encodeURIComponent(match.id)}/messages`);
        if (!res.ok) throw new Error('Failed to load conversation');
        const data = (await res.json()) as MessagesResponse;
        setMessages(data.messages ?? []);
        onMessagesUpdatedRef.current();
      } catch {
        setError('Could not load messages.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [match.id],
  );

  useEffect(() => {
    void loadThread(false);
  }, [loadThread]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void loadThread(true);
    }
  }, [refreshTrigger, loadThread]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendBody = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setDraft('');
    setError(null);

    try {
      const res = await apiFetch(`/api/matches/${encodeURIComponent(match.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to send');
      const data = (await res.json()) as {
        message: ChatMessage;
        reply?: ChatMessage | null;
      };
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message],
      );
      onMessagesUpdatedRef.current();

      const replyMsg = data.reply;
      if (replyMsg) {
        const timerId = window.setTimeout(() => {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === data.message.id && !m.read_at
                ? { ...m, read_at: replyMsg.created_at }
                : m,
            );
            return updated.some((m) => m.id === replyMsg.id)
              ? updated
              : [...updated, replyMsg];
          });
          onMessagesUpdatedRef.current();
        }, 650);
        replyTimersRef.current.push(timerId);
      }
    } catch {
      setError('Message failed to send.');
      setDraft(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleUnmatch = async () => {
    const res = await apiFetch(`/api/matches/${encodeURIComponent(match.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onUnmatched(match.id);
    }
  };

  const icebreakers = getIcebreakers(match);
  const lastSentByMe = [...messages]
    .reverse()
    .find((m) => m.sender_id === currentUserId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAF9F7] relative">
      {/* Chat Header */}
      <header className="shrink-0 h-[56px] px-2 flex items-center justify-between gap-2 bg-[#FAF9F7] border-b border-black/8 z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to matches"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#141413] hover:bg-black/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onInspectProfile(match)}
            className="flex items-center gap-2.5 min-w-0 py-1 pr-2 rounded-xl hover:bg-black/5 transition-colors text-left"
          >
            <img
              src={match.photo_url}
              alt={match.name}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover bg-[#E5E0D8] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <p className="font-display text-sm font-bold text-[#141413] truncate">
                  {match.name}
                </p>
                {match.verified && (
                  <BadgeCheck
                    aria-label="Verified profile"
                    className="w-3.5 h-3.5 text-[#0284C7] fill-[#38BDF8]/20 shrink-0"
                  />
                )}
              </div>
              <p className="text-[11px] text-[#6B6862] truncate">
                {match.city_or_college}
              </p>
            </div>
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Conversation options"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#6B6862] hover:text-[#141413] hover:bg-black/5 transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-2 top-12 w-48 rounded-2xl bg-white border border-black/10 shadow-xl py-1.5 z-30">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onInspectProfile(match);
                }}
                className="w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#141413] hover:bg-black/5 flex items-center gap-2.5"
              >
                <User className="w-4 h-4 text-[#6B6862]" />
                View profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmUnmatch(true);
                }}
                className="w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#141413] hover:bg-black/5 flex items-center gap-2.5"
              >
                <UserX className="w-4 h-4 text-[#6B6862]" />
                Unmatch
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onReportProfile(match);
                }}
                className="w-full px-3.5 py-2.5 text-left text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2.5"
              >
                <ShieldAlert className="w-4 h-4" />
                Block &amp; report
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Unmatch Confirmation Banner */}
      {confirmUnmatch && (
        <div className="shrink-0 px-4 py-3 bg-[#FEF2F2] border-b border-[#DC2626]/15 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#991B1B]">
            Unmatch {match.name.split(' ')[0]} and clear chat?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmUnmatch(false)}
              className="px-3 py-1.5 rounded-lg bg-white text-xs font-semibold text-[#141413] border border-black/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleUnmatch()}
              className="px-3 py-1.5 rounded-lg bg-[#DC2626] text-xs font-semibold text-white"
            >
              Unmatch
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {loading ? (
          <div className="space-y-3 pt-4">
            <div className="h-10 w-2/3 rounded-2xl bg-[#E8E3DA] animate-pulse" />
            <div className="h-10 w-1/2 rounded-2xl bg-[#E8E3DA] animate-pulse ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-2 py-6">
            <img
              src={match.photo_url}
              alt={match.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-sm mb-3"
            />
            <h3 className="font-display text-base font-bold text-[#141413]">
              You matched with {match.name.split(' ')[0]}
            </h3>
            <p className="text-xs text-[#6B6862] mt-1 max-w-[240px]">
              Send an icebreaker or write your own opening message.
            </p>

            <div className="mt-5 w-full space-y-2">
              {icebreakers.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void sendBody(starter)}
                  className="w-full text-left px-3.5 py-2.5 rounded-2xl bg-white border border-black/10 text-xs font-medium text-[#141413] hover:border-[#D63846]/40 hover:bg-[#FFF9FA] transition-colors"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              const showReadReceipt =
                isMe && lastSentByMe?.id === msg.id && Boolean(msg.read_at);

              return (
                <div key={msg.id} className="space-y-1">
                  <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-snug ${
                        isMe
                          ? 'bg-[#D63846] text-white rounded-br-sm'
                          : 'bg-[#ECE8E1] text-[#141413] rounded-bl-sm'
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                  {showReadReceipt && (
                    <p className="text-[10px] font-medium text-[#6B6862] text-right pr-1">
                      Read
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}

        {error && <p className="text-xs text-[#DC2626] text-center py-1">{error}</p>}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendBody(draft);
        }}
        className="shrink-0 px-3 py-2.5 bg-[#FAF9F7] border-t border-black/8 flex items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${match.name.split(' ')[0]}...`}
          aria-label="Message input"
          className="flex-1 min-w-0 h-11 px-4 rounded-full bg-white border border-black/12 text-sm text-[#141413] placeholder:text-[#8A857C] focus:outline-none focus:ring-2 focus:ring-[#D63846]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="w-11 h-11 shrink-0 rounded-full bg-[#D63846] text-white flex items-center justify-center hover:bg-[#BE2F3C] transition-colors disabled:opacity-45"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
