"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { MerchantMapPanel } from "@/components/map/MerchantMapPanel";
import { MerchantProfileModal } from "@/components/merchant/MerchantProfileModal";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { OOWA_TOKEN } from "@/constants/oowa";
import {
  compareRawTokenAmounts,
  formatRawTokenAmount,
  toRawTokenAmount,
  trimTokenAmount,
} from "@/lib/amount";
import {
  AUTH_TOKEN_STORAGE_KEY,
  getAuthSession,
  logoutUser,
  revealMnemonic,
  upsertMerchantProfile,
} from "@/lib/authApi";
import { geocodeAddress } from "@/lib/geocoding";
import {
  executeAuthenticatedPayment,
  getPaymentQuote,
  getWalletActivity,
  getWalletRecipients,
} from "@/lib/historyApi";
import {
  getInvestmentProduct,
  getMyInvestments,
  startInvestment,
  stopInvestment,
} from "@/lib/investmentApi";
import { getOowaBalance } from "@/lib/oowaApi";
import { decodeQRPayment, encodeQRPayment } from "@/lib/qr-payment-types";
import { scanQRFromVideo } from "@/lib/qr-scanner";
import { isSaseulAddress } from "@/lib/saseulCrypto";
import type {
  AuthSession,
  MerchantProfile,
  MerchantProfileChangeRequest,
} from "@/types/auth";
import type {
  ActivityKindFilter,
  PaymentQuoteResponse,
  WalletActivityItem,
  WalletRecipientRecord,
  WalletTransactionRecord,
} from "@/types/history";
import type {
  InvestmentPosition,
  InvestmentProduct,
} from "@/types/investment";

const BALANCE_REFRESH_INTERVAL_MS = 30_000;
const MODAL_CLOSE_MS = 180;
const QR_SCAN_INTERVAL_MS = 500;
const HOME_VIEW = "home";
const SG_FEE_REQUIRED_MESSAGE = "수수료로 사용할 사슬골드(SG)가 부족합니다.";
type ManagedOverlay = "confirm" | "account" | "merchant" | "qr" | "fee" | "txDetail";
const HISTORY_LIMIT = 10;

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((module) => module.QRCodeSVG),
  { ssr: false },
);


const shorten = (value: string, head = 8, tail = 6): string =>
  `${value.slice(0, head)}...${value.slice(-tail)}`;

const formatHistoryDate = (value: string | null): string => {
  if (!value) {
    return "대기 중";
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 9_999_999_999_999 ? Math.floor(numeric / 1000) : numeric)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "시간 확인 중";
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const paymentRoleLabel = (role: string): string => {
  switch (role) {
    case "merchant":
      return "가맹점";
    case "referrer_level1":
      return "추천인 보상 (7%)";
    case "referrer_level2":
      return "상위 추천인 보상 (3%)";
    default:
      return "수신자";
  }
};

const activityStatusLabel = (activity: WalletActivityItem): string => {
  if (activity.kind === "payment") {
    switch (activity.payment.status) {
      case "completed":
        return "완료";
      case "partial_failed":
        return "일부 실패";
      case "failed":
        return "실패";
      case "processing":
        return "처리 중";
      case "created":
        return "생성됨";
      default:
        return activity.payment.status;
    }
  }

  return activity.transaction.status;
};

const transactionEntryKindLabel = (transaction: WalletTransactionRecord): string => {
  switch (transaction.entryKind) {
    case "payment_referral_level1":
    case "payment_referral_level2":
      return "추천 보상";
    case "payment_merchant":
      return "가맹점 결제";
    case "investment_payout":
      return "투자 정산";
    case "investment_deposit":
      return "투자 예치";
    case "self_transfer":
      return "자체 이동";
    case "transfer_in":
      return "일반 입금";
    case "transfer_out":
      return "일반 전송";
    case "payment_out":
      return "결제 전송";
    default:
      return transaction.direction === "incoming"
        ? "일반 입금"
        : transaction.direction === "outgoing"
          ? "일반 전송"
          : "자체 이동";
  }
};

const activityTitle = (activity: WalletActivityItem): string => {
  if (activity.kind === "payment") {
    return "가맹점 결제";
  }

  return transactionEntryKindLabel(activity.transaction);
};

const merchantStatusLabel = (
  merchantProfile: MerchantProfile | null,
  changeRequest: MerchantProfileChangeRequest | null,
): string | null => {
  if (changeRequest?.status === "pending") {
    return "가맹점 변경 심사 중";
  }
  if (!merchantProfile) {
    return null;
  }

  switch (merchantProfile.status) {
    case "draft":
      return "가맹점 등록 필요";
    case "pending":
      return "가맹점 심사 중";
    case "approved":
      return "가맹점 승인 완료";
    case "denied":
      return "가맹점 반려됨";
    default:
      return null;
  }
};

const useAnimatedModalState = (open: boolean) => {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }

    if (!rendered) {
      return;
    }

    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, MODAL_CLOSE_MS);

    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  return { rendered, closing };
};

