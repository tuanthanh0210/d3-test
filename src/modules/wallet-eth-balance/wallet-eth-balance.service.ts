import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LatestBlockRepository } from 'src/database/repositories';
import { TransferRepository } from 'src/database/repositories/transfer.repository';
import { WalletEthBalance } from 'src/modules/wallet-eth-balance/wallet-eth-balance.interface';
import { sleep } from 'src/shared/helpers/sleep';
import { Web3Helper } from 'src/shared/helpers/web3.helper';
import Web3 from 'web3';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class WalletEthBalanceService {
  private web3Instance: Web3;
  private BATCH_SIZE = 100;
  private SAVE_BLOCK_NUMBER: number;
  private nftContractAddress: string;
  private logger: Logger;

  constructor(
    private transferRepo: TransferRepository,
    private lastestBlockRepo: LatestBlockRepository,
    private readonly configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.logger = new Logger(WalletEthBalanceService.name);
    this.web3Instance = Web3Helper.web3Provider(
      this.configService.get<string>('RPC_URL_GET_BALANCE'),
    );
    this.SAVE_BLOCK_NUMBER = Number(
      this.configService.get<number>('SAVE_BLOCK_NUMBER') || 20,
    );
    this.nftContractAddress = this.configService.get<string>('NFT_CONTRACT');
  }
  async getWalletEthBalance(
    timestamp: number,
    isForceCache = false,
  ): Promise<WalletEthBalance> {
    const blockNumber = await this._getBlockNumberByTimestamp(timestamp);
    console.log('blockNumber: ', blockNumber);

    // Optimize: get cache balance to decrease the number of requests to the RPC
    const cacheBalance = await this._getCacheBalance(blockNumber);
    if (cacheBalance && !isForceCache) return cacheBalance;

    this.logger.log(
      `Block balance does not exist in cache. Starting get balance on chain`,
    );

    const owners = await this.transferRepo.query(
      `
      SELECT DISTINCT \`to\`
        FROM (
          SELECT \`to\`, ROW_NUMBER() OVER (PARTITION BY transfer.tokenId ORDER BY transfer.blockNumber DESC) AS rowNum 
          FROM transfer
          WHERE blockNumber < ?
        ) AS subtable
          WHERE rowNum = 1`,
      [blockNumber + 1],
    );

    const distinctOwnersArray = owners.map((owner) => owner.to);
    console.log('Total owners: ', distinctOwnersArray.length);

    const ownerBalances = await this._getBalanceAllOwners(
      distinctOwnersArray,
      blockNumber,
    );

    const result: WalletEthBalance = {
      blockNumber,
      owners: Object.fromEntries(ownerBalances),
    };

    const currentBlock = await this.lastestBlockRepo.findOne({
      where: {
        contractAddress: this.nftContractAddress,
      },
    });

    console.log(
      'Total users: ',
      distinctOwnersArray.length,
      'Total users in result: ',
      Object.keys(result.owners).length,
    );

    // If the number of users is not the same, retry with the wallets that have no balance
    if (distinctOwnersArray.length > Object.keys(result.owners).length) {
      const missingWallets = distinctOwnersArray.filter(
        (wallet) => !result.owners.hasOwnProperty(wallet),
      );

      console.log(
        `Missing ${missingWallets.length} wallets, retrying...`,
        missingWallets.slice(0, 10), // Log first 10 for debugging
      );

      const retryBalances = await this._retryMissingWallets(
        missingWallets,
        blockNumber,
      );

      // Merge retry results with existing results
      retryBalances.forEach((value, key) => {
        result.owners[key] = value;
      });

      console.log(
        'After retry - Total users in result: ',
        Object.keys(result.owners).length,
      );
    }

    if (
      currentBlock.block - blockNumber > this.SAVE_BLOCK_NUMBER &&
      distinctOwnersArray.length === Object.keys(result.owners).length
    ) {
      await this._setCacheBalance(blockNumber, result.owners);
      this.logger.log(`Saving balance to cache for block ${blockNumber}`);
    }

    return result;
  }

  private async _retryMissingWallets(
    missingWallets: string[],
    blockNumber: number,
  ): Promise<Map<string, string>> {
    const MAX_RETRY_ATTEMPTS = 5;
    let currentMissingWallets = [...missingWallets];
    const finalBalances = new Map<string, string>();

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      if (currentMissingWallets.length === 0) {
        console.log('All missing wallets have been processed successfully');
        break;
      }

      console.log(
        `Retry attempt ${attempt}/${MAX_RETRY_ATTEMPTS} for ${currentMissingWallets.length} wallets`,
      );

      try {
        const retryBalances = await this._getBalanceAllOwners(
          currentMissingWallets,
          blockNumber,
        );

        // Merge successful results
        retryBalances.forEach((value, key) => {
          finalBalances.set(key, value);
        });

        // Update missing wallets list (remove successfully processed ones)
        const successfulWallets = Array.from(retryBalances.keys());
        currentMissingWallets = currentMissingWallets.filter(
          (wallet) => !successfulWallets.includes(wallet),
        );

        console.log(
          `Retry attempt ${attempt} completed. Successfully processed: ${successfulWallets.length}, Still missing: ${currentMissingWallets.length}`,
        );

        // If still have missing wallets, wait before next retry
        if (currentMissingWallets.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
          const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
          console.log(`Waiting ${waitTime}ms before next retry...`);
          await sleep(waitTime);
        }
      } catch (error) {
        console.error(`Retry attempt ${attempt} failed:`, error.message);

        if (attempt === MAX_RETRY_ATTEMPTS) {
          console.error(
            `Failed to get balance for ${currentMissingWallets.length} wallets after ${MAX_RETRY_ATTEMPTS} attempts`,
          );

          // Set failed wallets to 0 balance
          currentMissingWallets.forEach((wallet) => {
            finalBalances.set(wallet, '0');
          });

          throw new HttpException(
            `Failed to get balance for ${currentMissingWallets.length} wallets after ${MAX_RETRY_ATTEMPTS} retry attempts`,
            HttpStatus.BAD_REQUEST,
          );
        }

        // Wait before next retry on error
        const waitTime = Math.min(3000 * Math.pow(2, attempt - 1), 60000);
        console.log(
          `Error occurred. Waiting ${waitTime}ms before next retry...`,
        );
        await sleep(waitTime);
      }
    }

    return finalBalances;
  }

  private async _getBlockNumberByTimestamp(timestamp: number): Promise<number> {
    const _block = await this.redisService
      .getClient()
      .zrevrangebyscore('block_timestamp', timestamp, 0, 'LIMIT', 0, 1);
    return Number(_block[0]);
  }

  private async _setCacheBalance(
    blockNumber: number,
    owners: Record<string, string>,
  ) {
    const cacheKey = `balance:${blockNumber}`;
    await this.redisService.getClient().set(cacheKey, JSON.stringify(owners));
  }

  private async _getCacheBalance(
    blockNumber: number,
  ): Promise<WalletEthBalance | null> {
    const cacheKey = `balance:${blockNumber}`;
    const balance = await this.redisService.getClient().get(cacheKey);
    return balance
      ? {
          blockNumber,
          owners: JSON.parse(balance),
        }
      : null;
  }

  private async _getBalanceAllOwners(
    distinctOwnersArray: string[],
    blockNumber: number,
  ) {
    const MAX_OWNERS_PER_CHUNK = 500;
    const balances = [];
    const blockHex = `0x${blockNumber.toString(16)}`;

    // Split owners into chunks of maximum 500 owners
    const ownerChunks = [];
    for (let i = 0; i < distinctOwnersArray.length; i += MAX_OWNERS_PER_CHUNK) {
      ownerChunks.push(distinctOwnersArray.slice(i, i + MAX_OWNERS_PER_CHUNK));
    }

    console.log(
      `Processing ${ownerChunks.length} chunks, max ${MAX_OWNERS_PER_CHUNK} owners per chunk`,
    );

    // Process each chunk of 500 owners
    for (let chunkIndex = 0; chunkIndex < ownerChunks.length; chunkIndex++) {
      const currentChunk = ownerChunks[chunkIndex];
      console.log(
        `Processing chunk ${chunkIndex + 1}/${ownerChunks.length} with ${
          currentChunk.length
        } owners`,
      );

      // Process current chunk with parallel requests + Promise.allSettled
      for (let i = 0; i < currentChunk.length; i += this.BATCH_SIZE) {
        const batch = currentChunk.slice(i, i + this.BATCH_SIZE);
        let retry = 0;
        const maxRetries = 3; // Reduced for individual batches since we have overall retry

        while (retry <= maxRetries) {
          try {
            console.log(
              `Chunk ${chunkIndex + 1}/${
                ownerChunks.length
              } - Processing batch ${
                Math.floor(i / this.BATCH_SIZE) + 1
              } of ${Math.ceil(currentChunk.length / this.BATCH_SIZE)}`,
            );

            const balancePromises = batch.map(async (address) => {
              try {
                const balance = await this.web3Instance.eth.getBalance(
                  address,
                  blockHex,
                );
                return {
                  id: address,
                  result: balance,
                  success: true,
                };
              } catch (error) {
                console.warn(
                  `Failed to get balance for ${address}:`,
                  error.message,
                );
                return {
                  id: address,
                  result: '0x0',
                  success: false,
                  error: error.message,
                };
              }
            });

            const batchResults = await Promise.allSettled(balancePromises);

            batchResults.forEach((result) => {
              if (result.status === 'fulfilled') {
                balances.push(result.value);
              } else {
                console.error('Unexpected promise rejection:', result.reason);
                balances.push({
                  id: 'unknown',
                  result: '0x0',
                  success: false,
                  error: 'Promise rejected',
                });
              }
            });

            break;
          } catch (error) {
            console.log(
              `Chunk ${chunkIndex + 1} Batch error (attempt ${retry + 1}/${
                maxRetries + 1
              }):`,
              error.message,
            );
            retry++;
            if (retry > maxRetries) {
              // Don't throw here, let the overall retry handle it
              console.error(
                `Batch failed after ${maxRetries + 1} attempts, continuing...`,
              );
              break;
            }
            await sleep(Math.min(1000 * Math.pow(2, retry), 5000));
          }
        }

        // Rate limiting between batches in the same chunk
        if (i + this.BATCH_SIZE < currentChunk.length) {
          await sleep(100);
        }
      }

      // Rate limiting between chunks large
      if (chunkIndex + 1 < ownerChunks.length) {
        await sleep(500);
        console.log(
          `Completed chunk ${chunkIndex + 1}/${
            ownerChunks.length
          }, moving to next chunk...`,
        );
      }
    }

    console.log(
      `Completed processing all ${ownerChunks.length} chunks, total balances: ${balances.length}`,
    );

    const ownerBalances = new Map<string, string>();

    balances.forEach((balance) => {
      // Only add successful results to the map
      if (balance.result && balance.result !== '0x0' && balance.success) {
        try {
          const weiValue =
            typeof balance.result === 'bigint'
              ? balance.result.toString()
              : balance.result;
          const ethBalance = this.web3Instance.utils.fromWei(weiValue, 'ether');
          ownerBalances.set(balance.id, ethBalance);
        } catch (error) {
          console.warn(
            `Failed to convert balance for ${balance.id}:`,
            balance.result,
            error.message,
          );
        }
      } else if (balance.success) {
        // If successful but balance is 0, still add to map
        ownerBalances.set(balance.id, '0');
      }
      // Don't add failed requests to the map, let retry mechanism handle them
    });

    return ownerBalances;
  }
}
