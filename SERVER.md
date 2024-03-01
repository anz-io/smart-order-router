# Uniswap Smart Order Router

### Deploy

clone repo and switch to `express` branch

run:

```
npm install && npm run build
```

then, run:

```
npm run serve
```

### API

> POST http://localhost:3000/api/quote

Requst:

```json
{
  "chainIdNumb": 56,
  "tokenInStr": "0x55d398326f99059fF775485246999027B3197955",
  "tokenOutStr": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  "amountStr": "1",
  "exactIn": true,
  "protocolsStr": "v3"
}
```

Response:

```json
{
  "bestRoute": "[V3] 100.00% = USDT -- 0.01% [0x2C3c320D49019D4f9A92352e947c7e5AcFE47D68] --> USDC",
  "quote": "1.00",
  "quoteGasAdjusted": "0.84",
  "estimatedGasUsedQuoteToken": "0.156447",
  "estimatedGasUsedUSD": "0.156335",
  "estimatedGasUsed": "128000",
  "gasPriceWei": "3000000000",
  "blockNumber": 36601709,
  "totalTicks": "1"
}
```
