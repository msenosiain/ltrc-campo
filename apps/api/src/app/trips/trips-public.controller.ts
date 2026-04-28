import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TripsService } from './trips.service';
import { LookupAuthorizationDto } from './dto/lookup-authorization.dto';

@Controller('trips/public')
export class TripsPublicController {
  constructor(private readonly tripsService: TripsService) {}

  @Get(':id')
  getPublicInfo(@Param('id') id: string) {
    return this.tripsService.getPublicTripInfo(id);
  }

  @Post(':id/authorization-lookup')
  lookupAuthorization(@Param('id') id: string, @Body() dto: LookupAuthorizationDto) {
    return this.tripsService.lookupAuthorizationByDni(id, dto.dni);
  }
}
