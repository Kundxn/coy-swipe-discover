import type Database from 'better-sqlite3';
import { SEEDED_INCOMING_LIKE_IDS } from '../db/seed-data.ts';
import {
  CURRENT_USER_ID,
  type ChatMessage,
  type DiscoveryPreferences,
  type MatchProfile,
  type Profile,
  type ProfilePrompt,
  type ProfileUpdatePayload,
  type ReportReason,
  type SwipeAction,
  type SwipeResponse,
} from '../types.ts';

interface ProfileRow {
  id: string;
  name: string;
  age: number;
  photo_url: string;
  photos: string;
  bio: string;
  city_or_college: string;
  job_or_major: string;
  distance_miles: number;
  verified: number;
  verification_photo_url?: string | null;
  verified_at?: string | null;
  looking_for: string;
  interests: string;
  prompts: string;
}

interface MatchRow extends ProfileRow {
  matched_at: string;
  me_action: SwipeAction;
  them_action: SwipeAction;
  unread_count: number;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
}

interface PreferencesRow {
  user_id: string;
  min_age: number;
  max_age: number;
  max_distance: number;
  verified_only: number;
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapProfileRow(
  row: ProfileRow,
  includePrivateVerification: boolean = false,
): Profile {
  const interests = parseJsonArray<string>(row.interests, []).map((item) => String(item));
  const parsedPhotos = parseJsonArray<string>(row.photos, []).map((item) => String(item));
  const photos = parsedPhotos.length > 0 ? parsedPhotos : [row.photo_url];
  const prompts = parseJsonArray<ProfilePrompt>(row.prompts, []).filter(
    (p) => p && typeof p.question === 'string' && typeof p.answer === 'string',
  );

  const profile: Profile = {
    id: row.id,
    name: row.name,
    age: row.age,
    photo_url: row.photo_url,
    photos,
    bio: row.bio,
    city_or_college: row.city_or_college,
    job_or_major: row.job_or_major ?? '',
    distance_miles: typeof row.distance_miles === 'number' ? row.distance_miles : 5,
    verified: Boolean(row.verified),
    looking_for: row.looking_for ?? 'Long-term, open to short',
    interests,
    prompts,
  };

  if (includePrivateVerification) {
    profile.verification_photo_url = row.verification_photo_url ?? null;
    profile.verified_at = row.verified_at ?? null;
  }

  return profile;
}

function isBlockedPair(db: Database.Database, userA: string, userB: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS found
      FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)
      LIMIT 1
      `,
    )
    .get(userA, userB, userB, userA) as { found: number } | undefined;

  return Boolean(row);
}

export function getPreferences(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): DiscoveryPreferences {
  const row = db
    .prepare(
      `
      SELECT user_id, min_age, max_age, max_distance, verified_only
      FROM preferences
      WHERE user_id = ?
      `,
    )
    .get(userId) as PreferencesRow | undefined;

  if (!row) {
    return {
      min_age: 18,
      max_age: 35,
      max_distance: 50,
      verified_only: false,
    };
  }

  return {
    min_age: row.min_age,
    max_age: row.max_age,
    max_distance: row.max_distance,
    verified_only: Boolean(row.verified_only),
  };
}

export type UpdatePreferencesOutcome =
  | { status: 'ok'; data: DiscoveryPreferences }
  | { status: 'bad_request'; error: string };

export function updatePreferences(
  db: Database.Database,
  userId: string,
  payload: unknown,
): UpdatePreferencesOutcome {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'bad_request', error: 'Preferences payload must be an object' };
  }

  const current = getPreferences(db, userId);
  const raw = payload as Partial<DiscoveryPreferences>;

  const minAge = raw.min_age !== undefined ? Number(raw.min_age) : current.min_age;
  const maxAge = raw.max_age !== undefined ? Number(raw.max_age) : current.max_age;
  const maxDistance =
    raw.max_distance !== undefined ? Number(raw.max_distance) : current.max_distance;
  const verifiedOnly =
    raw.verified_only !== undefined ? Boolean(raw.verified_only) : current.verified_only;

  if (
    !Number.isInteger(minAge) ||
    !Number.isInteger(maxAge) ||
    minAge < 18 ||
    maxAge > 99 ||
    minAge > maxAge
  ) {
    return { status: 'bad_request', error: 'Invalid age range' };
  }

  if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 250) {
    return { status: 'bad_request', error: 'Invalid max distance' };
  }

  db.prepare(
    `
    INSERT INTO preferences (user_id, min_age, max_age, max_distance, verified_only)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      min_age = excluded.min_age,
      max_age = excluded.max_age,
      max_distance = excluded.max_distance,
      verified_only = excluded.verified_only
    `,
  ).run(userId, minAge, maxAge, maxDistance, verifiedOnly ? 1 : 0);

  return {
    status: 'ok',
    data: {
      min_age: minAge,
      max_age: maxAge,
      max_distance: maxDistance,
      verified_only: verifiedOnly,
    },
  };
}

/**
 * Returns discovery profiles that `userId` has not yet swiped on, excluding `userId`
 * and blocked users, filtered by `userId`'s saved preferences.
 * Privacy invariant: this query never reads or orders by incoming likes targeting `userId`.
 */
export function getFeed(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): Profile[] {
  const prefs = getPreferences(db, userId);

  const rows = db
    .prepare(
      `
      SELECT
        p.id, p.name, p.age, p.photo_url, p.photos, p.bio, p.city_or_college,
        p.job_or_major, p.distance_miles, p.verified, p.looking_for, p.interests, p.prompts
      FROM profiles p
      WHERE p.id != ?
        AND p.id NOT IN (
          SELECT s.target_id
          FROM swipes s
          WHERE s.swiper_id = ?
        )
        AND p.id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ?
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ?
        )
        AND p.age >= ?
        AND p.age <= ?
        AND p.distance_miles <= ?
        AND (? = 0 OR p.verified = 1)
      ORDER BY CASE WHEN p.id LIKE 'usr_%' THEN 0 ELSE 1 END, p.id ASC
      `,
    )
    .all(
      userId,
      userId,
      userId,
      userId,
      prefs.min_age,
      prefs.max_age,
      prefs.max_distance,
      prefs.verified_only ? 1 : 0,
    ) as ProfileRow[];

  return rows.map((row) => mapProfileRow(row));
}

export type RecordSwipeOutcome =
  | { status: 'ok'; data: SwipeResponse }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string }
  | { status: 'conflict'; error: string };

/**
 * Validates and records a swipe ('like' | 'pass' | 'superlike') from `userId` onto `targetId`.
 * Privacy invariant: only reveals mutual interest (`match: true, profile`) when
 * `action` is positive ('like' or 'superlike') AND `targetId` already has a positive swipe on `userId`.
 */
export function recordSwipe(
  db: Database.Database,
  userId: string,
  targetId: unknown,
  action: unknown,
): RecordSwipeOutcome {
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    return { status: 'bad_request', error: 'targetId must be a non-empty string' };
  }

  if (action !== 'like' && action !== 'pass' && action !== 'superlike') {
    return { status: 'bad_request', error: "action must be 'like', 'pass', or 'superlike'" };
  }

  const normalizedTargetId = targetId.trim();

  if (normalizedTargetId === userId) {
    return { status: 'bad_request', error: 'Cannot swipe on yourself' };
  }

  const runSwipe = db.transaction((): RecordSwipeOutcome => {
    const targetRow = db
      .prepare(
        `
        SELECT
          id, name, age, photo_url, photos, bio, city_or_college,
          job_or_major, distance_miles, verified, looking_for, interests, prompts
        FROM profiles
        WHERE id = ?
        `,
      )
      .get(normalizedTargetId) as ProfileRow | undefined;

    if (!targetRow || isBlockedPair(db, userId, normalizedTargetId)) {
      return { status: 'not_found', error: 'Target profile not found' };
    }

    const existingSwipe = db
      .prepare(
        `
        SELECT id
        FROM swipes
        WHERE swiper_id = ? AND target_id = ?
        `,
      )
      .get(userId, normalizedTargetId) as { id: number } | undefined;

    if (existingSwipe) {
      return { status: 'conflict', error: 'Already swiped on this profile' };
    }

    const createdAt = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO swipes (swiper_id, target_id, action, created_at)
      VALUES (?, ?, ?, ?)
      `,
    ).run(userId, normalizedTargetId, action as SwipeAction, createdAt);

    if (action === 'pass') {
      return { status: 'ok', data: { match: false } };
    }

    const mutualLike = db
      .prepare(
        `
        SELECT action
        FROM swipes
        WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'superlike')
        `,
      )
      .get(normalizedTargetId, userId) as { action: SwipeAction } | undefined;

    if (mutualLike) {
      return {
        status: 'ok',
        data: {
          match: true,
          isSuperMatch: action === 'superlike' || mutualLike.action === 'superlike',
          profile: mapProfileRow(targetRow),
        },
      };
    }

    return { status: 'ok', data: { match: false } };
  });

  return runSwipe();
}

