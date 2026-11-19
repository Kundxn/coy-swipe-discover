import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { CURRENT_USER_ID } from '../types.ts';
import { ME_PROFILE, SEED_PROFILES, SEEDED_INCOMING_LIKE_IDS } from './seed-data.ts';

const DEFAULT_DB_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'coy.db')
  : path.resolve(process.cwd(), 'data', 'coy.db');

let singletonDb: Database.Database | null = null;

export function initSchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      photo_url TEXT NOT NULL,
      photos TEXT NOT NULL DEFAULT '[]',
      bio TEXT NOT NULL,
      city_or_college TEXT NOT NULL,
      job_or_major TEXT NOT NULL DEFAULT '',
      distance_miles INTEGER NOT NULL DEFAULT 5,
      verified INTEGER NOT NULL DEFAULT 0,
      verification_photo_url TEXT,
      verified_at TEXT,
      looking_for TEXT NOT NULL DEFAULT 'Long-term, open to short',
      interests TEXT NOT NULL,
      prompts TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // Graceful column migrations if an older coy.db file exists on disk
  const profileColumns = (
    db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>
  ).map((col) => col.name);
  const migrations: Array<[string, string]> = [
    ['photos', "TEXT NOT NULL DEFAULT '[]'"],
    ['job_or_major', "TEXT NOT NULL DEFAULT ''"],
    ['distance_miles', 'INTEGER NOT NULL DEFAULT 5'],
    ['verified', 'INTEGER NOT NULL DEFAULT 0'],
    ['verification_photo_url', 'TEXT'],
    ['verified_at', 'TEXT'],
    ['looking_for', "TEXT NOT NULL DEFAULT 'Long-term, open to short'"],
    ['prompts', "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [col, definition] of migrations) {
    if (!profileColumns.includes(col)) {
      db.exec(`ALTER TABLE profiles ADD COLUMN ${col} ${definition}`);
    }
  }

  // Ensure swipes supports 'like', 'pass', and 'superlike'
  const existingSwipesDef = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'swipes'")
    .get() as { sql: string } | undefined;

  if (!existingSwipesDef) {
    db.exec(`
      CREATE TABLE swipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        swiper_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('like', 'pass', 'superlike')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(swiper_id, target_id),
        FOREIGN KEY (swiper_id) REFERENCES profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE
      );
    `);
  } else if (!existingSwipesDef.sql.includes('superlike')) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE swipes_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          swiper_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('like', 'pass', 'superlike')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(swiper_id, target_id),
          FOREIGN KEY (swiper_id) REFERENCES profiles(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        INSERT INTO swipes_migrated (id, swiper_id, target_id, action, created_at)
        SELECT id, swiper_id, target_id, action, created_at FROM swipes;
        DROP TABLE swipes;
        ALTER TABLE swipes_migrated RENAME TO swipes;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  // Ensure messages table uses multi-user (sender_id, recipient_id, read_at)
  const existingMessagesCols = (
    db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
  ).map((c) => c.name);

  if (existingMessagesCols.length > 0 && !existingMessagesCols.includes('recipient_id')) {
    db.exec('DROP TABLE messages');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id);
    CREATE INDEX IF NOT EXISTS idx_swipes_target_action ON swipes(target_id, action);

    CREATE TABLE IF NOT EXISTS preferences (
      user_id TEXT PRIMARY KEY,
      min_age INTEGER NOT NULL DEFAULT 18,
      max_age INTEGER NOT NULL DEFAULT 35,
      max_distance INTEGER NOT NULL DEFAULT 50,
      verified_only INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, read_at);

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id TEXT NOT NULL,
      reported_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
  `);
}

export function seedDatabase(db: Database.Database): void {
  const existingUsersCount = (
    db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as { count: number }
  ).count;

  const insertProfileIfMissing = db.prepare(`
    INSERT OR IGNORE INTO profiles (
      id, name, age, photo_url, photos, bio, city_or_college,
      job_or_major, distance_miles, verified, looking_for, interests, prompts
    )
    VALUES (
      @id, @name, @age, @photo_url, @photos, @bio, @city_or_college,
      @job_or_major, @distance_miles, @verified, @looking_for, @interests, @prompts
    )
  `);

  const insertDefaultPrefs = db.prepare(`
    INSERT OR IGNORE INTO preferences (user_id, min_age, max_age, max_distance, verified_only)
    VALUES (?, 18, 35, 50, 0)
  `);

  const insertIncomingLike = db.prepare(`
    INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, created_at)
    VALUES (?, ?, 'like', ?)
  `);

  const runSeed = db.transaction(() => {
    insertProfileIfMissing.run({
      id: ME_PROFILE.id,
      name: ME_PROFILE.name,
      age: ME_PROFILE.age,
      photo_url: ME_PROFILE.photo_url,
      photos: JSON.stringify(ME_PROFILE.photos),
      bio: ME_PROFILE.bio,
      city_or_college: ME_PROFILE.city_or_college,
      job_or_major: ME_PROFILE.job_or_major,
      distance_miles: ME_PROFILE.distance_miles,
      verified: ME_PROFILE.verified ? 1 : 0,
      looking_for: ME_PROFILE.looking_for,
      interests: JSON.stringify(ME_PROFILE.interests),
      prompts: JSON.stringify(ME_PROFILE.prompts),
    });
    insertDefaultPrefs.run(CURRENT_USER_ID);

    for (const profile of SEED_PROFILES) {
      insertProfileIfMissing.run({
        id: profile.id,
        name: profile.name,
        age: profile.age,
        photo_url: profile.photo_url,
        photos: JSON.stringify(profile.photos),
        bio: profile.bio,
        city_or_college: profile.city_or_college,
        job_or_major: profile.job_or_major,
        distance_miles: profile.distance_miles,
        verified: profile.verified ? 1 : 0,
        looking_for: profile.looking_for,
        interests: JSON.stringify(profile.interests),
        prompts: JSON.stringify(profile.prompts),
      });
      insertDefaultPrefs.run(profile.id);
    }

    if (existingUsersCount === 0) {
      SEEDED_INCOMING_LIKE_IDS.forEach((profileId, index) => {
        const timestamp = new Date(Date.UTC(2026, 10, 18, 12, index, 0)).toISOString();
        insertIncomingLike.run(profileId, CURRENT_USER_ID, timestamp);
      });
    }
  });

  runSeed();
}

export function resetDatabase(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('DELETE FROM reports').run();
    db.prepare('DELETE FROM blocks').run();
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM swipes').run();
    db.prepare('DELETE FROM preferences').run();
    db.prepare('DELETE FROM profiles').run();
  })();
  seedDatabase(db);
}

export function createDatabase(
  dbPath: string = DEFAULT_DB_PATH,
  options?: { seed?: boolean },
): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  initSchema(db);
  if (options?.seed !== false) {
    seedDatabase(db);
  }
  return db;
}

export function getDb(): Database.Database {
  if (!singletonDb) {
    const configuredPath = process.env.COY_DB_PATH || DEFAULT_DB_PATH;
    singletonDb = createDatabase(configuredPath, { seed: true });
  }
  return singletonDb;
}
