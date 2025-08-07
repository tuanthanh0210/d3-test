# Wallet ETH Balance NFT

A NestJS application for tracking ETH balances of NFT owners at specific timestamps using blockchain crawling and caching mechanisms.

## Features

- 🔍 **NFT Transfer Tracking**: Crawl and store NFT transfer events from blockchain
- 💰 **ETH Balance Queries**: Get ETH balances of NFT owners at specific timestamps
- ⚡ **Redis Caching**: High-performance caching for historical balance data
- 🔄 **Batch Processing**: Efficient Web3 batch requests for multiple addresses
- 📊 **Historical Data**: Query balances at any point in blockchain history
- 🐳 **Docker Support**: Full containerized deployment

## Tech Stack

- **Backend**: NestJS, TypeScript
- **Database**: MySQL with TypeORM
- **Cache**: Redis
- **Blockchain**: Web3.js for Ethereum interaction
- **Process Management**: PM2
- **Containerization**: Docker & Docker Compose

## Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- Yarn package manager
- Ethereum RPC endpoint

## Quick Start

### 1. Environment Setup

Create `.env` file from example:

```bash
cp .env.example .env
```

Configure your environment variables:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=password
DB_DATABASE=wallet_eth_balance

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Blockchain
RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key
RPC_X_API_KEY=your-api-key
NFT_CONTRACT=0x...

# Application
APP_PORT=3000
APP_NAME=Wallet-ETH-Balance
APP_VERSION=v1
SAVE_BLOCK_NUMBER=20
```

### 2. Start Infrastructure

Run Docker Compose to start MySQL and Redis:

```bash
docker-compose up -d
```

This will start:

- MySQL database on port 3306
- Redis cache on port 6379

### 3. Database Migration

Run database migrations to create required tables:

```bash
yarn typeorm:migrate
```

This creates:

- `latest_block` table for tracking crawler progress
- `transfer` table for NFT transfer events

### 4. Start Application

Use Make command to start both backend and crawler:

```bash
make run
```

This will:

- Build the application
- Start the backend API server
- Start the NFT crawler process
- Set up PM2 process management

## API Endpoints

### Get ETH Balances

```http
GET /api/v1/wallet-eth-balance?timestamp=1640995200000
```

**Parameters:**

- `timestamp` (required): Unix timestamp in milliseconds

**Response:**

```json
{
  "code": 200,
  "data": {
    "blockNumber": 13916166,
    "owners": {
      "0x1234...": "1.5",
      "0x5678...": "0.25",
      "0x9abc...": "10.0"
    }
  }
}
```

### Swagger Documentation

Access API documentation at:

```
http://localhost:3000/api/v1/swagger
```

## Architecture

### Data Flow

1. **Crawler Process**:

   - Monitors blockchain for NFT transfer events
   - Stores transfer data and block timestamps in MySQL
   - Caches block-timestamp mappings in Redis

2. **Balance Query Process**:
   - Finds appropriate block number for given timestamp
   - Identifies current NFT owners at that block
   - Batch queries ETH balances via Web3 RPC
   - Caches results for frequently accessed data

### Database Schema

**transfer table:**

```sql
- id: Primary key
- tokenId: NFT token identifier
- from: Sender address
- to: Receiver address
- blockNumber: Block where transfer occurred
- blockTimestamp: Block timestamp
- txHash: Transaction hash
```

**latest_block table:**

```sql
- id: Primary key
- contractAddress: NFT contract address
- block: Latest processed block number
```

### Caching Strategy

- **Redis Sorted Sets**: Store block-timestamp mappings for O(log N) lookups
- **Balance Cache**: Cache ETH balances for blocks older than `SAVE_BLOCK_NUMBER`
- **Automatic Expiration**: TTL-based cache invalidation

## Development

### Available Scripts

```bash
# Development
yarn start:dev          # Start backend in watch mode
yarn console:dev        # Run crawler in development

# Production
yarn build              # Build application
yarn start:prod         # Start production backend
yarn console:prod       # Run production crawler

# Database
yarn typeorm:create     # Create new migration
yarn typeorm:migrate    # Run migrations
yarn typeorm:revert     # Revert last migration

# Testing
yarn test               # Run unit tests
yarn test:e2e           # Run e2e tests
yarn lint               # Lint code
```

### Project Structure

```
src/
├── configs/            # Configuration files
├── database/           # Database entities, migrations, repositories
├── modules/
│   ├── crawler/        # NFT transfer crawler
│   └── wallet-eth-balance/  # ETH balance service
├── shared/             # Shared utilities and helpers
├── main.ts             # Backend entry point
└── console.main.ts     # Crawler entry point
```

## Process Management

### PM2 Commands

```bash
# Start services
pm2 start app.json

# Monitor processes
pm2 status
pm2 monit

# View logs
pm2 logs wallet-eth-balance          # Backend logs
pm2 logs wallet-eth-balance-crawler  # Crawler logs

# Restart services
pm2 restart all
pm2 reload all

# Stop services
pm2 stop all
pm2 delete all
```

## Monitoring & Troubleshooting

### Health Checks

- **Backend**: `GET http://localhost:3000/api/v1/health`
- **Database**: Check MySQL connection on port 3306
- **Redis**: Check Redis connection on port 6379

### Common Issues

**Database Connection Failed:**

```bash
# Check if MySQL is running
docker-compose ps
# Restart database
docker-compose restart mysql
```

**RPC Rate Limiting:**

```bash
# Reduce batch size in WalletEthBalanceService
BATCH_SIZE = 50  # Lower value
```

**Memory Issues:**

```bash
# Check PM2 process memory
pm2 monit
# Restart if needed
pm2 restart all
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:

- Create an issue on GitHub
- Check existing documentation
- Review logs: `pm2 logs`

```

**Algorithm Used**: **
```
