import { PartialType } from '@nestjs/mapped-types';
import { AddLodgingDto } from './add-lodging.dto';

export class UpdateLodgingDto extends PartialType(AddLodgingDto) {}
