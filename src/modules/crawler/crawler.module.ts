import { Module } from '@nestjs/common';
import { CrawlerConsole } from 'src/modules/crawler/crawler.console';
import { SharedModule } from 'src/shared/share.module';

@Module({
  imports: [SharedModule],
  providers: [CrawlerConsole],
})
export class CrawlerModule {}
