/**
 * Migration: convert Match.date from a BSON Date (with the kickoff time
 * embedded, or midnight when no time was set) into a plain 'YYYY-MM-DD'
 * string, populating the separate Match.time ('HH:mm') field when the
 * stored instant carried a non-midnight Argentina wall-clock time.
 *
 * The existing form always builds the Date in the browser's local time
 * (assumed Argentina, UTC-3) and sends it via .toISOString(), so recovering
 * the original wall-clock reading means shifting the stored UTC instant
 * back by 3 hours before reading Y/M/D/H/M off it.
 *
 * IMPORTANT: run this BEFORE deploying the new backend code (Match.date
 * schema type String). Deploying first would make Mongoose cast old Date
 * values through a String schema on read, which is not what we want.
 *
 * Usage:
 *   node scripts/migrate-matches-date-to-string.js
 *
 * Connects to localhost:27017/ltrc-campo by default (matches .env.example).
 * Set MONGO_URI env var to point at Atlas/production instead.
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ltrc-campo';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const matches = db.collection('matches');

  const docs = await matches.find({}).toArray();

  const invalid = docs.filter((m) => !(m.date instanceof Date) && typeof m.date !== 'string');
  if (invalid.length > 0) {
    console.error(`❌ Found ${invalid.length} matches with an unexpected date value:`);
    for (const m of invalid) {
      console.error(`   - ${m._id} | ${m.opponent ?? '(no opponent)'} | ${m.date}`);
    }
    console.error('Fix these manually before running the migration.');
    await client.close();
    process.exit(1);
  }

  const alreadyString = docs.filter((m) => typeof m.date === 'string');
  if (alreadyString.length > 0) {
    console.log(`ℹ️  Skipping ${alreadyString.length} matches whose date is already a string.`);
  }

  const toMigrate = docs.filter((m) => m.date instanceof Date);
  console.log(`Found ${toMigrate.length} matches to migrate.`);

  let withTime = 0;
  let withoutTime = 0;

  for (const m of toMigrate) {
    const ar = new Date(m.date.getTime() - AR_OFFSET_MS);
    const dateStr = ar.toISOString().slice(0, 10);
    const hh = ar.getUTCHours();
    const mm = ar.getUTCMinutes();

    const update = { date: dateStr };
    if (hh !== 0 || mm !== 0) {
      update.time = `${pad(hh)}:${pad(mm)}`;
      withTime++;
    } else {
      withoutTime++;
    }

    await matches.updateOne({ _id: m._id }, { $set: update });
  }

  console.log(`✅ Migrated ${toMigrate.length} matches (${withTime} with time, ${withoutTime} without).`);
  console.log('\n🎉 Migration complete.');
  await client.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
