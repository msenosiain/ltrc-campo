// Recuperación de participantes de un viaje a partir de los pagos registrados
// Usar cuando se borraron accidentalmente los participantes del viaje.
//
// Pegar directamente en el shell de MongoDB Compass (mongosh).

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const TRIP_ID = '69fbecfd047cfe98c9bc3079';
const DRY_RUN = true; // cambiar a false para aplicar los cambios

// ─────────────────────────────────────────────────────────────────────────────

const tripOid  = ObjectId(TRIP_ID);
const trip     = db.trips.findOne({ _id: tripOid }, { name: 1, costPerPerson: 1, participants: 1 });

if (!trip) {
  print(`ERROR: no se encontró el viaje con _id = ${TRIP_ID}`);
} else {

  print(`\nViaje: "${trip.name}"`);
  print(`Participantes actuales: ${(trip.participants ?? []).length}`);
  print(`Costo por persona: $${trip.costPerPerson ?? 0}`);

  const cost = trip.costPerPerson ?? 0;

  // Buscar por ObjectId y por string (por si el campo fue guardado en distinto formato)
  const payments = db.payments.find({
    entityType: 'trip',
    $or: [{ entityId: tripOid }, { entityId: TRIP_ID }],
  }).toArray();

  print(`Pagos encontrados: ${payments.length}`);

  if (payments.length === 0) {
    print('No hay pagos registrados para este viaje. No se puede recuperar nada.');
  } else {

    // Agrupar pagos por pagador
    const byPlayer = {}, byUser = {}, byDni = {};
    for (const p of payments) {
      if      (p.playerId) { const k = p.playerId.toString(); (byPlayer[k] ??= []).push(p); }
      else if (p.userId)   { const k = p.userId.toString();   (byUser[k]   ??= []).push(p); }
      else if (p.payerDni) { (byDni[p.payerDni] ??= []).push(p); }
    }

    // Participantes ya existentes (no tocar)
    const existingPlayerIds = new Set((trip.participants ?? []).filter(p => p.type === 'PLAYER' && p.player).map(p => p.player.toString()));
    const existingUserIds   = new Set((trip.participants ?? []).filter(p => p.type === 'STAFF'  && p.user).map(p => p.user.toString()));
    const existingDnis      = new Set((trip.participants ?? []).filter(p => p.type === 'EXTERNAL' && p.externalDni).map(p => p.externalDni));

    print(`Participantes existentes conservados: ${(trip.participants ?? []).length}\n`);

    const toAdd = [];

    // Jugadores
    for (const [id, pmts] of Object.entries(byPlayer)) {
      if (existingPlayerIds.has(id)) {
        const pl = db.players.findOne({ _id: ObjectId(id) }, { name: 1 });
        print(`  SKIP    ${pl?.name ?? id} — ya está en el viaje`);
        continue;
      }
      const totalPaid = pmts.reduce((s, p) => s + p.amount, 0);
      const status    = cost > 0 && totalPaid >= cost ? 'confirmed' : 'pending';
      const pl        = db.players.findOne({ _id: ObjectId(id) }, { name: 1 });
      print(`  AGREGAR ${pl?.name ?? id} — pagado $${totalPaid} → ${status}`);
      toAdd.push({
        _id: new ObjectId(), type: 'PLAYER', player: ObjectId(id),
        status, costAssigned: cost, documentationOk: false,
        payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
      });
    }

    // Staff
    for (const [id, pmts] of Object.entries(byUser)) {
      if (existingUserIds.has(id)) {
        const u = db.users.findOne({ _id: ObjectId(id) }, { name: 1 });
        print(`  SKIP    ${u?.name ?? id} — ya está en el viaje`);
        continue;
      }
      const totalPaid = pmts.reduce((s, p) => s + p.amount, 0);
      const status    = cost > 0 && totalPaid >= cost ? 'confirmed' : 'pending';
      const u         = db.users.findOne({ _id: ObjectId(id) }, { name: 1 });
      print(`  AGREGAR ${u?.name ?? id} — pagado $${totalPaid} → ${status}`);
      toAdd.push({
        _id: new ObjectId(), type: 'STAFF', user: ObjectId(id),
        status, costAssigned: cost, documentationOk: false,
        payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
      });
    }

    // Externos
    for (const [dni, pmts] of Object.entries(byDni)) {
      if (existingDnis.has(dni)) {
        print(`  SKIP    ${pmts[0].payerName ?? dni} — ya está en el viaje`);
        continue;
      }
      const totalPaid = pmts.reduce((s, p) => s + p.amount, 0);
      const status    = cost > 0 && totalPaid >= cost ? 'confirmed' : 'pending';
      print(`  AGREGAR ${pmts[0].payerName ?? dni} (DNI ${dni}) — pagado $${totalPaid} → ${status}`);
      toAdd.push({
        _id: new ObjectId(), type: 'EXTERNAL', externalName: pmts[0].payerName, externalDni: dni,
        status, costAssigned: cost, documentationOk: false,
        payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
      });
    }

    print(`\nTotal a recuperar: ${toAdd.length} participantes`);

    if (toAdd.length === 0) {
      print('Nada nuevo para agregar.');
    } else if (DRY_RUN) {
      print('[DRY RUN] Cambiá DRY_RUN = false para aplicar los cambios.');
    } else {
      db.trips.updateOne({ _id: tripOid }, { $push: { participants: { $each: toAdd } } });
      print(`✓ ${toAdd.length} participantes recuperados. Los M12 existentes no fueron modificados.`);
      print('  Los participantes sin pagos registrados deben agregarse a mano.');
    }

  }
}
