import type { WalletTransactionRecord } from "@/types/history";

export interface InvestmentProduct {
  productId: string;
  name: string;
  dailyRateBasisPoints: number;
  dailyRatePercent: number;
  capTotalBasisPoints: number;
  capTotalPercent: number;
  capRewardBasisPoints: number;
  capRewardPercent: number;
  maxRewardDays: number;
  poolWalletAddress: string | null;
  investmentAvailable: boolean;
}

export interface InvestmentPosition {
  id: string;
  userId: string;
  walletId: string;
  walletAddress: string;
  principalRaw: string;
  principalDisplay: string;
  dailyRateBasisPoints: number;
  capTotalBasisPoints: number;
  depositTxhash: string;
  payoutTxhash: string | null;
  status: "active" | "completed";
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  finalRewardRaw: string | null;
  finalReturnRaw: string | null;
  accruedDays: number;
  accruedRateBasisPoints: number;
  accruedRatePercent: number;
  dailyRewardRaw: string;
  dailyRewardDisplay: string;
  accruedRewardRaw: string;
  accruedRewardDisplay: string;
  totalReturnRaw: string;
  totalReturnDisplay: string;
  maxRewardRaw: string;
  maxRewardDisplay: string;
  maxReturnRaw: string;
  maxReturnDisplay: string;
  remainingRewardRaw: string;
  remainingRewardDisplay: string;
  remainingDays: number;
  capReached: boolean;
}

export interface InvestmentPayout {
  id: string;
  positionId: string;
  payoutType: string;
  principalRaw: string;
  rewardRaw: string;
  totalRaw: string;
  txhash: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentPositionsResponse {
  product: InvestmentProduct;
  positions: InvestmentPosition[];
  total: number;
  page: number;
  limit: number;
}

export interface StartInvestmentResponse {
  ok: boolean;
  userMessage: string;
  product: InvestmentProduct;
  position: InvestmentPosition;
  transaction: WalletTransactionRecord;
}

export interface StopInvestmentResponse {
  ok: boolean;
  userMessage: string;
  position: InvestmentPosition;
  payout: InvestmentPayout;
  transaction: WalletTransactionRecord;
}
