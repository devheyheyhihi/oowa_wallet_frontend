"use client";

import { useMemo, useState } from "react";
import { loginUser, registerUser } from "@/lib/authApi";
import { isSaseulAddress } from "@/lib/saseulCrypto";
import { createWalletWithMnemonic, restoreWalletFromMnemonic } from "@/lib/walletImport";
import type { AuthSession } from "@/types/auth";

type AuthMode = "login" | "register";
type WalletMode = "generated" | "imported";

interface AuthPanelProps {
  onAuthenticated: (session: AuthSession) => void;
  embedded?: boolean;
}

const normalizeAddress = (value: string) => value.trim().toLowerCase();

export function AuthPanel({
  onAuthenticated,
  embedded = false,
}: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [walletMode, setWalletMode] = useState<WalletMode>("generated");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [isMerchant, setIsMerchant] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [referrerWalletAddress, setReferrerWalletAddress] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canLogin = useMemo(
    () => loginId.trim().length >= 4 && password.length >= 8,
    [loginId, password],
  );

  const canRegister = useMemo(() => {
    const base =
      loginId.trim().length >= 4 &&
      password.length >= 8 &&
      phone.trim().length >= 8 &&
      name.trim().length >= 2 &&
      (!isMerchant || merchantName.trim().length >= 2) &&
      (!referrerWalletAddress.trim() ||
        isSaseulAddress(normalizeAddress(referrerWalletAddress)));

    if (!base) {
      return false;
    }

    if (walletMode === "generated") {
      return true;
    }

    return (
      mnemonic.trim().length > 0 &&
      isSaseulAddress(normalizeAddress(walletAddress))
    );
  }, [
    loginId,
    password,
    phone,
    name,
    isMerchant,
    merchantName,
    referrerWalletAddress,
    walletMode,
    mnemonic,
    walletAddress,
  ]);

  const resetSharedState = () => {
    setError("");
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canLogin) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const session = await loginUser({
        loginId,
        password,
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRegister) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const generated =
        walletMode === "generated" ? await createWalletWithMnemonic() : null;
      const wallet =
        walletMode === "generated"
          ? generated!.wallet
          : await restoreWalletFromMnemonic(mnemonic);
      const walletMnemonic =
        walletMode === "generated"
          ? generated!.mnemonic
          : mnemonic.trim().toLowerCase().replace(/\s+/g, " ");

      if (
        walletMode === "imported" &&
        normalizeAddress(walletAddress) !== wallet.address
      ) {
        throw new Error("입력한 지갑 주소와 니모닉에서 복구한 주소가 일치하지 않습니다.");
      }

      const session = await registerUser({
        loginId,
        password,
        phone,
        name,
        isMerchant,
        merchantName: isMerchant ? merchantName.trim() : undefined,
        referrerWalletAddress: referrerWalletAddress.trim() || undefined,
        walletMode,
        mnemonic: walletMnemonic,
        wallet,
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={embedded ? "auth-panel embedded" : "panel auth-panel"}>
      <div className="section-title">
        <div>
          <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
          <p>
            {mode === "login"
              ? "아이디와 비밀번호로 OOWA 지갑에 로그인합니다."
              : "계정을 만들고 지갑을 연결하거나 새 지갑을 생성합니다."}
          </p>
        </div>
      </div>

      <div className="segmented auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            resetSharedState();
          }}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            resetSharedState();
          }}
        >
          회원가입
        </button>
      </div>

      <div key={mode} className="auth-stage">
        {mode === "login" ? (
          <form onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="login-id">아이디</label>
            <input
              id="login-id"
              value={loginId}
              onChange={(event) => {
                setLoginId(event.target.value);
                resetSharedState();
              }}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                resetSharedState();
              }}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="status error">{error}</p>}
          <button className="button full-width" type="submit" disabled={!canLogin || loading}>
            {loading ? "확인 중" : "로그인"}
          </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
          <div className="auth-form-grid">
            <div className="field">
              <label htmlFor="register-login-id">아이디</label>
              <input
                id="register-login-id"
                value={loginId}
                onChange={(event) => {
                  setLoginId(event.target.value);
                  resetSharedState();
                }}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="register-password">비밀번호</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  resetSharedState();
                }}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="register-phone">전화번호</label>
              <input
                id="register-phone"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  resetSharedState();
                }}
                autoComplete="tel"
              />
            </div>
            <div className="field">
              <label htmlFor="register-name">이름</label>
              <input
                id="register-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  resetSharedState();
                }}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="field checkbox-field">
            <label className="checkbox-row" htmlFor="register-is-merchant">
              <input
                id="register-is-merchant"
                type="checkbox"
                checked={isMerchant}
                onChange={(event) => {
                  setIsMerchant(event.target.checked);
                  if (!event.target.checked) {
                    setMerchantName("");
                  }
                  resetSharedState();
                }}
              />
              <span>가맹점으로 가입</span>
            </label>
          </div>

          {isMerchant && (
            <div className="field">
              <label htmlFor="register-merchant-name">가맹점명</label>
              <input
                id="register-merchant-name"
                value={merchantName}
                onChange={(event) => {
                  setMerchantName(event.target.value);
                  resetSharedState();
                }}
                placeholder="가맹점명을 입력하세요"
                autoComplete="organization"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="register-referrer-wallet">추천인 지갑 주소</label>
            <input
              id="register-referrer-wallet"
              value={referrerWalletAddress}
              onChange={(event) => {
                setReferrerWalletAddress(event.target.value);
                resetSharedState();
              }}
              placeholder="없으면 비워두세요"
              autoComplete="off"
            />
            {referrerWalletAddress.trim() &&
              !isSaseulAddress(normalizeAddress(referrerWalletAddress)) && (
                <p className="field-error">추천인 주소는 44자리 hex 주소여야 합니다.</p>
              )}
          </div>

          <div className="field">
            <label>지갑 선택</label>
            <div className="segmented auth-tabs wallet-mode-tabs">
              <button
                type="button"
                className={walletMode === "generated" ? "active" : ""}
                onClick={() => {
                  setWalletMode("generated");
                  resetSharedState();
                }}
              >
                새 지갑 생성
              </button>
              <button
                type="button"
                className={walletMode === "imported" ? "active" : ""}
                onClick={() => {
                  setWalletMode("imported");
                  resetSharedState();
                }}
              >
                기존 지갑 연결
              </button>
            </div>
          </div>

          <div key={walletMode} className="auth-substage">
            {walletMode === "generated" ? (
              <p className="status neutral">
                회원가입이 완료되면 사슬골드 지갑이 자동으로 생성되고 계정에 연결됩니다.
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="wallet-address">지갑 주소</label>
                  <input
                    id="wallet-address"
                    value={walletAddress}
                    onChange={(event) => {
                      setWalletAddress(event.target.value);
                      resetSharedState();
                    }}
                    placeholder="44자리 지갑 주소"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="wallet-mnemonic">니모닉</label>
                  <textarea
                    id="wallet-mnemonic"
                    value={mnemonic}
                    onChange={(event) => {
                      setMnemonic(event.target.value);
                      resetSharedState();
                    }}
                    placeholder="복구 문구를 공백으로 구분해 입력하세요."
                  />
                </div>
              </>
            )}
          </div>

          {error && <p className="status error">{error}</p>}
          <button
            className="button full-width"
            type="submit"
            disabled={!canRegister || loading}
          >
            {loading ? "처리 중" : "회원가입"}
          </button>
          </form>
        )}
      </div>
    </section>
  );
}
