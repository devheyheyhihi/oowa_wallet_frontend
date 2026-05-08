import CryptoJS from "crypto-js";
import nacl from "tweetnacl";
import type {
  OowaTransferTransaction,
  SignedOowaTransfer,
  Wallet,
} from "@/types/wallet";

const HEX_TIME_SIZE = 14;
const PRIVATE_KEY_SIZE = 64;

type Hashable = string | number | object;

const stringToUnicode = (str: string): string => {
  if (!str) {
    return "";
  }

  return Array.prototype.map
    .call(str, (char: string) => {
      const code = char.charCodeAt(0).toString(16);
      return code.length > 2 ? "\\u" + code : char;
    })
    .join("");
};

const toString = (input: Hashable): string => {
  const value =
    typeof input === "object" && input !== null
      ? JSON.stringify(input)
      : String(input);

  return stringToUnicode(value.replace(/\//g, "\\/"));
};

const cryptoHash = (
  algo: keyof typeof CryptoJS,
  stringData: string,
): string => {
  const hashFunction = CryptoJS[algo] as (
    data: string,
  ) => CryptoJS.lib.WordArray;

  return hashFunction(stringData).toString(CryptoJS.enc.Hex);
};

const hash = (obj: Hashable): string => cryptoHash("SHA256", toString(obj));

const hextime = (timestamp: number): string =>
  timestamp.toString(16).padStart(HEX_TIME_SIZE, "0").slice(0, HEX_TIME_SIZE);

const timeHash = (obj: Hashable, timestamp: number): string =>
  hextime(timestamp) + hash(obj);

const txHash = (tx: OowaTransferTransaction): string =>
  timeHash(hash(tx), tx.timestamp);

const checksum = (h: string): string => hash(hash(h)).slice(0, 4);

const shortHash = (obj: Hashable): string => cryptoHash("RIPEMD160", hash(obj));

const idHash = (obj: Hashable): string => {
  const short = shortHash(obj);
  return short + checksum(short);
};

const stringToByte = (str: string): Uint8Array => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
};

const hexToByte = (hex: string): Uint8Array => {
  if (!hex) {
    return new Uint8Array();
  }

  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
};

const byteToHex = (bytes: Uint8Array): string =>
  Array.prototype.map
    .call(bytes, (byte: number) => ("0" + (byte & 0xff).toString(16)).slice(-2))
    .join("")
    .toLowerCase();

export const generateWallet = (): Wallet => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return deriveWalletFromPrivateKey(byteToHex(bytes));
};

export const isPrivateKey = (privateKey: string): boolean =>
  /^[a-fA-F0-9]{64}$/.test(privateKey.trim());

export const isSaseulAddress = (address: string): boolean =>
  /^[a-fA-F0-9]{44}$/.test(address.trim());

export const getPublicKey = (privateKey: string): string =>
  byteToHex(nacl.sign.keyPair.fromSeed(hexToByte(privateKey)).publicKey);

export const getAddress = (publicKey: string): string => idHash(publicKey);

export const deriveWalletFromPrivateKey = (privateKeyInput: string): Wallet => {
  const privateKey = privateKeyInput.trim().toLowerCase();
  if (!isPrivateKey(privateKey)) {
    throw new Error(`Private key must be ${PRIVATE_KEY_SIZE} hex characters`);
  }

  const publicKey = getPublicKey(privateKey);
  const address = getAddress(publicKey);

  return {
    privateKey,
    publicKey,
    address,
  };
};

export const signTransfer = (
  transaction: OowaTransferTransaction,
  wallet: Wallet,
): SignedOowaTransfer => {
  const signature = byteToHex(
    nacl.sign.detached(
      stringToByte(toString(txHash(transaction))),
      hexToByte(wallet.privateKey + wallet.publicKey),
    ),
  );

  return {
    public_key: wallet.publicKey,
    signature,
    transaction,
  };
};
