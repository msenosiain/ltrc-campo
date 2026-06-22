import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { File as MulterFile } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { ForcedeckService } from './forcedeck.service';

@Controller('training-sessions/:sessionId/forcedeck')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleEnum.ADMIN,
  RoleEnum.COORDINATOR,
  RoleEnum.MANAGER,
  RoleEnum.COACH,
  RoleEnum.ANALYST,
  RoleEnum.TRAINER
)
export class ForcedeckController {
  constructor(private readonly forcedeckService: ForcedeckService) {}

  @Post('cmj')
  @UseInterceptors(FileInterceptor('file'))
  async importCmj(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: MulterFile
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo CSV');
    return this.forcedeckService.importCmjCsv(sessionId, file.buffer);
  }

  @Post('cmrj')
  @UseInterceptors(FileInterceptor('file'))
  async importCmrj(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: MulterFile
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo CSV');
    return this.forcedeckService.importCmrjCsv(sessionId, file.buffer);
  }
}
