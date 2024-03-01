export interface QuoteReq {
  chainIdNumb: number;
  tokenInStr: string;
  tokenOutStr: string;
  amountStr: string;
  exactIn?: boolean;
  exactOut?: boolean;
  protocolsStr: string;
};
