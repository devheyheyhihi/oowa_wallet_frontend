import CryptoJS from "crypto-js";
import type { Wallet } from "@/types/wallet";
import { deriveWalletFromPrivateKey } from "@/lib/saseulCrypto";

const ENCRYPTION_KEY = "sasuel_gold_secret_v1";

type ImportedWalletShape = {
  private_key?: string;
  privateKey?: string;
  public_key?: string;
  publicKey?: string;
  address?: string;
};

type ImportedKeyFileShape = {
  wallet?: ImportedWalletShape;
  recipients?: unknown[];
  timestamp?: number;
};

const wordArrayFromBytes = (bytes: Uint8Array): CryptoJS.lib.WordArray => {
  const words: number[] = [];

  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }

  return CryptoJS.lib.WordArray.create(words, bytes.length);
};

const normalizeMnemonic = (mnemonic: string): string =>
  mnemonic.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeImportedWallet = (input: ImportedWalletShape): Wallet => {
  const privateKey = input.private_key ?? input.privateKey;

  if (!privateKey) {
    throw new Error("Keyfile does not contain a private key");
  }

  const wallet = deriveWalletFromPrivateKey(privateKey);
  const importedAddress = input.address?.trim().toLowerCase();

  if (importedAddress && importedAddress !== wallet.address) {
    throw new Error("Keyfile address does not match the private key");
  }

  return wallet;
};

const parseImportedWallet = (parsed: ImportedKeyFileShape | ImportedWalletShape) => {
  if ("wallet" in parsed && parsed.wallet) {
    return parsed.wallet;
  }

  return parsed as ImportedWalletShape;
};

export const importWalletFromKeyFile = async (file: File): Promise<Wallet> => {
  if (!file.name.endsWith(".sgk")) {
    throw new Error("Only .sgk keyfiles are supported");
  }

  const encryptedWallet = await file.text();
  const decryptedWallet = CryptoJS.AES.decrypt(
    encryptedWallet,
    ENCRYPTION_KEY,
  ).toString(CryptoJS.enc.Utf8);

  if (!decryptedWallet) {
    throw new Error("Failed to decrypt keyfile");
  }

  const parsed = JSON.parse(decryptedWallet) as
    | ImportedKeyFileShape
    | ImportedWalletShape;

  return normalizeImportedWallet(parseImportedWallet(parsed));
};

export const restoreWalletFromMnemonic = async (
  mnemonic: string,
): Promise<Wallet> => {
  const normalized = normalizeMnemonic(mnemonic);
  const { Buffer } = await import("buffer");

  if (!("Buffer" in globalThis)) {
    (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer =
      Buffer;
  }

  const bip39 = await import("bip39");

  if (!bip39.validateMnemonic(normalized)) {
    throw new Error("Invalid recovery phrase");
  }

  const seed = bip39.mnemonicToSeedSync(normalized);
  const privateKey = CryptoJS.SHA256(
    wordArrayFromBytes(new Uint8Array(seed)),
  ).toString(CryptoJS.enc.Hex);

  return deriveWalletFromPrivateKey(privateKey);
};

export const createWalletWithMnemonic = async (): Promise<{
  wallet: Wallet;
  mnemonic: string;
}> => {
  const bip39 = await import("bip39");
  const mnemonic = bip39.generateMnemonic(128);
  const wallet = await restoreWalletFromMnemonic(mnemonic);

  return {
    wallet,
    mnemonic,
  };
};
