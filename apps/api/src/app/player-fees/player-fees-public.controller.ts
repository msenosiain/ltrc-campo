import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayerFeesService } from './player-fees.service';
import { ValidatePlayerFeeDto, ConfirmPlayerFeeDto } from './dto/validate-player-fee.dto';

@Controller('player-fees/public')
export class PlayerFeesPublicController {
  constructor(private readonly service: PlayerFeesService) {}

  @Get(':token')
  getPublicInfo(@Param('token') token: string) {
    return this.service.getPublicInfo(token);
  }

  @Post(':token/validate')
  validatePlayerFee(@Param('token') token: string, @Body() dto: ValidatePlayerFeeDto) {
    return this.service.validatePlayerFee(token, dto.dni);
  }

  @Post(':token/checkout')
  initiateCheckout(@Param('token') token: string, @Body() dto: ValidatePlayerFeeDto) {
    return this.service.initiatePlayerFeeCheckout(token, dto.dni);
  }

  @Post('confirm')
  confirmPayment(@Body() dto: ConfirmPlayerFeeDto) {
    return this.service.confirmPlayerFeePayment(dto);
  }
}
