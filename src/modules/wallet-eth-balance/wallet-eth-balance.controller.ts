import {
  Controller,
  Get,
  HttpException,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { WalletEthBalanceService } from 'src/modules/wallet-eth-balance/wallet-eth-balance.service';

@Controller('wallet-eth-balance')
@ApiTags('Wallet ETH Balance')
export class WalletEthBalanceController {
  constructor(
    private readonly walletEthBalanceService: WalletEthBalanceService,
  ) {}

  @Get()
  @ApiQuery({
    name: 'timestamp',
    description: 'Timestamp to get the balance of all owners',
    example: '1619215694000',
  })
  getEthBalance(
    @Query('timestamp', ParseIntPipe) timestamp: number,
    @Query('isForceCache', new ParseBoolPipe({ optional: true }))
    isForceCache = false,
  ) {
    try {
      return this.walletEthBalanceService.getWalletEthBalance(
        timestamp,
        isForceCache,
      );
    } catch (error) {
      console.log('error', error);
      throw new HttpException('Something went wrong', 400);
    }
  }
}
