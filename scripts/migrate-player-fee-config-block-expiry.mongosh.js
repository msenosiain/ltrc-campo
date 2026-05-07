// Migración: mover expiresAt de config a bloques y quitar expiresAt del nivel config
// Ejecutar en MongoDB Compass > mongosh shell, conectado a la base ltrc-ps

const FALLBACK_DATE = new Date('2025-12-31T00:00:00.000Z');

const configs = db.getCollection('player_fee_configs');
const all = configs.find({}).toArray();

print(`Configs encontradas: ${all.length}`);

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
    print(`  SKIP  [${config.label} ${config.season}] — ya migrado`);
    skipped++;
    continue;
  }

  configs.updateOne(
    { _id: config._id },
    {
      $set: { blocks: updatedBlocks },
      $unset: { expiresAt: '' },
    }
  );

  const source = hasConfigExpiry
    ? `fecha config: ${configExpiry.toISOString().slice(0, 10)}`
    : `placeholder: ${FALLBACK_DATE.toISOString().slice(0, 10)}`;
  print(`  OK    [${config.label} ${config.season}] — ${source}`);
  updated++;
}

print(`\nResultado: ${updated} actualizadas, ${skipped} sin cambios`);
