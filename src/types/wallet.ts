export interface Wallet {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface OowaTransferTransaction {
  type: "Transfer";
  token_address: string;
  to: string;
  amount: string;
  timestamp: number;
  from: string;
}

export interface SignedOowaTransfer {
  public_key: string;
  signature: string;
  transaction: OowaTransferTransaction;
}
