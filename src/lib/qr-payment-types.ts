import { isSaseulAddress } from "@/lib/saseulCrypto";

export interface OowaQrPaymentData {
  version: "1.0";
  type: "OOWA_TRANSFER";
  address: string;
  amount?: string;
  timestamp: number;
  tokenSymbol: "OOWA";
}

export const encodeQRPayment = (address: string, amount?: string): string => {
  const payload: OowaQrPaymentData = {
    version: "1.0",
    type: "OOWA_TRANSFER",
    address: address.trim().toLowerCase(),
    timestamp: Date.now(),
    tokenSymbol: "OOWA",
  };

  if (amount && amount.trim()) {
    payload.amount = amount.trim();
  }

  return JSON.stringify(payload);
};

export const decodeQRPayment = (qrData: string): OowaQrPaymentData | null => {
  try {
    const payload = JSON.parse(qrData) as OowaQrPaymentData;
    if (payload.version !== "1.0" || payload.type !== "OOWA_TRANSFER") {
      return null;
    }
    if (!isSaseulAddress(payload.address)) {
      return null;
    }
    if (payload.amount) {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }
    }

    return {
      ...payload,
      address: payload.address.trim().toLowerCase(),
      amount: payload.amount?.trim(),
    };
  } catch {
    return null;
  }
};
