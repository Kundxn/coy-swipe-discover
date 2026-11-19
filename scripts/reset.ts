import { getDb, resetDatabase } from '../lib/db/index.ts';

function main(): void {
  const db = getDb();
  resetDatabase(db);
  const profileCount = (
    db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE id != 'me'").get() as {
      count: number;
    }
  ).count;
  console.log(`Coy database reset complete: ${profileCount} member profiles ready.`);
  db.close();
}

main();
