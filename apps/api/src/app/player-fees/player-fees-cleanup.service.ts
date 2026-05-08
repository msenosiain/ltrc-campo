import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlayerFeePaymentEntity } from './schemas/player-fee-payment.entity';
import { PlayerFeeStatusEnum } from '@ltrc-campo/shared-api-model';

@Injectable()
export class PlayerFeesCleanupService {
  private readonly logger = new Logger(PlayerFeesCleanupService.name);

  constructor(
    @InjectModel(PlayerFeePaymentEntity.name)
    private readonly paymentModel: Model<PlayerFeePaymentEntity>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cancelAbandonedCheckouts() {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = await this.paymentModel.updateMany(
      { status: PlayerFeeStatusEnum.PENDING, createdAt: { $lt: cutoff } },
      { status: PlayerFeeStatusEnum.CANCELLED },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Cancelados ${result.modifiedCount} pagos pendientes abandonados`);
    }
  }
}
