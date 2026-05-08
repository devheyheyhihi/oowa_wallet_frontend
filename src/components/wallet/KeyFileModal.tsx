"use client";

import { useRef, useState } from "react";
import { importWalletFromKeyFile } from "@/lib/walletImport";
import type { Wallet } from "@/types/wallet";

interface KeyFileModalProps {
  onBack: () => void;
  onConnect: (wallet: Wallet) => void;
}

export function KeyFileModal({ onBack, onConnect }: KeyFileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setLoading(true);
    setError("");

    try {
      const wallet = await importWalletFromKeyFile(file);
      onConnect(wallet);
    } catch (err) {
      setSelectedFile(null);
      setError(err instanceof Error ? err.message : "Failed to import keyfile");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === "dragenter" || event.type === "dragover");
  };

  return (
    <div className="modal-panel">
      <div className="modal-header">
        <div>
          <h2>Keyfile wallet connection</h2>
          <p>Select a Saseul Gold .sgk keyfile.</p>
        </div>
        <button className="icon-button" type="button" onClick={onBack}>
          Back
        </button>
      </div>

      <div
        className={`drop-zone ${dragActive ? "active" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".sgk"
          className="hidden-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void processFile(file);
            }
          }}
        />
        <div className="drop-icon">{loading ? "..." : "↑"}</div>
        <p>
          {selectedFile
            ? `Selected file: ${selectedFile.name}`
            : "Drag and drop a keyfile or click to select"}
        </p>
        <span>Supported format: .sgk</span>
      </div>

      {error && <p className="status error">{error}</p>}
    </div>
  );
}
