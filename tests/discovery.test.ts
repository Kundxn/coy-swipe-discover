import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, initSchema, seedDatabase } from '../lib/db/index.ts';
import { SEEDED_INCOMING_LIKE_IDS, SEED_PROFILES } from '../lib/db/seed-data.ts';
import {
  blockUser,
  generateSeededProfileReply,
  getFeed,
  getMatches,
  getMessages,
  getMyProfile,
  getPreferences,
  hasUndoableSwipe,
  loopFeed,
  recordSwipe,
  reportUser,
  resetUserDemoSwipes,
  sendMessage,
  undoLastSwipe,
  unmatchProfile,
  updateMyProfile,
  updatePreferences,
  verifyMyProfile,
} from '../lib/services/discovery.ts';
import { CURRENT_USER_ID } from '../lib/types.ts';

describe('Coy backend services', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(':memory:', { seed: true });
  });

  afterEach(() => {
    db.close();
  });

  it('seeds at least 30 member profiles idempotently without duplicates', () => {
    expect(SEED_PROFILES.length).toBeGreaterThanOrEqual(30);
    seedDatabase(db);
    const feed = getFeed(db, CURRENT_USER_ID);
    expect(feed).toHaveLength(SEED_PROFILES.length);
  });

  it('feed excludes already-swiped profiles and excludes self', () => {
    const initialFeed = getFeed(db, CURRENT_USER_ID);
    expect(initialFeed.some((p) => p.id === CURRENT_USER_ID)).toBe(false);

    const firstId = initialFeed[0].id;
    const secondId = initialFeed[1].id;

    recordSwipe(db, CURRENT_USER_ID, firstId, 'like');
    recordSwipe(db, CURRENT_USER_ID, secondId, 'pass');

    const updatedFeed = getFeed(db, CURRENT_USER_ID);
    expect(updatedFeed).toHaveLength(SEED_PROFILES.length - 2);
    expect(updatedFeed.some((p) => p.id === firstId)).toBe(false);
    expect(updatedFeed.some((p) => p.id === secondId)).toBe(false);
  });

  it('supports mutual matching, fav superlikes, messaging, and read receipts', () => {
    const admirerId = SEEDED_INCOMING_LIKE_IDS[0];
    const nonAdmirerId = SEED_PROFILES.find((p) => !SEEDED_INCOMING_LIKE_IDS.includes(p.id))!.id;

    // Non-admirer like -> no match
    const s1 = recordSwipe(db, CURRENT_USER_ID, nonAdmirerId, 'like');
    expect(s1).toEqual({ status: 'ok', data: { match: false } });

    // Admirer superlike -> mutual super match
    const s2 = recordSwipe(db, CURRENT_USER_ID, admirerId, 'superlike');
    expect(s2.status).toBe('ok');
    if (s2.status === 'ok') {
      expect(s2.data.match).toBe(true);
      expect(s2.data.isSuperMatch).toBe(true);
    }

    // Send outgoing message and receive contextual reply
    const msg = sendMessage(db, CURRENT_USER_ID, admirerId, 'Hey! Want to grab coffee?');
    expect(msg.status).toBe('ok');

    const reply = generateSeededProfileReply(
      db,
      CURRENT_USER_ID,
      admirerId,
      'Hey! Want to grab coffee?',
    );
    expect(reply).not.toBeNull();
    expect(reply?.markedReadCount).toBe(1);
    expect(reply?.message.sender_id).toBe(admirerId);

    const matchesBeforeRead = getMatches(db, CURRENT_USER_ID);
    expect(matchesBeforeRead).toHaveLength(1);
    expect(matchesBeforeRead[0].unread_count).toBe(1);

    const thread = getMessages(db, CURRENT_USER_ID, admirerId);
    expect(thread.status).toBe('ok');
    if (thread.status === 'ok') {
      expect(thread.data.markedReadCount).toBe(1);
      expect(thread.data.messages).toHaveLength(2);
      expect(thread.data.messages[0].read_at).not.toBeNull();
    }

    const matchesAfterRead = getMatches(db, CURRENT_USER_ID);
    expect(matchesAfterRead[0].unread_count).toBe(0);
  });

  it('supports blocking and reporting users cleanly across feed, matches, and chat', () => {
    const admirerId = SEEDED_INCOMING_LIKE_IDS[0];
    recordSwipe(db, CURRENT_USER_ID, admirerId, 'like');
    sendMessage(db, CURRENT_USER_ID, admirerId, 'Hello');

    const rep = reportUser(db, CURRENT_USER_ID, admirerId, 'harassment', 'Spam links', true);
    expect(rep.status).toBe('ok');

    expect(getMatches(db, CURRENT_USER_ID)).toHaveLength(0);
    expect(getFeed(db, CURRENT_USER_ID).some((p) => p.id === admirerId)).toBe(false);
    expect(sendMessage(db, CURRENT_USER_ID, admirerId, 'Are you there?').status).toBe('not_found');
    expect(blockUser(db, CURRENT_USER_ID, CURRENT_USER_ID).status).toBe('bad_request');
  });

  it('rejects duplicate swipes, supports multi-step swipe-back, and prevents rewinding matches', () => {
    const targetId = SEEDED_INCOMING_LIKE_IDS[0];
    const nonAdmirers = SEED_PROFILES.filter((p) => !SEEDED_INCOMING_LIKE_IDS.includes(p.id));

    expect(hasUndoableSwipe(db, CURRENT_USER_ID)).toBe(false);
    recordSwipe(db, CURRENT_USER_ID, nonAdmirers[0].id, 'pass');
    recordSwipe(db, CURRENT_USER_ID, nonAdmirers[1].id, 'pass');
    expect(hasUndoableSwipe(db, CURRENT_USER_ID)).toBe(true);

    const rewind1 = undoLastSwipe(db, CURRENT_USER_ID);
    expect(rewind1.status).toBe('ok');
    if (rewind1.status === 'ok') {
      expect(rewind1.data.restored.id).toBe(nonAdmirers[1].id);
      expect(rewind1.data.hasMore).toBe(true);
    }

    const rewind2 = undoLastSwipe(db, CURRENT_USER_ID);
    expect(rewind2.status).toBe('ok');
    if (rewind2.status === 'ok') {
      expect(rewind2.data.restored.id).toBe(nonAdmirers[0].id);
      expect(rewind2.data.hasMore).toBe(false);
    }

    recordSwipe(db, CURRENT_USER_ID, targetId, 'like');
    expect(recordSwipe(db, CURRENT_USER_ID, targetId, 'pass').status).toBe('conflict');
    expect(undoLastSwipe(db, CURRENT_USER_ID).status).toBe('conflict');
  });

  it('unmatch removes mutual match and clears messages without returning profile to feed', () => {
    const admirerId = SEEDED_INCOMING_LIKE_IDS[0];
    recordSwipe(db, CURRENT_USER_ID, admirerId, 'like');
    sendMessage(db, CURRENT_USER_ID, admirerId, 'Hey!');

    expect(unmatchProfile(db, CURRENT_USER_ID, admirerId).status).toBe('ok');
    expect(getMatches(db, CURRENT_USER_ID)).toHaveLength(0);
    expect(getMessages(db, CURRENT_USER_ID, admirerId).status).toBe('not_found');
    expect(getFeed(db, CURRENT_USER_ID).some((p) => p.id === admirerId)).toBe(false);
  });

  it('filters discovery feed via preferences and updates profile details', () => {
    const prefs = updatePreferences(db, CURRENT_USER_ID, {
      min_age: 21,
      max_age: 26,
      max_distance: 15,
      verified_only: true,
    });
    expect(prefs.status).toBe('ok');

    const feed = getFeed(db, CURRENT_USER_ID);
    for (const p of feed) {
      expect(p.age).toBeGreaterThanOrEqual(21);
      expect(p.age).toBeLessThanOrEqual(26);
      expect(p.distance_miles).toBeLessThanOrEqual(15);
      expect(p.verified).toBe(true);
    }

    const updatedProfile = updateMyProfile(db, CURRENT_USER_ID, {
      name: 'Alex R.',
      prompts: [{ question: 'Weekend ritual', answer: 'Espresso and climbing.' }],
    });
    expect(updatedProfile.status).toBe('ok');
    if (updatedProfile.status === 'ok') {
      expect(updatedProfile.data.prompts).toHaveLength(1);
    }
  });

  it('privacy: feed output and non-matching swipe responses expose zero incoming-like info', () => {
    const cleanDb = new Database(':memory:');
    initSchema(cleanDb);
    seedDatabase(cleanDb);
    cleanDb.prepare('DELETE FROM swipes WHERE target_id = ?').run(CURRENT_USER_ID);

    expect(getFeed(db, CURRENT_USER_ID)).toEqual(getFeed(cleanDb, CURRENT_USER_ID));

    const admirerId = SEEDED_INCOMING_LIKE_IDS[0];
    const nonAdmirerId = SEED_PROFILES.find((p) => !SEEDED_INCOMING_LIKE_IDS.includes(p.id))!.id;

    expect(recordSwipe(db, CURRENT_USER_ID, admirerId, 'pass')).toEqual({
      status: 'ok',
      data: { match: false },
    });
    expect(recordSwipe(db, CURRENT_USER_ID, nonAdmirerId, 'pass')).toEqual({
      status: 'ok',
      data: { match: false },
    });

    cleanDb.close();
  });

  it('persistence: swipes, matches, preferences, and profile edits survive reopening SQLite file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coy-discover-prod-'));
    const dbFile = path.join(tmpDir, 'prod.db');

    try {
      const db1 = createDatabase(dbFile, { seed: true });
      recordSwipe(db1, CURRENT_USER_ID, 'profile-01', 'like');
      updatePreferences(db1, CURRENT_USER_ID, { max_distance: 20 });
      updateMyProfile(db1, CURRENT_USER_ID, { name: 'Alex Updated' });
      db1.close();

      const db2 = createDatabase(dbFile, { seed: true });
      expect(getMyProfile(db2, CURRENT_USER_ID)?.name).toBe('Alex Updated');
      expect(getPreferences(db2, CURRENT_USER_ID).max_distance).toBe(20);
      expect(getFeed(db2, CURRENT_USER_ID).some((p) => p.id === 'profile-01')).toBe(false);
      db2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blue check camera verification stores verification photo, updates verified badge, and keeps selfie private from feeds', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coy-verify-'));
    const dbFile = path.join(tmpDir, 'verify.db');

    try {
      const db1 = createDatabase(dbFile, { seed: true });
      const initial = getMyProfile(db1, CURRENT_USER_ID);
      expect(initial?.verified).toBe(false);
      expect(initial?.verification_photo_url).toBeNull();

      expect(verifyMyProfile(db1, CURRENT_USER_ID, 'not-an-image').status).toBe('bad_request');
      expect(verifyMyProfile(db1, CURRENT_USER_ID, '').status).toBe('bad_request');

      const fakeCameraSelfie = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';
      const verified = verifyMyProfile(db1, CURRENT_USER_ID, fakeCameraSelfie);
      expect(verified.status).toBe('ok');
      if (verified.status === 'ok') {
        expect(verified.data.verified).toBe(true);
        expect(verified.data.verification_photo_url).toBe(fakeCameraSelfie);
        expect(verified.data.verified_at).toBeTruthy();
      }

      // Public feed sees verified: true badge, never raw verification_photo_url
      const viewerFeed = getFeed(db1, 'profile-01');
      const meInFeed = viewerFeed.find((p) => p.id === CURRENT_USER_ID);
      expect(meInFeed?.verified).toBe(true);
      expect(meInFeed?.verification_photo_url).toBeUndefined();

      db1.close();

      const db2 = createDatabase(dbFile, { seed: true });
      const reloaded = getMyProfile(db2, CURRENT_USER_ID);
      expect(reloaded?.verified).toBe(true);
      expect(reloaded?.verification_photo_url).toBe(fakeCameraSelfie);
      expect(reloaded?.verified_at).toBeTruthy();
      db2.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resets swipes cleanly to restore all 32 profiles', () => {
    const feedBefore = getFeed(db, CURRENT_USER_ID);
    expect(feedBefore.length).toBeGreaterThanOrEqual(30);

    recordSwipe(db, CURRENT_USER_ID, feedBefore[0].id, 'pass');
    expect(getFeed(db, CURRENT_USER_ID)).toHaveLength(feedBefore.length - 1);

    const resetFeed = resetUserDemoSwipes(db, CURRENT_USER_ID);
    expect(resetFeed).toHaveLength(feedBefore.length);
  });

  it('loops non-matched profiles from the beginning while preserving mutual matches and messages', () => {
    const admirerId = SEEDED_INCOMING_LIKE_IDS[0];
    recordSwipe(db, CURRENT_USER_ID, admirerId, 'like');
    sendMessage(db, CURRENT_USER_ID, admirerId, 'Hey!');

    const remaining = getFeed(db, CURRENT_USER_ID);
    for (const profile of remaining) {
      recordSwipe(db, CURRENT_USER_ID, profile.id, 'pass');
    }
    expect(getFeed(db, CURRENT_USER_ID)).toHaveLength(0);

    const looped = loopFeed(db, CURRENT_USER_ID);
    expect(looped).toHaveLength(SEED_PROFILES.length - 1);
    expect(looped.some((p) => p.id === admirerId)).toBe(false);
    expect(getMatches(db, CURRENT_USER_ID)).toHaveLength(1);
    expect(getMessages(db, CURRENT_USER_ID, admirerId).status).toBe('ok');
  });
});
