import Decimal from "decimal.js";

export const toRawTokenAmount = (amount: string, decimals: number): string => {
  const normalized = amount.trim();
  if (!normalized) {
    throw new Error("Amount is required");
  }

  const decimal = new Decimal(normalized);
  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new Error("Amount must be greater than 0");
  }

  if (decimal.decimalPlaces() > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimal places`);
  }

  return decimal.mul(new Decimal(10).pow(decimals)).toFixed(0);
};

export const formatRawTokenAmount = (amount: string, decimals: number): string => {
  if (!amount) {
    return "0";
  }

  return new Decimal(amount).div(new Decimal(10).pow(decimals)).toString();
};

export const trimTokenAmount = (amount: string): string => {
  if (!amount.includes(".")) {
    return amount;
  }

  return amount.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
};

export const compareRawTokenAmounts = (
  left: string,
  right: string,
): number => new Decimal(left || "0").cmp(new Decimal(right || "0"));
