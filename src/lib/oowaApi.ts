import { OOWA_TOKEN, SASEUL_GOLD_API_BASE_URL } from "@/constants/oowa";
import { toRawTokenAmount } from "@/lib/amount";
import { isSaseulAddress, signTransfer } from "@/lib/saseulCrypto";
import type {
  OowaTransferTransaction,
  SignedOowaTransfer,
  Wallet,
} from "@/types/wallet";

export const getSaseulTimestamp = async (): Promise<number> => {
  const response = await fetch(`${SASEUL_GOLD_API_BASE_URL}/api/ts`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch timestamp: ${response.status}`);
  }

  return response.json();
};

export const getOowaBalance = async (address: string): Promise<string> => {
  if (!isSaseulAddress(address)) {
    throw new Error("Invalid Saseul Gold address");
  }

  const response = await fetch(`${SASEUL_GOLD_API_BASE_URL}/rawrequest/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "BalanceOf",
      token_address: OOWA_TOKEN.tokenAddress,
      address,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OOWA balance: ${response.status}`);
  }

  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    return text;
  }
};

export const buildOowaTransfer = async ({
  wallet,
  toAddress,
  amount,
}: {
  wallet: Wallet;
  toAddress: string;
  amount: string;
}): Promise<SignedOowaTransfer> => {
  const to = toAddress.trim().toLowerCase();
  if (!isSaseulAddress(to)) {
    throw new Error("Recipient address must be 44 hex characters");
  }

  const rawAmount = toRawTokenAmount(amount, OOWA_TOKEN.decimals);
  return buildOowaTransferFromRaw({
    wallet,
    toAddress: to,
    amountRaw: rawAmount,
  });
};

export const buildOowaTransferFromRaw = async ({
  wallet,
  toAddress,
  amountRaw,
}: {
  wallet: Wallet;
  toAddress: string;
  amountRaw: string;
}): Promise<SignedOowaTransfer> => {
  const to = toAddress.trim().toLowerCase();
  if (!isSaseulAddress(to)) {
    throw new Error("Recipient address must be 44 hex characters");
  }

  const timestamp = await getSaseulTimestamp();
  const transaction: OowaTransferTransaction = {
    type: "Transfer",
    token_address: OOWA_TOKEN.tokenAddress,
    to,
    amount: amountRaw,
    timestamp,
    from: wallet.address,
  };

  return signTransfer(transaction, wallet);
};

export const broadcastOowaTransfer = async (
  payload: SignedOowaTransfer,
): Promise<unknown> => {
  const response = await fetch(`${SASEUL_GOLD_API_BASE_URL}/broadcast/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: unknown = text;

  try {
    data = JSON.parse(text);
  } catch {
    // Saseul endpoints sometimes return plain text. Keep the raw body.
  }

  if (!response.ok) {
    throw new Error(
      `Broadcast failed with ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`,
    );
  }

  return data;
};
