import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConsoleModule } from 'nestjs-console';
import { DatabaseModule } from 'src/database/database.module';
import { WalletEthBalanceModule } from 'src/modules/wallet-eth-balance/wallet-eth-balance.module';
import { CrawlerModule } from 'src/modules/crawler/crawler.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared/share.module';
import { BotBlockerMiddleware } from './shared/middlewares/bot-blocker.middleware';

@Module({
  imports: [
    SharedModule,
    DatabaseModule,
    ConsoleModule,
    CrawlerModule,
    WalletEthBalanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [SharedModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BotBlockerMiddleware).forRoutes('*'); // Apply to all routes
  }
}