export type UndoSwipeOutcome =
  | { status: 'ok'; data: { restored: Profile; hasMore: boolean } }
  | { status: 'not_found'; error: string }
  | { status: 'conflict'; error: string };

function canRewindSwipeRow(
  db: Database.Database,
  userId: string,
  swipe: { target_id: string; action: SwipeAction } | undefined,
): boolean {
  if (!swipe) return false;
  if (isBlockedPair(db, userId, swipe.target_id)) return false;

  if (swipe.action === 'like' || swipe.action === 'superlike') {
    const wasMutual = db
      .prepare(
        `
        SELECT 1 AS found
        FROM swipes
        WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'superlike')
        `,
      )
      .get(swipe.target_id, userId) as { found: number } | undefined;

    if (wasMutual) return false;
  }

  const targetExists = db
    .prepare('SELECT 1 AS found FROM profiles WHERE id = ?')
    .get(swipe.target_id) as { found: number } | undefined;

  return Boolean(targetExists);
}

export function hasUndoableSwipe(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): boolean {
  const lastSwipe = db
    .prepare(
      `
      SELECT target_id, action
      FROM swipes
      WHERE swiper_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
    )
    .get(userId) as { target_id: string; action: SwipeAction } | undefined;

  return canRewindSwipeRow(db, userId, lastSwipe);
}

/**
 * Rewinds the most recent swipe by `userId`, provided it has not already formed a mutual match.
 */
export function undoLastSwipe(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): UndoSwipeOutcome {
  return db.transaction((): UndoSwipeOutcome => {
    const lastSwipe = db
      .prepare(
        `
        SELECT id, target_id, action
        FROM swipes
        WHERE swiper_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
      )
      .get(userId) as { id: number; target_id: string; action: SwipeAction } | undefined;

    if (!lastSwipe) {
      return { status: 'not_found', error: 'No recent swipe to rewind' };
    }

    if (lastSwipe.action === 'like' || lastSwipe.action === 'superlike') {
      const wasMutual = db
        .prepare(
          `
          SELECT 1 AS found
          FROM swipes
          WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'superlike')
          `,
        )
        .get(lastSwipe.target_id, userId) as { found: number } | undefined;

      if (wasMutual) {
        return {
          status: 'conflict',
          error: 'Cannot rewind a mutual match; unmatch from chat instead',
        };
      }
    }

    const targetRow = db
      .prepare(
        `
        SELECT
          id, name, age, photo_url, photos, bio, city_or_college,
          job_or_major, distance_miles, verified, looking_for, interests, prompts
        FROM profiles
        WHERE id = ?
        `,
      )
      .get(lastSwipe.target_id) as ProfileRow | undefined;

    if (!targetRow || isBlockedPair(db, userId, lastSwipe.target_id)) {
      return { status: 'not_found', error: 'Target profile no longer available' };
    }

    db.prepare('DELETE FROM swipes WHERE id = ?').run(lastSwipe.id);

    const nextSwipe = db
      .prepare(
        `
        SELECT target_id, action
        FROM swipes
        WHERE swiper_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
      )
      .get(userId) as { target_id: string; action: SwipeAction } | undefined;

    return {
      status: 'ok',
      data: {
        restored: mapProfileRow(targetRow),
        hasMore: canRewindSwipeRow(db, userId, nextSwipe),
      },
    };
  })();
}

/**
 * Returns mutual matches for `userId`, excluding blocked users, ordered newest first.
 */
export function getMatches(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): MatchProfile[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.age,
        p.photo_url,
        p.photos,
        p.bio,
        p.city_or_college,
        p.job_or_major,
        p.distance_miles,
        p.verified,
        p.looking_for,
        p.interests,
        p.prompts,
        s_me.action AS me_action,
        s_them.action AS them_action,
        CASE
          WHEN s_me.created_at >= s_them.created_at THEN s_me.created_at
          ELSE s_them.created_at
        END AS matched_at,
        (
          SELECT COUNT(*)
          FROM messages m
          WHERE m.sender_id = p.id
            AND m.recipient_id = ?
            AND m.read_at IS NULL
        ) AS unread_count,
        (
          SELECT m.body
          FROM messages m
          WHERE (m.sender_id = ? AND m.recipient_id = p.id)
             OR (m.sender_id = p.id AND m.recipient_id = ?)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_body,
        (
          SELECT m.sender_id
          FROM messages m
          WHERE (m.sender_id = ? AND m.recipient_id = p.id)
             OR (m.sender_id = p.id AND m.recipient_id = ?)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_sender_id,
        (
          SELECT m.created_at
          FROM messages m
          WHERE (m.sender_id = ? AND m.recipient_id = p.id)
             OR (m.sender_id = p.id AND m.recipient_id = ?)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_message_created_at
      FROM profiles p
      INNER JOIN swipes s_me
        ON s_me.swiper_id = ?
        AND s_me.target_id = p.id
        AND s_me.action IN ('like', 'superlike')
      INNER JOIN swipes s_them
        ON s_them.swiper_id = p.id
        AND s_them.target_id = ?
        AND s_them.action IN ('like', 'superlike')
      WHERE p.id != ?
        AND p.id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ?
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ?
        )
      ORDER BY matched_at DESC, MAX(s_me.id, s_them.id) DESC, p.id ASC
      `,
    )
    .all(
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
    ) as MatchRow[];

  return rows.map((row) => ({
    ...mapProfileRow(row),
    matched_at: row.matched_at,
    is_super_match: row.me_action === 'superlike' || row.them_action === 'superlike',
    unread_count: row.unread_count ?? 0,
    last_message:
      row.last_message_body && row.last_message_sender_id && row.last_message_created_at
        ? {
            body: row.last_message_body,
            sender_id: row.last_message_sender_id,
            created_at: row.last_message_created_at,
          }
        : null,
  }));
}

