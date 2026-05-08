"use client";

import { useState } from "react";
import { KeyFileModal } from "@/components/wallet/KeyFileModal";
import { RecoveryPhraseModal } from "@/components/wallet/RecoveryPhraseModal";
import type { Wallet } from "@/types/wallet";

type ModalMode = "options" | "keyfile" | "recovery";

interface WalletConnectModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (wallet: Wallet) => void;
}

export function WalletConnectModal({
  open,
  onClose,
  onConnect,
}: WalletConnectModalProps) {
  const [mode, setMode] = useState<ModalMode>("options");

  if (!open) {
    return null;
  }

  const handleConnect = (wallet: Wallet) => {
    onConnect(wallet);
    setMode("options");
    onClose();
  };

  const close = () => {
    setMode("options");
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-shell">
        <button className="modal-close" type="button" onClick={close}>
          ×
        </button>

        {mode === "options" && (
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <h2>Connect your wallet</h2>
                <p>Choose a Saseul Gold wallet connection method.</p>
              </div>
            </div>

            <div className="wallet-options">
              <button
                className="wallet-option"
                type="button"
                onClick={() => setMode("recovery")}
              >
                <span className="option-icon">◇</span>
                <span>
                  <strong>Recovery phrase</strong>
                  <small>Restore with 12, 15, or 24 words</small>
                </span>
              </button>

              <button
                className="wallet-option"
                type="button"
                onClick={() => setMode("keyfile")}
              >
                <span className="option-icon">▣</span>
                <span>
                  <strong>Keyfile</strong>
                  <small>Import an encrypted .sgk wallet file</small>
                </span>
              </button>
            </div>
          </div>
        )}

        {mode === "keyfile" && (
          <KeyFileModal onBack={() => setMode("options")} onConnect={handleConnect} />
        )}

        {mode === "recovery" && (
          <RecoveryPhraseModal
            onBack={() => setMode("options")}
            onConnect={handleConnect}
          />
        )}
      </div>
    </div>
  );
}
