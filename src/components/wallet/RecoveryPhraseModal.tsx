"use client";

import { useEffect, useRef, useState } from "react";
import { restoreWalletFromMnemonic } from "@/lib/walletImport";
import type { Wallet } from "@/types/wallet";

type MnemonicLength = 12 | 15 | 24;

interface RecoveryPhraseModalProps {
  onBack: () => void;
  onConnect: (wallet: Wallet) => void;
}

export function RecoveryPhraseModal({
  onBack,
  onConnect,
}: RecoveryPhraseModalProps) {
  const [mnemonicLength, setMnemonicLength] = useState<MnemonicLength>(12);
  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, mnemonicLength);
    setWords(Array(mnemonicLength).fill(""));
  }, [mnemonicLength]);

  const setWord = (index: number, value: string) => {
    setError("");
    setWords((prev) => {
      const next = [...prev];
      next[index] = value.toLowerCase().trim();
      return next;
    });
  };

  const applyPastedText = (text: string) => {
    const pastedWords = text
      .replaceAll('"', "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const detectedLength = [12, 15, 24].includes(pastedWords.length)
      ? (pastedWords.length as MnemonicLength)
      : mnemonicLength;

    if (detectedLength !== mnemonicLength) {
      setMnemonicLength(detectedLength);
    }

    setWords(
      pastedWords
        .slice(0, detectedLength)
        .concat(Array(Math.max(detectedLength - pastedWords.length, 0)).fill("")),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const wallet = await restoreWalletFromMnemonic(words.join(" "));
      onConnect(wallet);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore recovery phrase",
      );
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = words.length === mnemonicLength && words.every(Boolean);

  return (
    <div className="modal-panel wide">
      <div className="modal-header">
        <div>
          <h2>Recovery phrase</h2>
          <p>Enter or paste your Saseul Gold recovery phrase.</p>
        </div>
        <button className="icon-button" type="button" onClick={onBack}>
          Back
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="segmented">
          {[12, 15, 24].map((length) => (
            <button
              key={length}
              type="button"
              className={mnemonicLength === length ? "active" : ""}
              onClick={() => setMnemonicLength(length as MnemonicLength)}
            >
              {length}
            </button>
          ))}
        </div>

        <div className="mnemonic-grid">
          {words.map((word, index) => (
            <label key={index} className="word-field">
              <span>{index + 1}</span>
              <input
                value={word}
                onChange={(event) => setWord(index, event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  applyPastedText(event.clipboardData.getData("text"));
                }}
                onKeyDown={(event) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    word &&
                    index < mnemonicLength - 1
                  ) {
                    event.preventDefault();
                    inputRefs.current[index + 1]?.focus();
                  }
                  if (event.key === "Backspace" && !word && index > 0) {
                    inputRefs.current[index - 1]?.focus();
                  }
                }}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                autoComplete="off"
              />
            </label>
          ))}
        </div>

        <p className="helper-text">
          You can paste the entire phrase into any word field.
        </p>

        {error && <p className="status error">{error}</p>}

        <button className="button full-width" type="submit" disabled={!canSubmit || loading}>
          {loading ? "Verifying..." : "Connect wallet"}
        </button>
      </form>
    </div>
  );
}
