import { JsonRpcProvider } from '@ethersproject/providers';
import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId, Currency, Token, TradeType } from '@uniswap/sdk-core';
import { Request, Response } from 'express';
import _ from 'lodash';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  CachingGasStationProvider,
  CachingTokenListProvider,
  CachingTokenProviderWithFallback,
  CachingV3PoolProvider,
  EIP1559GasPriceProvider,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  GasPrice,
  ID_TO_CHAIN_ID,
  IRouter,
  ITokenProvider,
  MapWithLowerCaseKey,
  nativeOnChain,
  NodeJSCache,
  parseAmount,
  // routeAmountsToString,
  // RouteWithValidQuote,
  // SimulationStatus,
  SwapRoute,
  TenderlySimulator,
  TokenPropertiesProvider,
  TokenProvider,
  UniswapMulticallProvider,
  V2PoolProvider,
  V3PoolProvider,
  // V3RouteWithValidQuote,
  // SwapType,
} from '../';
import { LegacyGasPriceProvider } from '../providers/legacy-gas-price-provider';
import { OnChainGasPriceProvider } from '../providers/on-chain-gas-price-provider';
import { PortionProvider } from '../providers/portion-provider';
import { OnChainTokenFeeFetcher } from '../providers/token-fee-fetcher';
import { NATIVE_NAMES_BY_ID, TO_PROTOCOL } from '../util';
import { QuoteReq } from './types';


export const testController = (_: Request, res: Response) => {
  res.json({message: 'ok'});
};


const ID_TO_PROVIDER = (id: ChainId): string => {
  switch (id) {
    case ChainId.MAINNET:
      return 'https://eth.llamarpc.com';
    case ChainId.BNB:
      return 'https://bsc-dataseed.bnbchain.org';
    default:
      return '';
  }
};