function assertMutualMatch(
  db: Database.Database,
  userId: string,
  targetId: string,
): ProfileRow | null {
  if (isBlockedPair(db, userId, targetId)) {
    return null;
  }

  const row = db
    .prepare(
      `
      SELECT
        p.id, p.name, p.age, p.photo_url, p.photos, p.bio, p.city_or_college,
        p.job_or_major, p.distance_miles, p.verified, p.looking_for, p.interests, p.prompts
      FROM profiles p
      INNER JOIN swipes s_me
        ON s_me.swiper_id = ? AND s_me.target_id = p.id AND s_me.action IN ('like', 'superlike')
      INNER JOIN swipes s_them
        ON s_them.swiper_id = p.id AND s_them.target_id = ? AND s_them.action IN ('like', 'superlike')
      WHERE p.id = ?
      `,
    )
    .get(userId, userId, targetId) as ProfileRow | undefined;

  return row ?? null;
}

export type UnmatchOutcome =
  | { status: 'ok' }
  | { status: 'not_found'; error: string };

/**
 * Unmatches `targetId` by converting `userId`'s swipe to 'pass' and removing chat history,
 * ensuring the unmatched profile leaves Matches and does not reappear in Feed.
 */
export function unmatchProfile(
  db: Database.Database,
  userId: string,
  targetId: string,
): UnmatchOutcome {
  return db.transaction((): UnmatchOutcome => {
    const matchRow = assertMutualMatch(db, userId, targetId);
    if (!matchRow) {
      return { status: 'not_found', error: 'Mutual match not found' };
    }

    db.prepare(
      `
      UPDATE swipes
      SET action = 'pass'
      WHERE swiper_id = ? AND target_id = ?
      `,
    ).run(userId, targetId);

    db.prepare(
      `
      DELETE FROM messages
      WHERE (sender_id = ? AND recipient_id = ?)
         OR (sender_id = ? AND recipient_id = ?)
      `,
    ).run(userId, targetId, targetId, userId);

    return { status: 'ok' };
  })();
}

