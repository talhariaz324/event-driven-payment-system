import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletsService } from './wallets.service';

@Module({
  imports: [PrismaModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
