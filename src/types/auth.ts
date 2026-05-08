export interface AuthUser {
  id: string;
  loginId: string;
  phone: string;
  name: string;
  status: string;
  isMerchant: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthWallet {
  id: string;
  address: string;
  publicKey: string;
  mnemonicAvailable: boolean;
  walletSource: "imported" | "generated";
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  wallet: AuthWallet;
  merchantProfile: MerchantProfile | null;
  merchantProfileChangeRequest: MerchantProfileChangeRequest | null;
}

export interface RegisterRequest {
  loginId: string;
  password: string;
  phone: string;
  name: string;
  isMerchant?: boolean;
  merchantName?: string;
  referrerWalletAddress?: string;
  walletMode: "imported" | "generated";
  mnemonic?: string;
  wallet?: {
    address: string;
    publicKey: string;
    privateKey: string;
  };
}

export interface LoginRequest {
  loginId: string;
  password: string;
}

export interface RevealMnemonicResponse {
  mnemonic: string;
}

export interface MerchantProfile {
  walletAddress: string;
  userId: string;
  merchantName: string | null;
  category: string | null;
  logoUrl: string | null;
  postalCode: string | null;
  addressMain: string | null;
  addressDetail: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  description: string | null;
  status: "draft" | "pending" | "approved" | "denied";
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface MerchantProfileChangeRequest {
  walletAddress: string;
  userId: string;
  merchantName: string | null;
  category: string | null;
  logoUrl: string | null;
  postalCode: string | null;
  addressMain: string | null;
  addressDetail: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  description: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}
