/** Numeric payload types from ProtoOAPayloadType / ProtoPayloadType. */
export const PayloadType = {
  HEARTBEAT_EVENT: 51,
  APPLICATION_AUTH_REQ: 2100,
  APPLICATION_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,
  ASSET_LIST_REQ: 2112,
  ASSET_LIST_RES: 2113,
  SYMBOLS_LIST_REQ: 2114,
  SYMBOLS_LIST_RES: 2115,
  SYMBOL_BY_ID_REQ: 2116,
  SYMBOL_BY_ID_RES: 2117,
  TRADER_REQ: 2121,
  TRADER_RES: 2122,
  DEAL_LIST_REQ: 2133,
  DEAL_LIST_RES: 2134,
  ERROR_RES: 2142,
  GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ: 2149,
  GET_ACCOUNTS_BY_ACCESS_TOKEN_RES: 2150,
} as const;

export const TradeSide = { BUY: 1, SELL: 2 } as const;
export const DealStatus = { FILLED: 2, PARTIALLY_FILLED: 3 } as const;

export const ENDPOINTS = {
  live: "wss://live.ctraderapi.com:5036",
  demo: "wss://demo.ctraderapi.com:5036",
} as const;

export interface Envelope<T = Record<string, unknown>> {
  clientMsgId?: string;
  payloadType: number;
  payload: T;
}

export interface ProtoDeal {
  dealId: number;
  orderId: number;
  positionId: number;
  volume: number;
  filledVolume: number;
  symbolId: number;
  createTimestamp: number;
  executionTimestamp: number;
  executionPrice?: number;
  tradeSide: number;
  dealStatus: number;
  commission?: number;
  moneyDigits?: number;
  closePositionDetail?: {
    entryPrice: number;
    grossProfit: number;
    swap: number;
    commission: number;
    balance: number;
    closedVolume?: number;
    moneyDigits?: number;
  };
}

export interface ProtoCtidTraderAccount {
  ctidTraderAccountId: number;
  isLive?: boolean;
  traderLogin?: number;
  brokerTitleShort?: string;
}

export interface ProtoTrader {
  ctidTraderAccountId: number;
  balance: number;
  moneyDigits?: number;
  depositAssetId: number;
  traderLogin?: number;
  brokerName?: string;
  registrationTimestamp?: number;
}

export interface ProtoSymbol {
  symbolId: number;
  digits: number;
  pipPosition: number;
  lotSize?: number;
}

export interface ProtoLightSymbol {
  symbolId: number;
  symbolName?: string;
}

export interface ProtoAsset {
  assetId: number;
  name: string;
  displayName?: string;
  digits?: number;
}