export type GetMessagesOutcome =
  | { status: 'ok'; data: { match: Profile; messages: ChatMessage[]; markedReadCount: number } }
  | { status: 'not_found'; error: string };

export function getMessages(
  db: Database.Database,
  userId: string,
  targetId: string,
): GetMessagesOutcome {
  const matchRow = assertMutualMatch(db, userId, targetId);
  if (!matchRow) {
    return { status: 'not_found', error: 'Mutual match not found' };
  }

  const readAt = new Date().toISOString();
  const markResult = db
    .prepare(
      `
      UPDATE messages
      SET read_at = ?
      WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
      `,
    )
    .run(readAt, targetId, userId);

  const messages = db
    .prepare(
      `
      SELECT id, sender_id, recipient_id, body, read_at, created_at
      FROM messages
      WHERE (sender_id = ? AND recipient_id = ?)
         OR (sender_id = ? AND recipient_id = ?)
      ORDER BY id ASC
      `,
    )
    .all(userId, targetId, targetId, userId) as ChatMessage[];

  return {
    status: 'ok',
    data: {
      match: mapProfileRow(matchRow),
      messages,
      markedReadCount: markResult.changes,
    },
  };
}

export function markMessagesRead(
  db: Database.Database,
  userId: string,
  targetId: string,
): number {
  const matchRow = assertMutualMatch(db, userId, targetId);
  if (!matchRow) return 0;

  const readAt = new Date().toISOString();
  const result = db
    .prepare(
      `
      UPDATE messages
      SET read_at = ?
      WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
      `,
    )
    .run(readAt, targetId, userId);

  return result.changes;
}

