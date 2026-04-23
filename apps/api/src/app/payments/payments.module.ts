import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsPublicController } from './payments-public.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSyncService } from './payments-sync.service';
import { PaymentLinkEntity } from './schemas/payment-link.entity';
import { PaymentLinkSchema } from './schemas/payment-link.schema';
import { PaymentEntity } from './schemas/payment.entity';
import { PaymentSchema } from './schemas/payment.schema';
import { PaymentConfigEntity, PAYMENT_CONFIG_MODEL } from './schemas/payment-config.entity';
import { PaymentConfigSchema } from './schemas/payment-config.schema';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PlayerSchema } from '../players/schemas/player.schema';
import { MatchEntity } from '../matches/schemas/match.entity';
import { MatchSchema } from '../matches/schemas/match.schema';
import { TripEntity } from '../trips/schemas/trip.entity';
import { TripSchema } from '../trips/schemas/trip.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: PaymentLinkEntity.name,
        schema: PaymentLinkSchema,
        collection: 'payment_links',
      },
      {
        name: PaymentEntity.name,
        schema: PaymentSchema,
        collection: 'payments',
      },
      {
        name: PAYMENT_CONFIG_MODEL,
        schema: PaymentConfigSchema,
        collection: 'payment_config',
      },
      { name: PlayerEntity.name, schema: PlayerSchema },
      { name: MatchEntity.name, schema: MatchSchema },
      { name: TripEntity.name, schema: TripSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PaymentsController, PaymentsPublicController],
  providers: [PaymentsService, PaymentsSyncService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