export default function HomePage() {
  const [currentView, setCurrentView] = useState<
    "home" | "transfer" | "investment" | "map"
  >(
    "home",
  );
  const [historyFilter, setHistoryFilter] = useState<ActivityKindFilter>("all");
  const [transferMode, setTransferMode] = useState<"send" | "receive">("send");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showRevealMnemonicModal, setShowRevealMnemonicModal] = useState(false);
  const [showMerchantProfileModal, setShowMerchantProfileModal] = useState(false);
  const [showQrScannerModal, setShowQrScannerModal] = useState(false);
  const [showFeeRequiredModal, setShowFeeRequiredModal] = useState(false);
  const [showTxDetailModal, setShowTxDetailModal] = useState(false);
  const [selectedActivity, setSelectedActivity] =
    useState<WalletActivityItem | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<Date | null>(null);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [response, setResponse] = useState<unknown>(null);
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuoteResponse | null>(
    null,
  );
  const [activity, setActivity] = useState<WalletActivityItem[]>([]);
  const [recipients, setRecipients] = useState<WalletRecipientRecord[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealedMnemonic, setRevealedMnemonic] = useState("");
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [merchantProfileLoading, setMerchantProfileLoading] = useState(false);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentActionLoading, setInvestmentActionLoading] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [investmentProduct, setInvestmentProduct] =
    useState<InvestmentProduct | null>(null);
  const [investmentPositions, setInvestmentPositions] = useState<
    InvestmentPosition[]
  >([]);
  const [investmentPage, setInvestmentPage] = useState(0);
  const [investmentTotal, setInvestmentTotal] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState("100");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const wallet = authSession?.wallet ?? null;
  const authToken = authSession?.token ?? null;
  const merchantProfile = authSession?.merchantProfile ?? null;
  const merchantProfileChangeRequest =
    authSession?.merchantProfileChangeRequest ?? null;
  const merchantStatusText = merchantStatusLabel(
    merchantProfile,
    merchantProfileChangeRequest,
  );
  const showMerchantAction = Boolean(merchantProfile);
  const merchantActionLabel =
    merchantProfile?.status === "draft" || merchantProfile?.status === "denied"
      ? "가맹점 등록"
      : "가맹점 정보";
  const confirmModalState = useAnimatedModalState(showConfirmModal && Boolean(wallet));
  const authModalState = useAnimatedModalState(authReady && !authSession);
  const accountModalState = useAnimatedModalState(showAccountModal && Boolean(authSession));
  const revealModalState = useAnimatedModalState(
    showRevealMnemonicModal && Boolean(authSession),
  );
  const merchantModalState = useAnimatedModalState(
    showMerchantProfileModal && Boolean(authSession),
  );
  const qrScannerModalState = useAnimatedModalState(showQrScannerModal);
  const feeRequiredModalState = useAnimatedModalState(showFeeRequiredModal);
  const txDetailModalState = useAnimatedModalState(showTxDetailModal);

  const formattedBalance = useMemo(() => {
    if (!balance) {
      return "0";
    }
    return formatRawTokenAmount(balance, OOWA_TOKEN.decimals);
  }, [balance]);

  const shortAddress = wallet
    ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`
    : "Not connected";
  const lastBalanceUpdateText = lastBalanceUpdate
    ? lastBalanceUpdate.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : "대기 중";

  const normalizedToAddress = toAddress.trim().toLowerCase();
  const investmentAmountRaw = useMemo(() => {
    try {
      return toRawTokenAmount(investmentAmount, OOWA_TOKEN.decimals);
    } catch {
      return "";
    }
  }, [investmentAmount]);
  const activeInvestments = useMemo(
    () => investmentPositions.filter((position) => position.status === "active"),
    [investmentPositions],
  );
  const filteredActivity = activity;

  const historyNavMounted = useRef(false);
  useEffect(() => {
    if (!historyNavMounted.current) {
      historyNavMounted.current = true;
      return;
    }
    if (!wallet?.address) return;
    void refreshHistory(wallet.address, { page: historyPage, kind: historyFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage, historyFilter]);

  const investmentNavMounted = useRef(false);
  useEffect(() => {
    if (!investmentNavMounted.current) {
      investmentNavMounted.current = true;
      return;
    }
    if (!authToken) return;
    void refreshInvestments(authToken, { page: investmentPage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentPage]);
  const investmentAmountError = useMemo(() => {
    try {
      toRawTokenAmount(investmentAmount, OOWA_TOKEN.decimals);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid amount";
    }
  }, [investmentAmount]);
  const investmentBalanceError =
    investmentAmountRaw && balance && compareRawTokenAmounts(investmentAmountRaw, balance) > 0
      ? "잔액보다 큰 수량은 투자할 수 없습니다."
      : "";
  const canStartInvestment =
    Boolean(authToken) &&
    Boolean(investmentProduct?.investmentAvailable) &&
    !investmentActionLoading &&
    !investmentAmountError &&
    !investmentBalanceError &&
    Boolean(investmentAmountRaw);
  const receiveQrData = useMemo(() => {
    if (!wallet) {
      return "";
    }

    const requestedAmount = receiveAmount.trim();
    return encodeQRPayment(wallet.address, requestedAmount || undefined);
  }, [receiveAmount, wallet]);

  const handleViewChange = useCallback(
    (nextView: "home" | "transfer" | "investment" | "map") => {
      if (nextView === currentView) {
        return;
      }

      if (typeof window === "undefined") {
        setCurrentView(nextView);
        return;
      }

      if (nextView === HOME_VIEW && currentView !== HOME_VIEW) {
        window.history.back();
        return;
      }

      const nextState = {
        ...(window.history.state ?? {}),
        oowaView: nextView,
      };

      if (currentView === HOME_VIEW) {
        window.history.pushState(nextState, "");
      } else {
        window.history.replaceState(nextState, "");
      }

      setCurrentView(nextView);
    },
    [currentView],
  );
  const applyManagedOverlayState = useCallback((overlay: ManagedOverlay | null) => {
    setShowConfirmModal(overlay === "confirm");
    setShowAccountModal(overlay === "account");
    setShowMerchantProfileModal(overlay === "merchant");
    setShowQrScannerModal(overlay === "qr");
    setShowFeeRequiredModal(overlay === "fee");
    setShowTxDetailModal(overlay === "txDetail");

    if (overlay !== "account") {
      setShowRevealMnemonicModal(false);
      setRevealPassword("");
      setRevealedMnemonic("");
    }
  }, []);

  const openManagedOverlay = useCallback(
    (overlay: ManagedOverlay) => {
      if (typeof window === "undefined") {
        applyManagedOverlayState(overlay);
        return;
      }

      const nextState = {
        ...(window.history.state ?? {}),
        oowaView: currentView,
        oowaOverlay: overlay,
      };

      window.history.pushState(nextState, "");
      applyManagedOverlayState(overlay);
    },
    [applyManagedOverlayState, currentView],
  );

  const closeManagedOverlay = useCallback(
    (overlay: ManagedOverlay) => {
      if (typeof window === "undefined") {
        applyManagedOverlayState(null);
        return;
      }

      if (window.history.state?.oowaOverlay === overlay) {
        window.history.back();
        return;
      }

      const nextState = {
        ...(window.history.state ?? {}),
        oowaOverlay: null,
      };
      window.history.replaceState(nextState, "");
      applyManagedOverlayState(null);
    },
    [applyManagedOverlayState],
  );
  const handleUserFacingError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      if (message.includes(SG_FEE_REQUIRED_MESSAGE)) {
        setError("");
        openManagedOverlay("fee");
        return;
      }

      setError(message);
    },
    [openManagedOverlay],
  );
  const rawAmount = useMemo(() => {
    try {
      return toRawTokenAmount(amount, OOWA_TOKEN.decimals);
    } catch {
      return "";
    }
  }, [amount]);

  const amountError = useMemo(() => {
    try {
      toRawTokenAmount(amount, OOWA_TOKEN.decimals);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid amount";
    }
  }, [amount]);

  const addressError = useMemo(() => {
    if (!normalizedToAddress) {
      return "받는 주소를 입력해주세요.";
    }
    if (!isSaseulAddress(normalizedToAddress)) {
      return "받는 주소는 44자리 hex 주소여야 합니다.";
    }
    if (wallet?.address === normalizedToAddress) {
      return "내 지갑 주소로는 전송할 수 없습니다.";
    }
    return "";
  }, [normalizedToAddress, wallet?.address]);

  const balanceError =
    rawAmount && balance && compareRawTokenAmounts(rawAmount, balance) > 0
      ? "잔액보다 큰 수량은 전송할 수 없습니다."
      : "";
  const transferValidationError = !wallet
    ? "먼저 로그인해주세요."
    : addressError || amountError || balanceError;
  const canPrepareTransfer = !transferValidationError && !loading;

  const refreshBalance = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!wallet) {
        if (!silent) {
          setError("먼저 로그인해주세요.");
        }
        return;
      }

      setBalanceLoading(true);
      if (!silent) {
        setError("");
      }

      try {
        const nextBalance = await getOowaBalance(wallet.address);
        setBalance(nextBalance);
        setLastBalanceUpdate(new Date());
        if (!silent) {
          setStatus("OOWA 잔액을 새로고침했습니다.");
        }
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch balance",
          );
        }
      } finally {
        setBalanceLoading(false);
      }
    },
    [wallet],
  );

  const refreshHistory = useCallback(
    async (
      walletAddress: string,
      opts: { page?: number; kind?: ActivityKindFilter | null } = {},
    ) => {
      const { page = 0, kind } = opts;
      setHistoryLoading(true);
      try {
        const [activityResult, recipientResult] = await Promise.all([
          getWalletActivity(walletAddress, {
            page,
            limit: HISTORY_LIMIT,
            kind: kind ?? undefined,
          }),
          getWalletRecipients(walletAddress),
        ]);
        setActivity(activityResult.activity);
        setHistoryTotal(activityResult.total);
        setRecipients(recipientResult.recipients);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "히스토리를 불러오지 못했습니다.",
        );
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  const refreshAuthSession = useCallback(async (token: string) => {
    const session = await getAuthSession(token);
    setAuthSession(session);
    return session;
  }, []);

  const refreshInvestmentProduct = useCallback(async () => {
    try {
      const product = await getInvestmentProduct();
      setInvestmentProduct(product);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "투자 상품 정보를 불러오지 못했습니다.",
      );
    }
  }, []);

  const INVESTMENT_LIMIT = 10;

  const refreshInvestments = useCallback(
    async (token: string, opts: { page?: number } = {}) => {
      const { page = 0 } = opts;
      setInvestmentLoading(true);
      try {
        const result = await getMyInvestments(token, { page, limit: INVESTMENT_LIMIT });
        setInvestmentProduct(result.product);
        setInvestmentPositions(result.positions);
        setInvestmentTotal(result.total);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "투자 현황을 불러오지 못했습니다.",
        );
      } finally {
        setInvestmentLoading(false);
      }
    },
    [],
  );

  const handleAuthenticated = (session: AuthSession) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    setAuthSession(session);
    applyManagedOverlayState(null);
    setPaymentQuote(null);
    setResponse(null);
    setActivity([]);
    setRecipients([]);
    setHistoryPage(0);
    setHistoryTotal(0);
    setInvestmentPositions([]);
    setInvestmentPage(0);
    setInvestmentTotal(0);
    setCopiedAddress(false);
    setRevealPassword("");
    setRevealedMnemonic("");
    setShowRevealMnemonicModal(false);
    setBalance("");
    setLastBalanceUpdate(null);
    setInvestmentAmount("100");
    setError("");
    setStatus(`${session.user.name}님, 로그인되었습니다.`);
    if (session.merchantProfile?.status === "draft") {
      openManagedOverlay("merchant");
    }
  };

  const handleLogout = async () => {
    const token = authToken;
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    applyManagedOverlayState(null);
    setAuthSession(null);
    setBalance("");
    setLastBalanceUpdate(null);
    setPaymentQuote(null);
    setResponse(null);
    setActivity([]);
    setRecipients([]);
    setHistoryPage(0);
    setHistoryTotal(0);
    setInvestmentPositions([]);
    setInvestmentPage(0);
    setInvestmentTotal(0);
    setCopiedAddress(false);
    setRevealPassword("");
    setRevealedMnemonic("");
    setShowRevealMnemonicModal(false);
    setError("");
    setInvestmentAmount("100");
    setStatus("로그아웃되었습니다.");

    if (!token) {
      return;
    }

    try {
      await logoutUser(token);
    } catch {
      // 세션 종료 실패는 로컬 로그아웃을 막지 않습니다.
    }
  };

  const copyWalletAddress = async () => {
    if (!wallet) {
      setError("먼저 로그인해주세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setStatus("지갑 주소를 복사했습니다.");
      window.setTimeout(() => {
        setCopiedAddress(false);
      }, 1600);
    } catch {
      setError("주소 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  const copyTxhash = async (txhash: string) => {
    try {
      await navigator.clipboard.writeText(txhash);
      setStatus("트랜잭션 해시를 복사했습니다.");
    } catch {
      setError("트랜잭션 해시 복사에 실패했습니다.");
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label}를 복사했습니다.`);
    } catch {
      setError(`${label} 복사에 실패했습니다.`);
    }
  };

  const handleRevealMnemonic = async () => {
    if (!authToken) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (!revealPassword) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setMnemonicLoading(true);
    setError("");
    try {
      const result = await revealMnemonic({
        token: authToken,
        password: revealPassword,
      });
      setRevealedMnemonic(result.mnemonic);
      setStatus("복구 문구를 불러왔습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "복구 문구를 불러오지 못했습니다.");
    } finally {
      setMnemonicLoading(false);
    }
  };

  const handleSaveMerchantProfile = async (input: {
    merchantName: string;
    category: string;
    postalCode?: string;
    addressMain: string;
    addressDetail?: string;
    phone?: string;
    description?: string;
  }) => {
    if (!authToken) {
      setError("로그인이 필요합니다.");
      return;
    }

    setMerchantProfileLoading(true);
    setError("");
    try {
      const location = await geocodeAddress(input.addressMain);
      await upsertMerchantProfile({
        token: authToken,
        ...input,
        lat: location.lat,
        lng: location.lng,
      });
      const nextSession = await refreshAuthSession(authToken);
      closeManagedOverlay("merchant");
      setStatus(
        nextSession.merchantProfileChangeRequest?.status === "pending"
          ? "가맹점 정보 변경 요청을 저장했고 심사를 기다리고 있습니다."
          : nextSession.merchantProfile?.status === "approved"
            ? "가맹점 정보가 저장되었습니다."
          : "가맹점 정보를 저장했고 심사를 기다리고 있습니다.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "가맹점 정보를 저장하지 못했습니다.",
      );
      throw err;
    } finally {
      setMerchantProfileLoading(false);
    }
  };

  const stopQrScanner = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleScannedQr = useCallback(
    (qrString: string) => {
      const paymentData = decodeQRPayment(qrString);
      if (!paymentData) {
        setScannerError("유효한 OOWA QR 코드가 아닙니다.");
        return;
      }

      setToAddress(paymentData.address);
      if (paymentData.amount) {
        setAmount(paymentData.amount);
      }
      setCurrentView("transfer");
      setTransferMode("send");
      closeManagedOverlay("qr");
      setPaymentQuote(null);
      setResponse(null);
      setScannerError("");
      setStatus("QR 코드를 읽어서 주소를 입력했습니다.");
    },
    [closeManagedOverlay],
  );

  useEffect(() => {
    if (!showQrScannerModal) {
      stopQrScanner();
      setScannerLoading(false);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setScannerError("");
      setScannerLoading(true);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (!videoRef.current) {
          throw new Error("카메라 화면을 준비하지 못했습니다.");
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScannerLoading(false);

        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || !canvasRef.current) {
            return;
          }

          const qrData = await scanQRFromVideo(videoRef.current, canvasRef.current);
          if (qrData) {
            stopQrScanner();
            handleScannedQr(qrData);
          }
        }, QR_SCAN_INTERVAL_MS);
      } catch (err) {
        setScannerLoading(false);
        setScannerError(
          err instanceof Error
            ? err.message
            : "카메라를 시작하지 못했습니다.",
        );
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopQrScanner();
    };
  }, [handleScannedQr, showQrScannerModal, stopQrScanner]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const currentState = window.history.state ?? {};
    if (!currentState.oowaView) {
      window.history.replaceState(
        {
          ...currentState,
          oowaView: HOME_VIEW,
          oowaOverlay: null,
        },
        "",
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextView = event.state?.oowaView;
      const nextOverlay = event.state?.oowaOverlay;

      if (
        nextView === "transfer" ||
        nextView === "investment" ||
        nextView === "map"
      ) {
        setCurrentView(nextView);
      } else {
        setCurrentView(HOME_VIEW);
      }

      if (
        nextOverlay === "confirm" ||
        nextOverlay === "account" ||
        nextOverlay === "merchant" ||
        nextOverlay === "qr" ||
        nextOverlay === "fee" ||
        nextOverlay === "txDetail"
      ) {
        applyManagedOverlayState(nextOverlay);
        return;
      }

      applyManagedOverlayState(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [applyManagedOverlayState]);

  useEffect(() => {
    void refreshInvestmentProduct();
  }, [refreshInvestmentProduct]);

  useEffect(() => {
    const savedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!savedToken) {
      setAuthReady(true);
      return;
    }

    void getAuthSession(savedToken)
      .then((session) => {
        setAuthSession(session);
        setStatus("세션을 복원했습니다.");
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    if (!wallet) {
      return;
    }

    void refreshBalance({ silent: true });
    void refreshHistory(wallet.address);
    if (authToken) {
      void refreshInvestments(authToken, { page: 0 });
    }

    const timer = window.setInterval(() => {
      void refreshBalance({ silent: true });
    }, BALANCE_REFRESH_INTERVAL_MS);

    const handleFocus = () => {
      void refreshBalance({ silent: true });
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [authToken, refreshBalance, refreshHistory, refreshInvestments, wallet]);

  const openConfirmTransfer = async () => {
    if (transferValidationError || !wallet || !rawAmount) {
      setError(transferValidationError);
      return;
    }

    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const quote = await getPaymentQuote({
        payerWalletAddress: wallet.address,
        toWalletAddress: normalizedToAddress,
        amountRaw: rawAmount,
      });
      setPaymentQuote(quote);
      openManagedOverlay("confirm");
      setStatus(
        quote.isMerchantPayment
          ? "가맹점 결제 분배를 계산했습니다."
          : "일반 송금 정보를 확인해주세요.",
      );
    } catch (err) {
      setPaymentQuote(null);
      setError(err instanceof Error ? err.message : "결제 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const sendTransfer = async () => {
    if (!wallet || !authToken) {
      setError("먼저 로그인해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const result = await executeAuthenticatedPayment({
        token: authToken,
        request: {
          toWalletAddress: normalizedToAddress,
          amountRaw: rawAmount,
        },
      });

      setRecipients(result.recipients);
      setResponse({
        paymentType: result.quote.isMerchantPayment ? "merchant" : "standard",
        transfers: result.results,
        paymentOrder: result.paymentOrder,
      });
      await refreshHistory(wallet.address, { page: 0 });
      setHistoryPage(0);
      const nextBalance = await getOowaBalance(wallet.address);
      setBalance(nextBalance);
      setLastBalanceUpdate(new Date());
      closeManagedOverlay("confirm");
      setStatus(result.userMessage);
    } catch (err) {
      handleUserFacingError(err, "전송에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const startUserInvestment = async () => {
    if (!authToken) {
      setError("먼저 로그인해주세요.");
      return;
    }
    if (!investmentAmountRaw || investmentAmountError || investmentBalanceError) {
      setError(investmentAmountError || investmentBalanceError || "투자 금액을 확인해주세요.");
      return;
    }
    setInvestmentActionLoading(true);
    setError("");
    setResponse(null);
    try {
      const result = await startInvestment({
        token: authToken,
        amountRaw: investmentAmountRaw,
      });
      setStatus(result.userMessage);
      setInvestmentPage(0);
      await Promise.all([
        refreshInvestments(authToken, { page: 0 }),
        refreshBalance({ silent: true }),
        wallet ? refreshHistory(wallet.address, { page: 0 }) : Promise.resolve(),
      ]);
    } catch (err) {
      handleUserFacingError(err, "투자를 시작하지 못했습니다.");
    } finally {
      setInvestmentActionLoading(false);
    }
  };

  const stopUserInvestment = async (positionId: string) => {
    if (!authToken) {
      setError("먼저 로그인해주세요.");
      return;
    }

    setInvestmentActionLoading(true);
    setError("");
    setResponse(null);
    try {
      const result = await stopInvestment({
        token: authToken,
        positionId,
      });
      setStatus(result.userMessage);
      setInvestmentPage(0);
      await Promise.all([
        refreshInvestments(authToken, { page: 0 }),
        refreshBalance({ silent: true }),
        wallet ? refreshHistory(wallet.address, { page: 0 }) : Promise.resolve(),
      ]);
    } catch (err) {
      handleUserFacingError(err, "투자를 종료하지 못했습니다.");
    } finally {
      setInvestmentActionLoading(false);
    }
  };

  return (
    <main className="app-shell">
      {confirmModalState.rendered && wallet && (
        <div
          className={`modal-backdrop${confirmModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell">
            <div className={`modal-panel${confirmModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>
                    {paymentQuote?.isMerchantPayment
                      ? "가맹점 결제 확인"
                      : "전송 확인"}
                  </h2>
                  <p>
                    {paymentQuote?.isMerchantPayment
                      ? "가맹점 정산과 추천인·상위 추천인 보상을 확인한 뒤 OOWA를 전송합니다."
                      : "아래 내용을 확인한 뒤 OOWA를 전송합니다."}
                  </p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => closeManagedOverlay("confirm")}
                >
                  ×
                </button>
              </div>

              <dl className="confirm-list">
                <div>
                  <dt>Token</dt>
                  <dd>{OOWA_TOKEN.symbol}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {amount} {OOWA_TOKEN.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Raw amount</dt>
                  <dd>{rawAmount}</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>{wallet.address}</dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>{normalizedToAddress}</dd>
                </div>
                <div>
                  <dt>Token address</dt>
                  <dd>{OOWA_TOKEN.tokenAddress}</dd>
                </div>
                {paymentQuote && (
                  <>
                    <div>
                      <dt>결제 유형</dt>
                      <dd>
                        {paymentQuote.isMerchantPayment
                          ? `가맹점 결제${paymentQuote.merchantName ? ` · ${paymentQuote.merchantName}` : ""}`
                          : "일반 송금"}
                      </dd>
                    </div>
                    <div>
                      <dt>실제 전송 건수</dt>
                      <dd>{paymentQuote.transfers.length}건</dd>
                    </div>
                  </>
                )}
              </dl>

              {paymentQuote && (
                <div className="payment-breakdown">
                  <p className="meta-label">분배 내역</p>
                  <div className="breakdown-list">
                    {paymentQuote.transfers
                      .filter((transfer) => transfer.role !== "referrer_level2")
                      .map((transfer) => (
                      <div key={`${transfer.role}-${transfer.toWalletAddress}`}>
                        <dt>{paymentRoleLabel(transfer.role)}</dt>
                        <dd>
                          <strong>
                            {transfer.amountDisplay} {OOWA_TOKEN.symbol}
                          </strong>
                          <span>{transfer.toWalletAddress}</span>
                        </dd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {transferValidationError && (
                <p className="status error">{transferValidationError}</p>
              )}

              <div className="button-grid confirm-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => closeManagedOverlay("confirm")}
                >
                  취소
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={Boolean(transferValidationError) || loading}
                  onClick={sendTransfer}
                >
                  {loading ? "전송 중" : "전송하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {authModalState.rendered && (
        <div
          className={`modal-backdrop${authModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell">
            <div
              className={`modal-panel auth-modal-panel${authModalState.closing ? " closing" : ""}`}
            >
              <AuthPanel onAuthenticated={handleAuthenticated} embedded />
            </div>
          </div>
        </div>
      )}

      {merchantModalState.rendered && authSession && (
        <MerchantProfileModal
          open={!merchantModalState.closing && showMerchantProfileModal}
          loading={merchantProfileLoading}
          initialProfile={merchantProfile}
          changeRequest={merchantProfileChangeRequest}
          defaultPhone={authSession.user.phone}
          onClose={() => closeManagedOverlay("merchant")}
          onSubmit={handleSaveMerchantProfile}
        />
      )}

      {qrScannerModalState.rendered && (
        <div
          className={`modal-backdrop${qrScannerModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell narrow">
            <div className={`modal-panel${qrScannerModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>QR 코드 스캔</h2>
                  <p>카메라로 OOWA 주소 QR 코드를 읽어 보낼 주소를 입력합니다.</p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => closeManagedOverlay("qr")}
                >
                  ×
                </button>
              </div>

              <div className="qr-scanner-frame">
                <video ref={videoRef} className="qr-scanner-video" playsInline muted />
                <canvas ref={canvasRef} className="qr-scanner-canvas" />
              </div>

              {scannerLoading ? (
                <p className="status neutral">카메라를 준비하는 중입니다.</p>
              ) : null}
              {scannerError ? <p className="status error">{scannerError}</p> : null}

              <div className="button-grid single">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => closeManagedOverlay("qr")}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feeRequiredModalState.rendered && (
        <div
          className={`modal-backdrop${feeRequiredModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell narrow">
            <div className={`modal-panel${feeRequiredModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>사슬골드 충전 필요</h2>
                  <p>OOWA 기능을 계속 사용하려면 수수료용 사슬골드(SG)가 필요합니다.</p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => closeManagedOverlay("fee")}
                >
                  ×
                </button>
              </div>

              <p className="status neutral">
                현재 지갑에는 네트워크 수수료를 낼 사슬골드(SG)가 부족합니다.
                사슬골드를 충전한 뒤 다시 시도해주세요.
              </p>

              <div className="button-grid single">
                <button
                  className="button"
                  type="button"
                  onClick={() => closeManagedOverlay("fee")}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {txDetailModalState.rendered && selectedActivity && (
        <div
          className={`modal-backdrop${txDetailModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell">
            <div className={`modal-panel${txDetailModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>거래 상세</h2>
                  <p>{activityTitle(selectedActivity)}</p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => closeManagedOverlay("txDetail")}
                >
                  ×
                </button>
              </div>

              {selectedActivity.kind === "transaction" ? (
                <dl className="confirm-list">
                  <div>
                    <dt>상태</dt>
                    <dd>{selectedActivity.transaction.status}</dd>
                  </div>
                  <div>
                    <dt>금액</dt>
                    <dd>
                      <strong>
                        {trimTokenAmount(selectedActivity.transaction.amountDisplay)}{" "}
                        {selectedActivity.transaction.tokenSymbol}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>구분</dt>
                    <dd>
                      {selectedActivity.transaction.direction === "incoming"
                        ? "받음"
                        : selectedActivity.transaction.direction === "outgoing"
                          ? "보냄"
                          : "자체"}
                    </dd>
                  </div>
                  <div>
                    <dt>보낸 주소</dt>
                    <dd className="break-all">{selectedActivity.transaction.fromAddress}</dd>
                  </div>
                  <div>
                    <dt>받는 주소</dt>
                    <dd className="break-all">{selectedActivity.transaction.toAddress}</dd>
                  </div>
                  <div>
                    <dt>트랜잭션 해시</dt>
                    <dd className="break-all">
                      {selectedActivity.transaction.txhash}
                      <button
                        className="copy-button"
                        type="button"
                        onClick={() => void copyTxhash(selectedActivity.transaction.txhash)}
                        title="복사"
                        style={{ marginLeft: "0.5rem" }}
                      >
                        복사
                      </button>
                    </dd>
                  </div>
                  {selectedActivity.transaction.blockHeight && (
                    <div>
                      <dt>블록 높이</dt>
                      <dd>{selectedActivity.transaction.blockHeight}</dd>
                    </div>
                  )}
                  <div>
                    <dt>시간</dt>
                    <dd>
                      {formatHistoryDate(
                        selectedActivity.transaction.chainTimestamp ??
                          selectedActivity.transaction.createdAt,
                      )}
                    </dd>
                  </div>
                  {selectedActivity.transaction.confirmedAt && (
                    <div>
                      <dt>확인 시간</dt>
                      <dd>{formatHistoryDate(selectedActivity.transaction.confirmedAt)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>네트워크</dt>
                    <dd>{selectedActivity.transaction.network}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <dl className="confirm-list">
                    <div>
                      <dt>상태</dt>
                      <dd>{activityStatusLabel(selectedActivity)}</dd>
                    </div>
                    <div>
                      <dt>총 결제 금액</dt>
                      <dd>
                        <strong>{trimTokenAmount(selectedActivity.payment.totalAmountDisplay)} OOWA</strong>
                      </dd>
                    </div>
                    <div>
                      <dt>가맹점</dt>
                      <dd>
                        {selectedActivity.payment.merchantName
                          ? `${selectedActivity.payment.merchantName} · `
                          : ""}
                        {selectedActivity.payment.merchantWalletAddress}
                      </dd>
                    </div>
                    <div>
                      <dt>주문번호</dt>
                      <dd className="break-all">{selectedActivity.payment.id}</dd>
                    </div>
                    <div>
                      <dt>결제 시간</dt>
                      <dd>{formatHistoryDate(selectedActivity.payment.createdAt)}</dd>
                    </div>
                    {selectedActivity.payment.failureReason && (
                      <div>
                        <dt>실패 사유</dt>
                        <dd>{selectedActivity.payment.failureReason}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="admin-transfer-list">
                    {selectedActivity.payment.transfers.map((transfer) => (
                      <div className="admin-transfer-item" key={transfer.id}>
                        <div>
                          <p className="history-title">
                            {paymentRoleLabel(transfer.transferRole)}
                            <span>{transfer.status}</span>
                          </p>
                          <p className="history-address">{transfer.toWalletAddress}</p>
                          {transfer.txhash && (
                            <p className="history-time">
                              tx {shorten(transfer.txhash, 10, 8)}
                            </p>
                          )}
                          {transfer.errorMessage && (
                            <p className="history-time">{transfer.errorMessage}</p>
                          )}
                        </div>
                        <strong>{trimTokenAmount(transfer.amountDisplay)} OOWA</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="button-grid single">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => closeManagedOverlay("txDetail")}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {accountModalState.rendered && authSession && (
        <div
          className={`modal-backdrop${accountModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell">
            <div className={`modal-panel${accountModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>상세정보</h2>
                  <p>계정과 지갑 정보를 확인하고 복구 문구를 조회할 수 있습니다.</p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => {
                    closeManagedOverlay("account");
                    setShowRevealMnemonicModal(false);
                    setRevealPassword("");
                    setRevealedMnemonic("");
                  }}
                >
                  ×
                </button>
              </div>

              <dl className="info-list">
                <div>
                  <dt>이름</dt>
                  <dd>{authSession.user.name}</dd>
                </div>
                <div>
                  <dt>아이디</dt>
                  <dd>{authSession.user.loginId}</dd>
                </div>
                <div>
                  <dt>전화번호</dt>
                  <dd>{authSession.user.phone}</dd>
                </div>
                <div>
                  <dt>가맹점 상태</dt>
                  <dd>{merchantStatusText ?? "일반 사용자"}</dd>
                </div>
                {merchantProfile?.merchantName && (
                  <div>
                    <dt>가맹점명</dt>
                    <dd>{merchantProfile.merchantName}</dd>
                  </div>
                )}
                <div>
                  <dt>지갑 주소</dt>
                  <dd className="address-copy-row detail">
                    <span>{authSession.wallet.address}</span>
                    <button
                      className="copy-button"
                      type="button"
                      onClick={() =>
                        void copyText(authSession.wallet.address, "지갑 주소")
                      }
                    >
                      복사
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>OOWA token address</dt>
                  <dd>{OOWA_TOKEN.tokenAddress}</dd>
                </div>
                {merchantProfile?.addressMain && (
                  <div>
                    <dt>가맹점 주소</dt>
                    <dd>
                      {merchantProfile.addressMain}
                      {merchantProfile.addressDetail
                        ? ` ${merchantProfile.addressDetail}`
                        : ""}
                    </dd>
                  </div>
                )}
                {merchantProfile?.reviewNote && (
                  <div>
                    <dt>심사 메모</dt>
                    <dd>{merchantProfile.reviewNote}</dd>
                  </div>
                )}
              </dl>

              {authSession.wallet.mnemonicAvailable ? (
                <div className="mnemonic-reveal-block">
                  <div className="section-title compact">
                    <h2>복구 문구</h2>
                  </div>
                  <div className="button-grid single">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setShowRevealMnemonicModal(true);
                        setRevealPassword("");
                        setRevealedMnemonic("");
                        setError("");
                      }}
                    >
                      복구 문구 보기
                    </button>
                  </div>
                </div>
              ) : (
                <p className="status neutral">저장된 복구 문구가 없습니다.</p>
              )}

              <div className="button-grid">
                {/* <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setShowAccountModal(false);
                    setRevealPassword("");
                    setRevealedMnemonic("");
                  }}
                >
                  닫기
                </button> */}
                <button className="button danger" type="button" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {revealModalState.rendered && authSession && (
        <div
          className={`modal-backdrop modal-layered${revealModalState.closing ? " closing" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-shell narrow">
            <div className={`modal-panel${revealModalState.closing ? " closing" : ""}`}>
              <div className="modal-header">
                <div>
                  <h2>복구 문구 확인</h2>
                  <p>비밀번호를 다시 입력하면 복구 문구를 확인하고 복사할 수 있습니다.</p>
                </div>
                <button
                  className="modal-close"
                  type="button"
                  onClick={() => {
                    setShowRevealMnemonicModal(false);
                    setRevealPassword("");
                    setRevealedMnemonic("");
                  }}
                >
                  ×
                </button>
              </div>

              <div className="field">
                <label htmlFor="reveal-password">비밀번호 재입력</label>
                <input
                  id="reveal-password"
                  type="password"
                  value={revealPassword}
                  onChange={(event) => setRevealPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="button-grid single reveal-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={mnemonicLoading}
                  onClick={() => void handleRevealMnemonic()}
                >
                  {mnemonicLoading ? "확인 중" : "복구 문구 보기"}
                </button>
              </div>

              {revealedMnemonic && (
                <div className="field">
                  <label htmlFor="revealed-mnemonic">Mnemonic</label>
                  <textarea
                    id="revealed-mnemonic"
                    readOnly
                    value={revealedMnemonic}
                  />
                  <div className="button-grid single">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => void copyText(revealedMnemonic, "복구 문구")}
                    >
                      복구 문구 복사
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <header className="app-topbar">
        <div className="brand">
          <Image
            src="/images/logo-oowa.png"
            alt="OOWA Wallet"
            width={120}
            height={50}
            className="brand-logo"
            priority
          />
        </div>
        {authSession ? (
          <button
            className="icon-text-button"
            type="button"
            onClick={handleLogout}
          >
            <span className="button-icon">−</span>
            로그아웃
          </button>
        ) : null}
      </header>

      {currentView === "home" && (
        <section className="wallet-summary" aria-label="Wallet summary">
          <div className="summary-head">
            <div>
              <p className="eyebrow">Available balance</p>
              <div className="balance-display">
                <strong>{formattedBalance}</strong>
                <span>{OOWA_TOKEN.symbol}</span>
              </div>
              <p className="update-meta">
                {balanceLoading
                  ? "업데이트 중"
                  : `마지막 업데이트 ${lastBalanceUpdateText}`}
              </p>
            </div>
            <div className="summary-tools">
              {wallet && (
                <button
                  className="refresh-icon-button"
                  type="button"
                  disabled={balanceLoading}
                  onClick={() => void refreshBalance()}
                  aria-label="잔액 새로고침"
                  title="잔액 새로고침"
                >
                  ↻
                </button>
              )}
              <div className="token-chip">
                <span>O</span>
                OOWA
              </div>
            </div>
          </div>

          <div className="summary-meta">
            <div>
              <span className="meta-label">Wallet</span>
              <div className="address-copy-row">
                <strong>{shortAddress}</strong>
                {wallet && (
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() => void copyWalletAddress()}
                    aria-label="지갑 주소 복사"
                    title="지갑 주소 복사"
                  >
                    {copiedAddress ? "완료" : "복사"}
                  </button>
                )}
              </div>
            </div>
            {authSession && (
              <div>
                <span className="meta-label">Account</span>
                <strong>{authSession.user.name}</strong>
                {merchantStatusText && (
                  <p className="summary-subtext">{merchantStatusText}</p>
                )}
              </div>
            )}
          </div>

          {authSession && (
            <div className="summary-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => openManagedOverlay("account")}
              >
                상세정보
              </button>
              {showMerchantAction && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openManagedOverlay("merchant")}
                >
                  {merchantActionLabel}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {!authReady ? (
        <section className="content-stack">
          <section className="panel">
            <p className="status neutral">세션을 확인하는 중입니다.</p>
          </section>
        </section>
      ) : currentView === "map" ? (
        <section className="content-stack view-stack">
          <MerchantMapPanel active={Boolean(authSession)} />
        </section>
      ) : currentView === "investment" ? (
        <section className="content-stack view-stack">
          <section className="panel investment-panel">
            <div className="section-title">
              <div>
                <h2>투자</h2>
                <p>24시간마다 원금 기준 0.2%가 누적됩니다.</p>
              </div>
            </div>

            <div className="investment-summary-grid">
              <div className="investment-summary-card">
                <span className="meta-label">일일 보상</span>
                <strong>
                  {investmentProduct
                    ? `${investmentProduct.dailyRatePercent.toFixed(1)}%`
                    : "0.2%"}
                </strong>
              </div>
              <div className="investment-summary-card">
                <span className="meta-label">최대 총 반환</span>
                <strong>
                  {investmentProduct
                    ? `${investmentProduct.capTotalPercent.toFixed(0)}%`
                    : "250%"}
                </strong>
              </div>
              <div className="investment-summary-card">
                <span className="meta-label">최대 누적 일수</span>
                <strong>
                  {investmentProduct?.maxRewardDays ?? 750}일
                </strong>
              </div>
            </div>

            <div className="field">
              <label htmlFor="investment-amount">투자 금액</label>
              <div className="amount-input-wrap">
                <input
                  id="investment-amount"
                  value={investmentAmount}
                  onChange={(event) => setInvestmentAmount(event.target.value)}
                  placeholder="투자 수량을 입력해주세요."
                  inputMode="decimal"
                />
                <span>{OOWA_TOKEN.symbol}</span>
              </div>
              {investmentAmount && investmentAmountError && (
                <p className="field-error">{investmentAmountError}</p>
              )}
              {investmentBalanceError && (
                <p className="field-error">{investmentBalanceError}</p>
              )}
              {investmentProduct && !investmentProduct.investmentAvailable && (
                <p className="status error">
                  백엔드에 투자 풀 지갑이 설정되지 않아 현재 투자 기능을 사용할 수
                  없습니다.
                </p>
              )}
            </div>

            <div className="button-grid single">
              <button
                className="button"
                type="button"
                disabled={!canStartInvestment}
                onClick={() => void startUserInvestment()}
              >
                {investmentActionLoading ? "처리 중" : "투자 시작"}
              </button>
            </div>
          </section>

          <section className="panel investment-position-panel">
            <div className="section-title compact">
              <h2>내 투자 현황</h2>
            </div>
            {investmentLoading && (
              <p className="status neutral">투자 현황을 불러오는 중입니다.</p>
            )}
            {!investmentLoading && activeInvestments.length === 0 && (
              <p className="status neutral">진행 중인 투자 건이 없습니다.</p>
            )}
            {activeInvestments.length > 0 && (
              <div className="history-list">
                {activeInvestments.map((activeInvestment) => (
                  <div className="investment-active-card" key={activeInvestment.id}>
                    <div className="investment-active-head">
                      <div>
                        <p className="history-title">
                          진행 중
                          <span>
                            {activeInvestment.capReached ? "상한 도달" : "적립 중"}
                          </span>
                        </p>
                        <p className="history-time">
                          시작일 {formatHistoryDate(activeInvestment.startedAt)}
                        </p>
                      </div>
                      <strong>
                        {trimTokenAmount(activeInvestment.principalDisplay)}{" "}
                        {OOWA_TOKEN.symbol}
                      </strong>
                    </div>

                    <div className="investment-metrics-grid">
                      <div>
                        <span className="meta-label">누적 일수</span>
                        <strong>{activeInvestment.accruedDays}일</strong>
                      </div>
                      <div>
                        <span className="meta-label">누적 보상률</span>
                        <strong>{activeInvestment.accruedRatePercent.toFixed(1)}%</strong>
                      </div>
                      <div>
                        <span className="meta-label">누적 보상</span>
                        <strong>
                          {trimTokenAmount(activeInvestment.accruedRewardDisplay)}{" "}
                          {OOWA_TOKEN.symbol}
                        </strong>
                      </div>
                      <div>
                        <span className="meta-label">지금 받을 금액</span>
                        <strong>
                          {trimTokenAmount(activeInvestment.totalReturnDisplay)}{" "}
                          {OOWA_TOKEN.symbol}
                        </strong>
                      </div>
                    </div>

                    <div className="investment-metrics-grid">
                      <div>
                        <span className="meta-label">최대 보상</span>
                        <strong>
                          {trimTokenAmount(activeInvestment.maxRewardDisplay)}{" "}
                          {OOWA_TOKEN.symbol}
                        </strong>
                      </div>
                      <div>
                        <span className="meta-label">남은 보상</span>
                        <strong>
                          {trimTokenAmount(activeInvestment.remainingRewardDisplay)}{" "}
                          {OOWA_TOKEN.symbol}
                        </strong>
                      </div>
                      <div>
                        <span className="meta-label">남은 일수</span>
                        <strong>{activeInvestment.remainingDays}일</strong>
                      </div>
                      <div>
                        <span className="meta-label">최대 총 반환</span>
                        <strong>
                          {trimTokenAmount(activeInvestment.maxReturnDisplay)}{" "}
                          {OOWA_TOKEN.symbol}
                        </strong>
                      </div>
                    </div>

                    <div className="button-grid single">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={investmentActionLoading}
                        onClick={() => void stopUserInvestment(activeInvestment.id)}
                      >
                        {investmentActionLoading ? "처리 중" : "중지하고 돌려받기"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel history-panel">
            <div className="section-title compact">
              <h2>투자 내역</h2>
            </div>
            {!investmentLoading && investmentPositions.length === 0 && (
              <p className="status neutral">저장된 투자 내역이 없습니다.</p>
            )}
            {investmentPositions.length > 0 && (
              <div className="history-list">
                {investmentPositions.map((position) => (
                  <article className="history-item" key={position.id}>
                    <div>
                      <p className="history-title">
                        {position.status === "completed" ? "종료됨" : "진행 중"}
                        <span>
                          {position.capReached ? "250% 상한 관리" : "0.2% 적립"}
                        </span>
                      </p>
                      <p className="history-address">
                        원금 {trimTokenAmount(position.principalDisplay)}{" "}
                        {OOWA_TOKEN.symbol} · {position.accruedDays}일
                      </p>
                      <p className="history-time">
                        {formatHistoryDate(position.startedAt)}
                        {position.endedAt
                          ? ` → ${formatHistoryDate(position.endedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="history-side">
                      <strong>
                        {trimTokenAmount(position.totalReturnDisplay)}{" "}
                        {OOWA_TOKEN.symbol}
                      </strong>
                      <span className="summary-subtext">
                        +{trimTokenAmount(position.accruedRewardDisplay)} 보상
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {investmentTotal > INVESTMENT_LIMIT && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={investmentPage === 0}
                  onClick={() => setInvestmentPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {investmentPage + 1} / {Math.ceil(investmentTotal / INVESTMENT_LIMIT)}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(investmentPage + 1) * INVESTMENT_LIMIT >= investmentTotal}
                  onClick={() => setInvestmentPage((p) => p + 1)}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </section>
      ) : currentView === "transfer" ? (
        <section className="content-stack view-stack">
          <section className="panel transfer-panel">
            <div className="section-title">
              <div>
                <h2>결제 및 송금</h2>
                <p>보내기와 받기를 한 화면에서 쉽게 전환할 수 있습니다.</p>
              </div>
            </div>

            <div className="segmented transfer-mode-tabs">
              <button
                className={transferMode === "send" ? "active" : ""}
                type="button"
                onClick={() => setTransferMode("send")}
              >
                보내기
              </button>
              <button
                className={transferMode === "receive" ? "active" : ""}
                type="button"
                onClick={() => setTransferMode("receive")}
              >
                받기
              </button>
            </div>

            {transferMode === "send" ? (
              <div className="transfer-mode-panel">
                <div className="field">
                  <div className="field-label-row">
                    <label htmlFor="to-address">Recipient address</label>
                  </div>
                  <input
                    id="to-address"
                    value={toAddress}
                    onChange={(event) => {
                      setToAddress(event.target.value);
                      setPaymentQuote(null);
                      setResponse(null);
                    }}
                    placeholder="44 hex recipient address"
                  />
                  {toAddress && addressError && (
                    <p className="field-error">{addressError}</p>
                  )}
                  <button
                    className="button secondary qr-scan-button"
                    type="button"
                    onClick={() => openManagedOverlay("qr")}
                  >
                    <span className="qr-scan-icon">📷</span>
                    QR 코드로 주소 입력
                  </button>
                </div>
                {wallet && recipients.length > 0 && (
                  <div className="recipient-strip" aria-label="자주 보내는 주소">
                    <div className="field-label-row">
                      <span className="meta-label">자주 보내는 주소</span>
                      {historyLoading && <span className="mini-note">불러오는 중</span>}
                    </div>
                    <div className="recipient-buttons">
                      {recipients.slice(0, 5).map((recipient) => (
                        <button
                          key={recipient.id}
                          className="recipient-button"
                          type="button"
                          onClick={() => {
                            setToAddress(recipient.recipientAddress);
                            setPaymentQuote(null);
                            setResponse(null);
                          }}
                        >
                          <strong>
                            {recipient.label ??
                              shorten(recipient.recipientAddress, 6, 5)}
                          </strong>
                          <span>{recipient.sendCount}회</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="field">
                  <div className="field-label-row">
                    <label htmlFor="amount">Amount</label>
                    <button
                      className="text-button"
                      type="button"
                      disabled={!balance}
                      onClick={() => {
                        setAmount(
                          trimTokenAmount(
                            formatRawTokenAmount(balance, OOWA_TOKEN.decimals),
                          ),
                        );
                        setPaymentQuote(null);
                        setResponse(null);
                      }}
                    >
                      MAX
                    </button>
                  </div>
                  <div className="amount-input-wrap">
                    <input
                      id="amount"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setPaymentQuote(null);
                        setResponse(null);
                      }}
                      placeholder="수량을 입력해주세요."
                      inputMode="decimal"
                    />
                    <span>{OOWA_TOKEN.symbol}</span>
                  </div>
                  {amount && amountError && (
                    <p className="field-error">{amountError}</p>
                  )}
                  {balanceError && <p className="field-error">{balanceError}</p>}
                </div>
                <div className="button-grid single">
                  <button
                    className="button"
                    disabled={!canPrepareTransfer}
                    onClick={openConfirmTransfer}
                  >
                    전송 확인
                  </button>
                </div>
              </div>
            ) : (
              <div className="transfer-mode-panel">
                <div className="field">
                  <label htmlFor="receive-address">내 지갑 주소</label>
                  <div className="receive-address-card">
                    <strong>{wallet?.address ?? "-"}</strong>
                    {wallet ? (
                      <button
                        className="copy-button"
                        type="button"
                        onClick={() => void copyWalletAddress()}
                      >
                        {copiedAddress ? "완료" : "복사"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="receive-amount">요청 수량(선택)</label>
                  <div className="amount-input-wrap">
                    <input
                      id="receive-amount"
                      value={receiveAmount}
                      onChange={(event) => setReceiveAmount(event.target.value)}
                      placeholder="수량을 입력해주세요."
                      inputMode="decimal"
                    />
                    <span>{OOWA_TOKEN.symbol}</span>
                  </div>
                </div>
                <div className="receive-qr-card">
                  {wallet ? (
                    <>
                      <div className="receive-qr-box">
                        <QRCodeSVG
                          value={receiveQrData}
                          size={220}
                          includeMargin
                          bgColor="transparent"
                          fgColor="#15171a"
                        />
                      </div>
                      <p className="status neutral">
                        상대방이 이 QR을 스캔하면 내 주소가 자동으로 입력됩니다.
                      </p>
                    </>
                  ) : (
                    <p className="status neutral">로그인 후 QR을 표시할 수 있습니다.</p>
                  )}
                </div>
              </div>
            )}
            {error && <p className="status error">{error}</p>}
          </section>

        </section>
      ) : (
        <section className="content-stack view-stack">
          <section className="panel history-panel">
            <div className="section-title compact">
              <h2>거래 내역</h2>
            </div>
            <div className="segmented admin-tabs admin-filter-tabs">
              <button
                className={historyFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => { setHistoryFilter("all"); setHistoryPage(0); }}
              >
                전체
              </button>
              <button
                className={historyFilter === "transfer" ? "active" : ""}
                type="button"
                onClick={() => { setHistoryFilter("transfer"); setHistoryPage(0); }}
              >
                송금
              </button>
              <button
                className={historyFilter === "payment" ? "active" : ""}
                type="button"
                onClick={() => { setHistoryFilter("payment"); setHistoryPage(0); }}
              >
                결제
              </button>
              <button
                className={historyFilter === "investment" ? "active" : ""}
                type="button"
                onClick={() => { setHistoryFilter("investment"); setHistoryPage(0); }}
              >
                투자
              </button>
              <button
                className={historyFilter === "reward" ? "active" : ""}
                type="button"
                onClick={() => { setHistoryFilter("reward"); setHistoryPage(0); }}
              >
                보상
              </button>
            </div>
            {error && <p className="status error">{error}</p>}
            {historyLoading && (
              <p className="status neutral">히스토리를 불러오는 중입니다.</p>
            )}
            {!historyLoading && activity.length === 0 && (
              <p className="status neutral">저장된 전송 내역이 없습니다.</p>
            )}
            {activity.length > 0 && (
              <div className="history-list">
                {activity
                  .map((activityItem) => (
                  <article
                    className="history-item history-item-clickable"
                    key={`${activityItem.kind}-${activityItem.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedActivity(activityItem);
                      openManagedOverlay("txDetail");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedActivity(activityItem);
                        openManagedOverlay("txDetail");
                      }
                    }}
                  >
                    <div>
                      <p className="history-title">
                        {activityTitle(activityItem)}
                        <span>{activityStatusLabel(activityItem)}</span>
                      </p>
                      <p className="history-address">
                        {activityItem.kind === "payment" ? (
                          <>
                            To {shorten(activityItem.payment.merchantWalletAddress)}
                          </>
                        ) : (
                          <>
                            {activityItem.transaction.direction === "incoming" ? "From " : "To "}
                            {shorten(
                              activityItem.transaction.direction === "incoming"
                                ? activityItem.transaction.fromAddress
                                : activityItem.transaction.toAddress,
                            )}
                          </>
                        )}
                      </p>
                      <p className="history-time">
                        {formatHistoryDate(
                          activityItem.kind === "payment"
                            ? activityItem.payment.completedAt ??
                                activityItem.payment.updatedAt ??
                                activityItem.payment.createdAt
                            : activityItem.transaction.chainTimestamp ??
                                activityItem.transaction.createdAt,
                        )}
                        {activityItem.kind === "transaction" &&
                        activityItem.transaction.blockHeight
                          ? ` · block ${activityItem.transaction.blockHeight}`
                          : ""}
                      </p>
                    </div>
                    <div className="history-side">
                      <strong>
                        {activityItem.kind === "payment"
                          ? trimTokenAmount(activityItem.payment.totalAmountDisplay)
                          : trimTokenAmount(activityItem.transaction.amountDisplay)}{" "}
                        {activityItem.kind === "payment"
                          ? OOWA_TOKEN.symbol
                          : activityItem.transaction.tokenSymbol}
                      </strong>
                      <span className="history-arrow">›</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {historyTotal > HISTORY_LIMIT && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {historyPage + 1} / {Math.ceil(historyTotal / HISTORY_LIMIT)}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(historyPage + 1) * HISTORY_LIMIT >= historyTotal}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </section>
      )}

      <BottomNavigation
        currentView={currentView}
        onChange={handleViewChange}
      />
    </main>
  );
}
