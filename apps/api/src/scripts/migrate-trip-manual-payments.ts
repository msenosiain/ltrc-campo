/**
 * Backfills existing manual payments (cash/transfer) for trips into
 * participant.payments[] — payments recorded before the fix only existed
 * in the payments collection and were not synced to the embedded array.
 *
 * Run: npx ts-node -r tsconfig-paths/register apps/api/src/scripts/migrate-trip-manual-payments.ts
 */

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app/app.module';
import { PaymentEntity } from '../app/payments/schemas/payment.entity';
import { TripEntity } from '../app/trips/schemas/trip.entity';
import {
  PaymentEntityTypeEnum,
  PaymentMethodEnum,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
} from '@ltrc-campo/shared-api-model';

async function migrate() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const paymentModel = app.get<Model<PaymentEntity>>(getModelToken(PaymentEntity.name));
  const tripModel = app.get<Model<TripEntity>>(getModelToken(TripEntity.name));

  const manualPayments = await paymentModel.find({
    entityType: PaymentEntityTypeEnum.TRIP,
    method: { $in: [PaymentMethodEnum.CASH, PaymentMethodEnum.TRANSFER] },
  }).lean();

  console.log(`Found ${manualPayments.length} manual trip payments to process`);

  let synced = 0;
  let skipped = 0;
  let notFound = 0;

  for (const payment of manualPayments) {
    if (!payment.playerId) { skipped++; continue; }

    const trip = await tripModel.findById(payment.entityId);
    if (!trip) { notFound++; continue; }

    const participant: any = trip.participants.find(
      (p) => p.type === TripParticipantTypeEnum.PLAYER && p.player?.toString() === payment.playerId!.toString(),
    );
    if (!participant) { notFound++; continue; }

    const alreadySynced = participant.payments.some(
      (p: any) => p.sourcePaymentId?.toString() === payment._id.toString(),
    );
    if (alreadySynced) { skipped++; continue; }

    participant.payments.push({
      amount: payment.amount,
      date: payment.date ?? new Date(),
      method: payment.method,
      notes: payment.notes,
      sourcePaymentId: payment._id,
    });

    const totalPaid = participant.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    if (participant.costAssigned > 0 && totalPaid >= participant.costAssigned) {
      participant.status = TripParticipantStatusEnum.CONFIRMED;
    }

    await trip.save();
    synced++;
    console.log(`  Synced payment ${payment._id} → trip ${payment.entityId} / participant ${participant._id}`);
  }

  console.log(`\nDone. Synced: ${synced} | Already synced: ${skipped} | Participant/trip not found: ${notFound}`);
  await app.close();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
