import { RedisService } from '@liaoliaots/nestjs-redis';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Command, Console } from 'nestjs-console';
import { NFT_CONTRACT_ABI } from 'src/configs/nft-abi';
import { LatestBlockEntity } from 'src/database/entities/latest-block.entity';
import { TransferEntity } from 'src/database/entities/transfer.entity';
import { LatestBlockRepository } from 'src/database/repositories/latest-block.repository';
import { CRAWLER_CONSTANT } from 'src/modules/crawler/crawler.constant';
import { sleep } from 'src/shared/helpers/sleep';
import { Web3Helper } from 'src/shared/helpers/web3.helper';
import { DataSource } from 'typeorm';
import Web3, { Contract, ContractAbi, EventLog } from 'web3';

@Console()
export class CrawlerConsole {
  private logger = new Logger(CrawlerConsole.name);
  private web3Instance: Web3;
  private nftContract: Contract<ContractAbi> = undefined;
  private nftContractAddress: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly latestBlockRepo: LatestBlockRepository,
    private readonly dataSource: DataSource,
    private redisService: RedisService,
  ) {
    this.web3Instance = Web3Helper.web3Provider(
      this.configService.get<string>('RPC_URL'),
    );
    this.nftContract = new this.web3Instance.eth.Contract(
      NFT_CONTRACT_ABI,
      this.configService.get<string>('NFT_CONTRACT'),
    );
    this.nftContractAddress = this.configService.get<string>('NFT_CONTRACT');
  }

  async getFromToBlock(): Promise<{ fromBlock: number; toBlock: number }> {
    const latestBlock = await this.latestBlockRepo.findOne({
      where: {
        contractAddress: this.nftContractAddress,
      },
    });

    let fromBlock = Number(this.configService.get('START_BLOCK'));
    if (latestBlock) {
      fromBlock = latestBlock.block;
    } else {
      const newLatestBlock = new LatestBlockEntity();
      newLatestBlock.block = fromBlock;
      newLatestBlock.contractAddress = this.nftContractAddress;
      await this.latestBlockRepo.save(newLatestBlock);
    }

    let currentBlock;
    while (true) {
      currentBlock = Number(await this.web3Instance.eth.getBlockNumber());
      if (currentBlock - CRAWLER_CONSTANT.BLOCK_DELAY >= fromBlock) break;
      await sleep(CRAWLER_CONSTANT.BLOCK_SLEEP);
      this.logger.log(
        `Sleep ${CRAWLER_CONSTANT.BLOCK_SLEEP}s wait for valid block.`,
      );
    }

    let toBlock = fromBlock + CRAWLER_CONSTANT.BLOCK_CRAWL;
    if (toBlock > currentBlock - CRAWLER_CONSTANT.BLOCK_DELAY) {
      toBlock = currentBlock - CRAWLER_CONSTANT.BLOCK_DELAY;
    }
    if (toBlock <= fromBlock) {
      toBlock = fromBlock;
    }

    return {
      fromBlock,
      toBlock,
    };
  }

  @Command({
    command: 'crawler',
    description: 'Crawl data from blockchain event',
  })
  async crawler(): Promise<void> {
    this.logger.log('Start crawler:');
    while (true) {
      await sleep(CRAWLER_CONSTANT.BLOCK_SLEEP);

      const crawlBlock = await this.getFromToBlock();
      console.log('crawlBlock: ', crawlBlock);

      this.logger.log(
        `Crawl from ${crawlBlock.fromBlock} to ${crawlBlock.toBlock}`,
      );

      try {
        const events: EventLog[] = await this.crawlEventsWithRetry(crawlBlock);

        this.logger.log(`Found ${events.length} events`);

        await this.processEvents(events, crawlBlock);
      } catch (error) {
        this.logger.error(`Crawler error: ${error.message}`);
        this.logger.log('Retrying with smaller block range...');
        await sleep(5000);
        continue;
      }
    }
  }

  private async crawlEventsWithRetry(
    crawlBlock: { fromBlock: number; toBlock: number },
    maxRetries = 3,
  ): Promise<EventLog[]> {
    let blockRange = crawlBlock.toBlock - crawlBlock.fromBlock;
    const fromBlock = crawlBlock.fromBlock;
    let toBlock = crawlBlock.toBlock;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.logger.log(
          `Attempting to crawl ${blockRange} blocks (${fromBlock} to ${toBlock})`,
        );

        const events: EventLog[] = (await this.nftContract.getPastEvents(
          'allEvents',
          { fromBlock, toBlock },
        )) as EventLog[];

        return events;
      } catch (error) {
        if (error.message.includes('more than 10000 results')) {
          blockRange = Math.floor(blockRange / 2);
          toBlock = fromBlock + blockRange;

          this.logger.warn(
            `Too many results, reducing block range to ${blockRange} blocks`,
          );

          if (blockRange < CRAWLER_CONSTANT.MIN_BLOCK_RANGE) {
            throw new Error('Block range too small, cannot proceed');
          }
          continue;
        }

        if (attempt === maxRetries - 1) {
          throw error;
        }

        this.logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
        await sleep(2000 * (attempt + 1));
      }
    }

    throw new Error('Max retries exceeded');
  }

  private async processEvents(
    events: EventLog[],
    crawlBlock: { fromBlock: number; toBlock: number },
  ): Promise<void> {
    const queryRunner = await this.dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    const blockTimestamp = {};

    try {
      const transferEvents = [];
      for (const event of events) {
        if (event.event !== 'Transfer') continue;
        console.log(
          event.blockNumber,
          event.event,
          event.returnValues.from,
          event.returnValues.to,
          event.returnValues.tokenId,
          event.transactionHash,
        );
        const transfer = new TransferEntity();

        transfer.blockNumber = Number(event.blockNumber);
        transfer.from = `${event.returnValues.from}`;
        transfer.to = `${event.returnValues.to}`;
        transfer.txHash = `${event.transactionHash}`;
        transfer.tokenId = Number(event.returnValues.tokenId);

        // saving rpc call
        if (blockTimestamp[Number(event.blockNumber)] === undefined) {
          const block = await this.web3Instance.eth.getBlock(event.blockNumber);

          blockTimestamp[Number(event.blockNumber)] =
            Number(block.timestamp) * 1000;
        }

        transfer.blockTimestamp = blockTimestamp[Number(event.blockNumber)];

        transferEvents.push(transfer);
      }

      await queryRunner.manager.save(TransferEntity, transferEvents);

      await queryRunner.manager.update(
        LatestBlockEntity,
        { contractAddress: this.nftContractAddress },
        { block: crawlBlock.toBlock + 1 },
      );
      const block_timestamp = [];

      for (const block in blockTimestamp) {
        block_timestamp.push(blockTimestamp[block]);
        block_timestamp.push(block);
      }

      if (block_timestamp.length > 0)
        await this.redisService
          .getClient()
          .zadd('block_timestamp', ...block_timestamp);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(error.stack);
    } finally {
      await queryRunner.release();
    }
  }
}
