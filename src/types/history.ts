import type { SignedOowaTransfer } from "@/types/wallet";
import type { InvestmentPayout, InvestmentPosition } from "@/types/investment";

export type TransactionDirection = "outgoing" | "incoming" | "self";

export type ActivityKindFilter = "all" | "transfer" | "payment" | "investment" | "reward";

export type TransactionEntryKind =
  | "transfer_out"
  | "transfer_in"
  | "payment_out"
  | "payment_merchant"
  | "payment_referral_level1"
  | "payment_referral_level2"
  | "investment_deposit"
  | "investment_payout"
  | "self_transfer";

export type TransactionStatus =
  | "broadcasted"
  | "confirmed"
  | "broadcast_failed"
  | "not_found"
  | "failed";

export interface WalletTransactionRecord {
  id: string;
  walletAddress: string;
  txhash: string;
  direction: TransactionDirection;
  entryKind: TransactionEntryKind;
  network: string;
  txType: string;
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  amountRaw: string;
  amountDisplay: string;
  chainTimestamp: string | null;
  blockHeight: number | null;
  status: TransactionStatus;
  publicKey: string | null;
  broadcastResponse: unknown;
  chainResponse: unknown;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface WalletRecipientRecord {
  id: string;
  walletAddress: string;
  recipientAddress: string;
  network: string;
  label: string | null;
  memo: string | null;
  sendCount: number;
  lastSentAt: string | null;
  lastTxhash: string | null;
  isFavorite: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveTransactionRequest {
  walletAddress: string;
  direction: TransactionDirection;
  signedPayload: SignedOowaTransfer;
  broadcastResponse: unknown;
  trackRecipient?: boolean;
}

export interface SaveTransactionResponse {
  transaction: WalletTransactionRecord;
  recipients: WalletRecipientRecord[];
}

export interface WalletActivityPaymentRecord extends PaymentOrderRecord {
  merchantName: string | null;
  transfers: PaymentTransferRecord[];
}

export type WalletActivityItem =
  | {
      id: string;
      kind: "transaction";
      direction: TransactionDirection;
      sortTimestamp: string;
      createdAt: string;
      status: TransactionStatus;
      transaction: WalletTransactionRecord;
    }
  | {
      id: string;
      kind: "payment";
      direction: "outgoing";
      sortTimestamp: string;
      createdAt: string;
      status: string;
      payment: WalletActivityPaymentRecord;
    };

export interface WalletActivityResponse {
  activity: WalletActivityItem[];
  total: number;
  page: number;
  limit: number;
}

export interface WalletRecipientsResponse {
  recipients: WalletRecipientRecord[];
}

export type PaymentTransferRole =
  | "recipient"
  | "merchant"
  | "referrer_level1"
  | "referrer_level2";

export interface PaymentQuoteTransfer {
  role: PaymentTransferRole;
  toWalletAddress: string;
  amountRaw: string;
  amountDisplay: string;
}

export interface PaymentQuoteRequest {
  payerWalletAddress: string;
  toWalletAddress: string;
  amountRaw: string;
}

export interface PaymentQuoteResponse {
  isMerchantPayment: boolean;
  merchantWalletAddress: string | null;
  merchantName: string | null;
  totalAmountRaw: string;
  totalAmountDisplay: string;
  referrerLevel1WalletAddress: string | null;
  referrerLevel2WalletAddress: string | null;
  transfers: PaymentQuoteTransfer[];
}

export interface PaymentOrderRecord {
  id: string;
  paymentType: "standard" | "merchant";
  payerWalletAddress: string;
  merchantWalletAddress: string;
  totalAmountRaw: string;
  totalAmountDisplay: string;
  merchantAmountRaw: string;
  referrerLevel1AmountRaw: string;
  referrerLevel2AmountRaw: string;
  referrerLevel1WalletAddress: string | null;
  referrerLevel2WalletAddress: string | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PaymentTransferRecord {
  id: string;
  paymentOrderId: string;
  transferRole: PaymentTransferRole;
  fromWalletAddress: string;
  toWalletAddress: string;
  amountRaw: string;
  amountDisplay: string;
  txhash: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface PaymentOrderCreateResponse {
  paymentOrder: PaymentOrderRecord;
  transfers: PaymentTransferRecord[];
  quote: PaymentQuoteResponse;
}

export interface PaymentTransferBroadcastedResponse {
  paymentOrder: PaymentOrderRecord | null;
  paymentTransfer: PaymentTransferRecord;
  transaction: WalletTransactionRecord;
  recipients: WalletRecipientRecord[];
}

export interface PaymentTransferFailedResponse {
  paymentOrder: PaymentOrderRecord | null;
  transfers: PaymentTransferRecord[];
}

export interface ExecutePaymentResponse {
  ok: boolean;
  userMessage: string;
  hadFailure: boolean;
  paymentOrder: PaymentOrderRecord | null;
  transfers: PaymentTransferRecord[];
  quote: PaymentQuoteResponse;
  recipients: WalletRecipientRecord[];
  results: Array<{
    role: PaymentTransferRole;
    toWalletAddress: string;
    amountRaw: string;
    amountDisplay: string;
    txhash: string;
  }>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export interface AdminPaymentsResponse extends PaginationMeta {
  payments: Array<
    PaymentOrderRecord & {
      transfers: PaymentTransferRecord[];
    }
  >;
}

export interface AdminMerchantProfilesResponse extends PaginationMeta {
  profiles: import("./auth").MerchantProfile[];
}

export interface AdminMerchantChangeRequestsResponse extends PaginationMeta {
  changeRequests: import("./auth").MerchantProfileChangeRequest[];
}

export interface AdminUserRecord {
  id: string;
  loginId: string;
  phone: string;
  name: string;
  status: "active" | "disabled" | "deleted";
  isMerchant: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  wallet: {
    id: string;
    address: string;
    publicKey: string;
    mnemonicAvailable: boolean;
    walletSource: "imported" | "generated";
  };
  merchantProfileStatus: "draft" | "pending" | "approved" | "denied" | null;
  merchantName: string | null;
  transactionCount: number;
  recipientCount: number;
  paymentCount: number;
  investmentCount: number;
  activeInvestmentCount: number;
}

export interface AdminUsersResponse extends PaginationMeta {
  users: AdminUserRecord[];
}

export interface AdminUserDetailResponse {
  user: AdminUserRecord;
  referrerWalletAddress: string | null;
  referrerLevel2WalletAddress: string | null;
  merchantProfile: import("./auth").MerchantProfile | null;
  latestTransactions: WalletTransactionRecord[];
  investments: import("./investment").InvestmentPosition[];
}

export interface AdminInvestmentRecord extends InvestmentPosition {
  adminStatus: "active" | "completed" | "payout_failed";
  user: {
    id: string;
    loginId: string;
    name: string;
    phone: string;
  };
  latestPayout: InvestmentPayout | null;
}

export interface AdminInvestmentSummaryResponse {
  activeCount: number;
  completedCount: number;
  failedCount: number;
  principalTotalRaw: string;
  principalTotalDisplay: string;
  accruedRewardTotalRaw: string;
  accruedRewardTotalDisplay: string;
  totalReturnTotalRaw: string;
  totalReturnTotalDisplay: string;
}

export interface AdminInvestmentsResponse extends PaginationMeta {
  investments: AdminInvestmentRecord[];
}
