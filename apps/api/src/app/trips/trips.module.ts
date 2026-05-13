import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TripsController } from './trips.controller';
import { TripsPublicController } from './trips-public.controller';
import { TripsService } from './trips.service';
import { TripEntity } from './schemas/trip.entity';
import { TripSchema } from './schemas/trip.schema';
import { PaymentEntity } from '../payments/schemas/payment.entity';
import { PaymentSchema } from '../payments/schemas/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TripEntity.name,
        schema: TripSchema,
        collection: 'trips',
      },
      {
        name: PaymentEntity.name,
        schema: PaymentSchema,
        collection: 'payments',
      },
    ]),
  ],
  controllers: [TripsController, TripsPublicController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
