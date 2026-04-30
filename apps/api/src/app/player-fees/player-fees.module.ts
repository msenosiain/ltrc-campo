import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlayerFeesController } from './player-fees.controller';
import { PlayerFeesPublicController } from './player-fees-public.controller';
import { PlayerFeesService } from './player-fees.service';
import { PlayerFeeConfigEntity } from './schemas/player-fee-config.entity';
import { PlayerFeeConfigSchema } from './schemas/player-fee-config.schema';
import { FamilyGroupEntity } from './schemas/family-group.entity';
import { FamilyGroupSchema } from './schemas/family-group.schema';
import { PlayerFeePaymentEntity } from './schemas/player-fee-payment.entity';
import { PlayerFeePaymentSchema } from './schemas/player-fee-payment.schema';
import { PlayerSeasonRecordEntity } from './schemas/player-season-record.entity';
import { PlayerSeasonRecordSchema } from './schemas/player-season-record.schema';
import { PlayerEntity } from '../players/schemas/player.entity';
import { PlayerSchema } from '../players/schemas/player.schema';
import { PaymentEntity } from '../payments/schemas/payment.entity';
import { PaymentSchema } from '../payments/schemas/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlayerFeeConfigEntity.name, schema: PlayerFeeConfigSchema },
      { name: FamilyGroupEntity.name, schema: FamilyGroupSchema },
      { name: PlayerFeePaymentEntity.name, schema: PlayerFeePaymentSchema },
      { name: PlayerSeasonRecordEntity.name, schema: PlayerSeasonRecordSchema },
      { name: PlayerEntity.name, schema: PlayerSchema },
      { name: PaymentEntity.name, schema: PaymentSchema },
    ]),
  ],
  controllers: [PlayerFeesController, PlayerFeesPublicController],
  providers: [PlayerFeesService],
  exports: [PlayerFeesService],
})
export class PlayerFeesModule {}
