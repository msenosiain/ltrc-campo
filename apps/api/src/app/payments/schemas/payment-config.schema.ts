import { Schema } from 'mongoose';
import { PaymentConfigEntity, PAYMENT_CONFIG_MODEL } from './payment-config.entity';

export { PAYMENT_CONFIG_MODEL };
export const PaymentConfigSchema = new Schema<PaymentConfigEntity>(
  {
    excludedPaymentTypes: { type: [String], default: [] },
  },
  { timestamps: true }
);