export type SendMessageOutcome =
  | { status: 'ok'; data: ChatMessage }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string };

export function sendMessage(
  db: Database.Database,
  userId: string,
  targetId: string,
  body: unknown,
): SendMessageOutcome {
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { status: 'bad_request', error: 'Message cannot be empty' };
  }

  const trimmed = body.trim().slice(0, 1000);
  const matchRow = assertMutualMatch(db, userId, targetId);
  if (!matchRow) {
    return { status: 'not_found', error: 'Cannot message someone you have not matched with' };
  }

  const createdAt = new Date().toISOString();
  const info = db
    .prepare(
      `
      INSERT INTO messages (sender_id, recipient_id, body, read_at, created_at)
      VALUES (?, ?, ?, NULL, ?)
      `,
    )
    .run(userId, targetId, trimmed, createdAt);

  return {
    status: 'ok',
    data: {
      id: Number(info.lastInsertRowid),
      sender_id: userId,
      recipient_id: targetId,
      body: trimmed,
      read_at: null,
      created_at: createdAt,
    },
  };
}

function buildSeededReplyText(
  profile: Profile,
  userMessageBody: string,
  turnCount: number,
): string {
  const lower = userMessageBody.toLowerCase();
  const firstName = profile.name.split(' ')[0];
  const primaryInterest = profile.interests[0] ?? 'music';
  const secondaryInterest = profile.interests[1] ?? 'coffee';
  const cityShort = profile.city_or_college.split(',')[0];

  if (/\b(coffee|cafe|matcha|espresso|drink|tea|boba)\b/.test(lower)) {
    return `Count me in — I know a great spot in ${cityShort} if you want to grab coffee sometime this week!`;
  }

  if (/\b(weekend|free|tonight|friday|saturday|sunday|hang|meet|date)\b/.test(lower)) {
    return `My weekend is surprisingly open! Usually I’m out doing ${primaryInterest.toLowerCase()}, so I’d definitely be up for meeting up.`;
  }

  if (/\b(how are you|how's it going|what's up|sup|hey|hi|hello)\b/.test(lower) && turnCount <= 1) {
    return `Hey! So glad we matched — I was just taking a break from ${primaryInterest.toLowerCase()}. How’s your week going?`;
  }

  if (userMessageBody.includes('?')) {
    const promptAnswer = profile.prompts[0]?.answer;
    if (promptAnswer && turnCount <= 2) {
      return `Haha great question! Honestly for me: ${promptAnswer.charAt(0).toLowerCase()}${promptAnswer.slice(1)} What about you?`;
    }
    return `Definitely into ${primaryInterest.toLowerCase()} and ${secondaryInterest.toLowerCase()} lately. What have you been up to around ${cityShort}?`;
  }

  const followUps = [
    `Love that! Have you found any favorite spots around ${cityShort} lately?`,
    `Wait, I’m actually really into ${secondaryInterest.toLowerCase()} too — we’ll have to compare notes.`,
    `That sounds awesome. Are you usually free more on weeknights or weekends?`,
    `Haha ${firstName} approves! Tell me one thing you’re looking forward to this month.`,
  ];

  return followUps[turnCount % followUps.length];
}

