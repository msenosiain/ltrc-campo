import { PartialType } from '@nestjs/mapped-types';
import { CreatePlayerFeeConfigDto } from './create-player-fee-config.dto';

export class UpdatePlayerFeeConfigDto extends PartialType(CreatePlayerFeeConfigDto) {}
