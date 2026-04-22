import { Body, Controller, Get, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ValidateDniDto } from './dto/validate-dni.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@Controller('payments/public')
export class PaymentsPublicController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('links/:token')
  getPublicLinkInfo(@Param('token') token: string) {
    return this.paymentsService.getPublicLinkInfo(token);
  }

  @Post('links/:token/validate')
  validateDni(@Param('token') token: string, @Body() dto: ValidateDniDto) {
    return this.paymentsService.validateDni(token, dto.dni);
  }

  @Post('links/:token/checkout')
  initiateCheckout(@Param('token') token: string, @Body() dto: ValidateDniDto) {
    return this.paymentsService.initiateCheckout(token, dto.dni);
  }

  @Post('confirm')
  confirmPayment(@Body() dto: ConfirmPaymentDto) {
    return this.paymentsService.confirmPayment(dto);
  }

  // IPN de MercadoPago — MP llama este endpoint cuando cambia el estado de un pago
  @Post('webhook/mp')
  @HttpCode(200)
  async handleMpWebhook(
    @Body() body: any,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
  ) {
    if (body?.type === 'payment' && body?.data?.id) {
      const dataId = String(body.data.id);
      const tsMatch = signature?.match(/ts=(\d+)/);
      const ts = tsMatch?.[1] ?? '';

      const valid = this.paymentsService.validateMpWebhookSignature(
        signature, requestId, dataId, ts,
      );
      if (!valid) throw new UnauthorizedException('Firma inválida');

      await this.paymentsService.syncPaymentByMpId(dataId);
    }
    return { received: true };
  }
}