/**
 * Generates and persists a contextual reply from a matched seeded community profile
 * (`profile-*`), marking the user's outgoing messages as read first.
 */
export function generateSeededProfileReply(
  db: Database.Database,
  recipientUserId: string,
  seededProfileId: string,
  userMessageBody: string,
): { message: ChatMessage; markedReadCount: number } | null {
  if (!seededProfileId.startsWith('profile-')) {
    return null;
  }

  const matchRow = assertMutualMatch(db, recipientUserId, seededProfileId);
  if (!matchRow) {
    return null;
  }

  const profile = mapProfileRow(matchRow);

  return db.transaction(() => {
    const now = new Date().toISOString();

    const markResult = db
      .prepare(
        `
        UPDATE messages
        SET read_at = ?
        WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
        `,
      )
      .run(now, recipientUserId, seededProfileId);

    const countRow = db
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM messages
        WHERE (sender_id = ? AND recipient_id = ?)
           OR (sender_id = ? AND recipient_id = ?)
        `,
      )
      .get(recipientUserId, seededProfileId, seededProfileId, recipientUserId) as {
      cnt: number;
    };

    const replyBody = buildSeededReplyText(profile, userMessageBody, countRow.cnt);

    const info = db
      .prepare(
        `
        INSERT INTO messages (sender_id, recipient_id, body, read_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
        `,
      )
      .run(seededProfileId, recipientUserId, replyBody, now);

    return {
      markedReadCount: markResult.changes,
      message: {
        id: Number(info.lastInsertRowid),
        sender_id: seededProfileId,
        recipient_id: recipientUserId,
        body: replyBody,
        read_at: null,
        created_at: now,
      },
    };
  })();
}

export type BlockOutcome =
  | { status: 'ok' }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string };

export function blockUser(
  db: Database.Database,
  userId: string,
  targetId: string,
): BlockOutcome {
  if (!targetId || targetId === userId) {
    return { status: 'bad_request', error: 'Invalid target user' };
  }

  const exists = db
    .prepare('SELECT 1 AS found FROM profiles WHERE id = ?')
    .get(targetId) as { found: number } | undefined;

  if (!exists) {
    return { status: 'not_found', error: 'User not found' };
  }

  db.transaction(() => {
    db.prepare(
      `
      INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at)
      VALUES (?, ?, ?)
      `,
    ).run(userId, targetId, new Date().toISOString());

    db.prepare(
      `
      INSERT INTO swipes (swiper_id, target_id, action, created_at)
      VALUES (?, ?, 'pass', ?)
      ON CONFLICT(swiper_id, target_id) DO UPDATE SET action = 'pass'
      `,
    ).run(userId, targetId, new Date().toISOString());

    db.prepare(
      `
      DELETE FROM messages
      WHERE (sender_id = ? AND recipient_id = ?)
         OR (sender_id = ? AND recipient_id = ?)
      `,
    ).run(userId, targetId, targetId, userId);
  })();

  return { status: 'ok' };
}

export type ReportOutcome =
  | { status: 'ok' }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string };

const VALID_REASONS: ReadonlySet<string> = new Set([
  'inappropriate_content',
  'harassment',
  'spam_or_fake',
  'other',
]);

export function reportUser(
  db: Database.Database,
  userId: string,
  targetId: string,
  reason: unknown,
  details: unknown,
  alsoBlock: boolean = true,
): ReportOutcome {
  if (!targetId || targetId === userId) {
    return { status: 'bad_request', error: 'Invalid target user' };
  }
  if (typeof reason !== 'string' || !VALID_REASONS.has(reason)) {
    return { status: 'bad_request', error: 'Invalid report reason' };
  }

  const exists = db
    .prepare('SELECT 1 AS found FROM profiles WHERE id = ?')
    .get(targetId) as { found: number } | undefined;

  if (!exists) {
    return { status: 'not_found', error: 'User not found' };
  }

  const cleanDetails = typeof details === 'string' ? details.trim().slice(0, 500) : '';

  db.transaction(() => {
    db.prepare(
      `
      INSERT INTO reports (reporter_id, reported_id, reason, details, created_at)
      VALUES (?, ?, ?, ?, ?)
      `,
    ).run(userId, targetId, reason as ReportReason, cleanDetails, new Date().toISOString());

    if (alsoBlock) {
      blockUser(db, userId, targetId);
    }
  })();

  return { status: 'ok' };
}

export function getMyProfile(
  db: Database.Database,
  userId: string = CURRENT_USER_ID,
): Profile | null {
  const row = db
    .prepare(
      `
      SELECT
        id, name, age, photo_url, photos, bio, city_or_college,
        job_or_major, distance_miles, verified, verification_photo_url, verified_at,
        looking_for, interests, prompts
      FROM profiles
      WHERE id = ?
      `,
    )
    .get(userId) as ProfileRow | undefined;

  return row ? mapProfileRow(row, true) : null;
}

export type UpdateMyProfileOutcome =
  | { status: 'ok'; data: Profile }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string };

function isValidPhotoSource(src: string): boolean {
  if (src.startsWith('/src/assets/')) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) {
    return src.length <= 2_000_000;
  }
  return false;
}

export function updateMyProfile(
  db: Database.Database,
  userId: string,
  payload: unknown,
): UpdateMyProfileOutcome {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'bad_request', error: 'Profile payload must be an object' };
  }

  const existing = getMyProfile(db, userId);
  if (!existing) {
    return { status: 'not_found', error: 'Profile not found' };
  }

  const patch = payload as ProfileUpdatePayload;
  const name =
    typeof patch.name === 'string' && patch.name.trim().length > 0
      ? patch.name.trim().slice(0, 60)
      : existing.name;
  const age = patch.age !== undefined ? Number(patch.age) : existing.age;
  if (!Number.isInteger(age) || age < 18 || age > 99) {
    return { status: 'bad_request', error: 'Age must be between 18 and 99' };
  }

  const bio =
    typeof patch.bio === 'string' ? patch.bio.trim().slice(0, 300) : existing.bio;
  const cityOrCollege =
    typeof patch.city_or_college === 'string' && patch.city_or_college.trim().length > 0
      ? patch.city_or_college.trim().slice(0, 80)
      : existing.city_or_college;
  const jobOrMajor =
    typeof patch.job_or_major === 'string'
      ? patch.job_or_major.trim().slice(0, 80)
      : existing.job_or_major;
  const lookingFor =
    typeof patch.looking_for === 'string' && patch.looking_for.trim().length > 0
      ? patch.looking_for.trim().slice(0, 60)
      : existing.looking_for;

  let photos = existing.photos;
  let photoUrl = existing.photo_url;
  if (Array.isArray(patch.photos)) {
    const validPhotos = patch.photos
      .map((p) => String(p).trim())
      .filter((p) => p.length > 0 && isValidPhotoSource(p))
      .slice(0, 6);
    if (validPhotos.length === 0) {
      return { status: 'bad_request', error: 'At least one valid photo is required' };
    }
    photos = validPhotos;
    photoUrl = validPhotos[0];
  }

  const interests = Array.isArray(patch.interests)
    ? patch.interests.map((i) => String(i).trim()).filter(Boolean).slice(0, 8)
    : existing.interests;
  const prompts = Array.isArray(patch.prompts)
    ? patch.prompts
        .filter((p) => p && typeof p.question === 'string' && typeof p.answer === 'string')
        .map((p) => ({
          question: p.question.trim().slice(0, 100),
          answer: p.answer.trim().slice(0, 220),
        }))
        .filter((p) => p.question.length > 0 && p.answer.length > 0)
        .slice(0, 3)
    : existing.prompts;

  db.prepare(
    `
    UPDATE profiles
    SET
      name = ?,
      age = ?,
      photo_url = ?,
      photos = ?,
      bio = ?,
      city_or_college = ?,
      job_or_major = ?,
      looking_for = ?,
      interests = ?,
      prompts = ?
    WHERE id = ?
    `,
  ).run(
    name,
    age,
    photoUrl,
    JSON.stringify(photos),
    bio,
    cityOrCollege,
    jobOrMajor,
    lookingFor,
    JSON.stringify(interests),
    JSON.stringify(prompts),
    userId,
  );

  const updated = getMyProfile(db, userId)!;
  return { status: 'ok', data: updated };
}

export type VerifyProfileOutcome =
  | { status: 'ok'; data: Profile }
  | { status: 'bad_request'; error: string }
  | { status: 'not_found'; error: string };

/**
 * Verifies a user's profile with a camera-captured selfie stored in the database
 * and activates their public blue check (`verified = 1`) badge.
 */
export function verifyMyProfile(
  db: Database.Database,
  userId: string,
  photoInput: unknown,
): VerifyProfileOutcome {
  if (typeof photoInput !== 'string') {
    return {
      status: 'bad_request',
      error: 'Please capture or upload a valid verification photo.',
    };
  }

  const trimmed = photoInput.trim();
  if (!trimmed || !isValidPhotoSource(trimmed)) {
    return {
      status: 'bad_request',
      error: 'Verification photo must be a valid JPEG, PNG, or WebP image under 2MB.',
    };
  }

  const existing = getMyProfile(db, userId);
  if (!existing) {
    return { status: 'not_found', error: 'Profile not found' };
  }

  const verifiedAt = new Date().toISOString();
  db.prepare(
    `
    UPDATE profiles
    SET
      verified = 1,
      verification_photo_url = ?,
      verified_at = ?
    WHERE id = ?
    `,
  ).run(trimmed, verifiedAt, userId);

  const updated = getMyProfile(db, userId)!;
  return { status: 'ok', data: updated };
}

/**
 * Clears `userId`'s outgoing swipes and chat history and ensures the 10 seeded
 * community incoming likes are ready so the 32-profile demo deck can be replayed.
 */
export function resetUserDemoSwipes(db: Database.Database, userId: string): Profile[] {
  db.transaction(() => {
    db.prepare('DELETE FROM swipes WHERE swiper_id = ?').run(userId);
    db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(
      userId,
      userId,
    );

    const insertIncoming = db.prepare(`
      INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, created_at)
      SELECT p.id, ?, ?, ?
      FROM profiles p
      WHERE p.id = ?
    `);

    SEEDED_INCOMING_LIKE_IDS.forEach((profileId, idx) => {
      const action = idx === 1 ? 'superlike' : 'like';
      const ts = new Date(Date.now() - (idx + 1) * 60_000).toISOString();
      insertIncoming.run(userId, action, ts, profileId);
    });
  })();

  return getFeed(db, userId);
}

/**
 * Restarts the discovery feed from the beginning by clearing non-matching outgoing
 * swipes (passes and unreciprocated likes) while keeping confirmed mutual matches
 * and their chat history intact.
 */
export function loopFeed(db: Database.Database, userId: string): Profile[] {
  db.prepare(
    `
    DELETE FROM swipes
    WHERE swiper_id = ?
      AND (
        action = 'pass'
        OR target_id NOT IN (
          SELECT inc.swiper_id
          FROM swipes inc
          WHERE inc.target_id = ?
            AND inc.action IN ('like', 'superlike')
        )
      )
    `,
  ).run(userId, userId);

  return getFeed(db, userId);
}

