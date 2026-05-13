// Recuperación de participantes de un viaje a partir de los pagos registrados
// Usar cuando se borraron accidentalmente los participantes del viaje.
//
// Pegar directamente en el shell de MongoDB Compass (mongosh).

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

const TRIP_ID = '69fbecfd047cfe98c9bc3079';
const DRY_RUN = true; // cambiar a false para aplicar los cambios

// ─────────────────────────────────────────────────────────────────────────────

const tripOid  = ObjectId(TRIP_ID);
let   trip     = db.trips.findOne({ _id: tripOid }, { name: 1, costPerPerson: 1, participants: 1 });

if (!trip) {
  print(`ERROR: no se encontró el viaje con _id = ${TRIP_ID}`);
} else {

  print(`\nViaje: "${trip.name}"`);
  print(`Participantes actuales: ${(trip.participants ?? []).length}`);
  print(`Costo por persona: $${trip.costPerPerson ?? 0}`);

  // ─── PASO 1: corregir tipos en mayúsculas de carga anterior ────────────────
  const withUppercase = (trip.participants ?? []).filter(p => ['PLAYER', 'STAFF', 'EXTERNAL'].includes(p.type));
  if (withUppercase.length > 0) {
    print(`\nParticipantes con tipo en mayúsculas (invisibles en UI): ${withUppercase.length}`);
    if (DRY_RUN) {
      print('[DRY RUN] Se corregirían los tipos a minúsculas.');
    } else {
      for (const p of withUppercase) {
        db.trips.updateOne(
          { _id: tripOid, 'participants._id': p._id },
          { $set: { 'participants.$.type': p.type.toLowerCase() } }
        );
      }
      print(`✓ ${withUppercase.length} tipos corregidos a minúsculas.`);
      trip = db.trips.findOne({ _id: tripOid }, { name: 1, costPerPerson: 1, participants: 1 });
    }
  }

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
    const existingPlayerIds = new Set((trip.participants ?? []).filter(p => p.type === 'player' && p.player).map(p => p.player.toString()));
    const existingUserIds   = new Set((trip.participants ?? []).filter(p => p.type === 'staff'  && p.user).map(p => p.user.toString()));
    const existingDnis      = new Set((trip.participants ?? []).filter(p => p.type === 'external' && p.externalDni).map(p => p.externalDni));

    print(`Participantes existentes conservados: ${(trip.participants ?? []).length}\n`);

    const toAdd    = [];
    const toRemove = []; // _ids de externos que en realidad son jugadores

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
        _id: new ObjectId(), type: 'player', player: ObjectId(id),
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
        _id: new ObjectId(), type: 'staff', user: ObjectId(id),
        status, costAssigned: cost, documentationOk: false,
        payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
      });
    }

    // Pagos con DNI: buscar si existe un jugador con ese DNI, si no tratar como externo
    for (const [dni, pmts] of Object.entries(byDni)) {
      const player = db.players.findOne({ idNumber: dni }, { name: 1 });

      if (player) {
        const pid = player._id.toString();
        if (existingPlayerIds.has(pid)) {
          print(`  SKIP    ${player.name} (DNI ${dni}) — ya está como JUGADOR`);
          continue;
        }
        // Puede que esté como externo (carga anterior incorrecta) — marcarlo para remover
        const wrongExternal = (trip.participants ?? []).find(p => p.type === 'external' && p.externalDni === dni);
        if (wrongExternal) {
          print(`  REEMPLAZAR ${player.name} (DNI ${dni}) — era EXTERNO, pasa a JUGADOR`);
          toRemove.push(wrongExternal._id);
        } else {
          print(`  AGREGAR ${player.name} (DNI ${dni}) como JUGADOR`);
        }
        const totalPaid = pmts.reduce((s, p) => s + p.amount, 0);
        const status    = cost > 0 && totalPaid >= cost ? 'confirmed' : 'pending';
        toAdd.push({
          _id: new ObjectId(), type: 'player', player: player._id,
          status, costAssigned: cost, documentationOk: false,
          payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
        });
      } else {
        // No existe en el sistema — tratar como externo
        if (existingDnis.has(dni)) {
          print(`  SKIP    ${pmts[0].payerName ?? dni} — ya está como EXTERNO`);
          continue;
        }
        const totalPaid = pmts.reduce((s, p) => s + p.amount, 0);
        const status    = cost > 0 && totalPaid >= cost ? 'confirmed' : 'pending';
        print(`  AGREGAR ${pmts[0].payerName ?? dni} (DNI ${dni}) como EXTERNO`);
        toAdd.push({
          _id: new ObjectId(), type: 'external', externalName: pmts[0].payerName, externalDni: dni,
          status, costAssigned: cost, documentationOk: false,
          payments: pmts.map(p => ({ _id: new ObjectId(), amount: p.amount, date: p.date, method: p.method ?? 'cash', notes: p.notes, sourcePaymentId: p._id })),
        });
      }
    }

    print(`\nResumen:`);
    print(`  Externos a reemplazar por JUGADOR: ${toRemove.length}`);
    print(`  Participantes a agregar:           ${toAdd.length}`);

    if (toAdd.length === 0 && toRemove.length === 0) {
      print('Nada para modificar.');
    } else if (DRY_RUN) {
      print('\n[DRY RUN] Cambiá DRY_RUN = false para aplicar los cambios.');
    } else {
      if (toRemove.length > 0) {
        db.trips.updateOne({ _id: tripOid }, { $pull: { participants: { _id: { $in: toRemove } } } });
        print(`✓ ${toRemove.length} externos incorrectos removidos.`);
      }
      if (toAdd.length > 0) {
        db.trips.updateOne({ _id: tripOid }, { $push: { participants: { $each: toAdd } } });
        print(`✓ ${toAdd.length} participantes agregados.`);
      }
      print('  Los M12 existentes no fueron modificados.');
      print('  Los participantes sin pagos registrados deben agregarse a mano.');
    }

  }
}