export const quoteController = async (req: Request<{}, {}, QuoteReq>, res: Response) => {
  try {
    const quoteReq: QuoteReq = req.body;
    console.log(quoteReq);

    const {
      chainIdNumb,
      tokenInStr,
      tokenOutStr,
      amountStr,
      exactIn,
      exactOut,
      protocolsStr
    } = quoteReq;

    // init
    let router: IRouter<any> | null = null;
    let tokenProvider: ITokenProvider | null = null;
    let blockNumber: number | null = null;
    let multicall2Provider: UniswapMulticallProvider | null = null;

    const chainId = ID_TO_CHAIN_ID(chainIdNumb);
    const chainProvider = ID_TO_PROVIDER(chainId);
    const provider = new JsonRpcProvider(chainProvider, chainId);

    blockNumber = await provider.getBlockNumber();

    const tokenCache = new NodeJSCache<Token>(
      new NodeCache({ stdTTL: 3600, useClones: false })
    );

    let tokenListProvider: CachingTokenListProvider = await CachingTokenListProvider.fromTokenList(
      chainId,
      DEFAULT_TOKEN_LIST,
      tokenCache
    );

    multicall2Provider = new UniswapMulticallProvider(chainId, provider);

    const tokenProviderOnChain = new TokenProvider(chainId, multicall2Provider);

    tokenProvider = new CachingTokenProviderWithFallback(
      chainId,
      tokenCache,
      tokenListProvider,
      tokenProviderOnChain
    );

    const gasPriceCache = new NodeJSCache<GasPrice>(
      new NodeCache({ stdTTL: 15, useClones: true })
    );

    const v3PoolProvider = new CachingV3PoolProvider(
      chainId,
      new V3PoolProvider(chainId, multicall2Provider),
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false }))
    );
    const tokenFeeFetcher = new OnChainTokenFeeFetcher(
      chainId,
      provider
    )
    const tokenPropertiesProvider = new TokenPropertiesProvider(
      chainId,
      new NodeJSCache(new NodeCache({ stdTTL: 360, useClones: false })),
      tokenFeeFetcher
    )
    const v2PoolProvider = new V2PoolProvider(chainId, multicall2Provider, tokenPropertiesProvider);

    const portionProvider = new PortionProvider();
    const tenderlySimulator = new TenderlySimulator(
      chainId,
      'http://api.tenderly.co',
      '', // process.env.TENDERLY_USER!,
      '', // process.env.TENDERLY_PROJECT!,
      '', // process.env.TENDERLY_ACCESS_KEY!,
      v2PoolProvider,
      v3PoolProvider,
      provider,
      portionProvider,
      { [ChainId.ARBITRUM_ONE]: 1 }
    );

    const ethEstimateGasSimulator = new EthEstimateGasSimulator(
      chainId,
      provider,
      v2PoolProvider,
      v3PoolProvider,
      portionProvider
    );

    const simulator = new FallbackTenderlySimulator(
      chainId,
      provider,
      portionProvider,
      tenderlySimulator,
      ethEstimateGasSimulator
    );

    router = new AlphaRouter({
      provider,
      chainId,
      multicall2Provider: multicall2Provider,
      gasPriceProvider: new CachingGasStationProvider(
        chainId,
        new OnChainGasPriceProvider(
          chainId,
          new EIP1559GasPriceProvider(provider),
          new LegacyGasPriceProvider(provider)
        ),
        gasPriceCache
      ),
      simulator,
    });


    if ((exactIn && exactOut) || (!exactIn && !exactOut)) {
      res.send('Must set either --exactIn or --exactOut.');
    }

    let protocols: Protocol[] = [];
    if (protocolsStr) {
      try {
        protocols = _.map(protocolsStr.split(','), (protocolStr) =>
          TO_PROTOCOL(protocolStr)
        );
      } catch (err) {
        res.send(
          `Protocols invalid. Valid options: ${Object.values(Protocol)}`
        );
      }
    }

    const tokenIn: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(tokenInStr)
      ? nativeOnChain(chainId)
      : (await tokenProvider.getTokens([tokenInStr])).getTokenByAddress(tokenInStr)!;

    const tokenOut: Currency = NATIVE_NAMES_BY_ID[chainId]!.includes(tokenOutStr)
      ? nativeOnChain(chainId)
      : (await tokenProvider.getTokens([tokenOutStr])).getTokenByAddress(tokenOutStr)!;

    const topN = 3;
    const topNTokenInOut = 2;
    const topNSecondHop = 2;
    const topNSecondHopForTokenAddress = new MapWithLowerCaseKey();
    const topNWithEachBaseToken = 2;
    const topNWithBaseToken = 6;
    const topNWithBaseTokenInSet = false;
    const topNDirectSwaps = 2;

    const maxSwapsPerPath = 3;
    const minSplits = 1;
    const maxSplits = 3;
    const distributionPercent = 5;
    const forceCrossProtocol = false;
    const forceMixedRoutes = false;
    const debugRouting = true;
    const enableFeeOnTransferFeeFetching = false;


    let swapRoutes: SwapRoute | null;
    if (exactIn) {
      const amountIn = parseAmount(amountStr, tokenIn);
      swapRoutes = await router.route(
        amountIn,
        tokenOut,
        TradeType.EXACT_INPUT,
        undefined,
        {
          blockNumber: blockNumber,
          v3PoolSelection: {
            topN,
            topNTokenInOut,
            topNSecondHop,
            topNSecondHopForTokenAddress,
            topNWithEachBaseToken,
            topNWithBaseToken,
            topNWithBaseTokenInSet,
            topNDirectSwaps,
          },
          maxSwapsPerPath,
          minSplits,
          maxSplits,
          distributionPercent,
          protocols,
          forceCrossProtocol,
          forceMixedRoutes,
          debugRouting,
          enableFeeOnTransferFeeFetching,
        }
      );
    } else {
      const amountOut = parseAmount(amountStr, tokenOut);
      swapRoutes = await router.route(
        amountOut,
        tokenIn,
        TradeType.EXACT_OUTPUT,
        undefined,
        {
          blockNumber: blockNumber - 10,
          v3PoolSelection: {
            topN,
            topNTokenInOut,
            topNSecondHop,
            topNSecondHopForTokenAddress,
            topNWithEachBaseToken,
            topNWithBaseToken,
            topNWithBaseTokenInSet,
            topNDirectSwaps,
          },
          maxSwapsPerPath,
          minSplits,
          maxSplits,
          distributionPercent,
          protocols,
          forceCrossProtocol,
          forceMixedRoutes,
          debugRouting,
          enableFeeOnTransferFeeFetching,
        }
      );
    }

    res.json(swapRoutes)

  } catch (error) {
    console.error(error);
    res.status(500).send('error')
  }
};
