import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsSyncService {
  private readonly logger = new Logger(PaymentsSyncService.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncPendingPayments() {
    this.logger.log('Sincronizando pagos pendientes con MercadoPago...');
    try {
      const result = await this.paymentsService.syncAllPending();
      this.logger.log(`Sync completado: ${result.synced} revisados, ${result.updated} actualizados`);
    } catch (err) {
      this.logger.error('Error al sincronizar pagos pendientes', err);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncExpiredLinks() {
    this.logger.log('Marcando links de pago vencidos...');
    try {
      const count = await this.paymentsService.syncExpiredLinks();
      if (count > 0) this.logger.log(`${count} link(s) marcados como vencidos`);
    } catch (err) {
      this.logger.error('Error al sincronizar links vencidos', err);
    }
  }
}
