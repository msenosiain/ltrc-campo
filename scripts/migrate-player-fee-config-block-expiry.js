// Migración: adaptar player_fee_configs al nuevo esquema
// - Mueve expiresAt del nivel config al nivel de cada bloque (si no tiene ya uno)
// - Quita expiresAt del nivel config
// Uso: node scripts/migrate-player-fee-config-block-expiry.js

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'ltrc-ps';

// Fecha placeholder para bloques cuya config no tenía expiresAt propio
const FALLBACK_DATE = new Date('2025-12-31T00:00:00.000Z');

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const configs = db.collection('player_fee_configs');

  const all = await configs.find({}).toArray();
  console.log(`Configs encontradas: ${all.length}`);

  let updated = 0;
  let skipped = 0;

  for (const config of all) {
    const configExpiry = config.expiresAt ? new Date(config.expiresAt) : FALLBACK_DATE;

    const updatedBlocks = (config.blocks || []).map(block => ({
      ...block,
      expiresAt: block.expiresAt ? block.expiresAt : configExpiry,
    }));

    const blocksChanged = updatedBlocks.some((b, i) => !config.blocks[i].expiresAt);
    const hasConfigExpiry = !!config.expiresAt;

    if (!blocksChanged && !hasConfigExpiry) {
      console.log(`  SKIP  [${config.label} ${config.season}] — ya migrado`);
      skipped++;
      continue;
    }

    await configs.updateOne(
      { _id: config._id },
      {
        $set: { blocks: updatedBlocks },
        $unset: { expiresAt: '' },
      }
    );

    const source = hasConfigExpiry
      ? `fecha de config: ${configExpiry.toISOString().slice(0, 10)}`
      : `fecha placeholder: ${FALLBACK_DATE.toISOString().slice(0, 10)}`;
    console.log(`  OK    [${config.label} ${config.season}] — bloques actualizados (${source})`);
    updated++;
  }

  console.log(`\nResultado: ${updated} actualizadas, ${skipped} sin cambios`);
  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
