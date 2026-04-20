import { Document } from 'mongoose';

export const PAYMENT_CONFIG_MODEL = 'PaymentConfig';

export class PaymentConfigEntity extends Document {
  excludedPaymentTypes: string[];
}
