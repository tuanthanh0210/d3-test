import { Module } from '@nestjs/common';
import { WalletEthBalanceController } from 'src/modules/wallet-eth-balance/wallet-eth-balance.controller';
import { WalletEthBalanceService } from 'src/modules/wallet-eth-balance/wallet-eth-balance.service';

@Module({
  imports: [],
  controllers: [WalletEthBalanceController],
  providers: [WalletEthBalanceService],
  exports: [],
})
export class WalletEthBalanceModule {}
