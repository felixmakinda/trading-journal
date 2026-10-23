export type Side = "buy" | "sell";
export type TradeStatus = "open" | "closed";
export type TradeSource = "ctrader" | "manual" | "import";

/** A single broker execution, normalised from whatever the broker sends. */
export interface Deal {
  dealId: string;
  positionId: string;
  symbol: string;
  side: Side;
  /** Executed volume in base-currency units (1 standard lot = 100,000 for FX). */
  volume: number;
  price: number;
  /** ISO 8601, UTC. */
  time: string;
  /** Commission charged on this execution, negative when it is a cost. */
  commission: number;
  /** Present only on deals that close (part of) a position. */
  close?: {
    entryPrice: number;
    grossProfit: number;
    swap: number;
    closedVolume: number;
  };
}

/** A round-trip position, which is what the journal calls a trade. */
export interface Trade {
  id: string;
  symbol: string;
  side: Side;
  status: TradeStatus;
  volume: number;
  openTime: string;
  closeTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
  setup?: string | null;
  tags?: string[];
  followedPlan?: boolean | null;
}

export interface ClosedTrade extends Trade {
  status: "closed";
  closeTime: string;
  exitPrice: number;
}

export function isClosed(trade: Trade): trade is ClosedTrade {
  return trade.status === "closed" && trade.closeTime !== null && trade.exitPrice !== null;
}

export function direction(side: Side): 1 | -1 {
  return side === "buy" ? 1 : -1;
}
