"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminSession, loginAdmin, logoutAdmin } from "@/lib/adminAuthApi";
import {
  getAdminInvestments,
  getAdminInvestmentSummary,
  getAdminMerchantChangeRequests,
  adminResetUserPassword,
  adminUpdateUserStatus,
  getAdminMerchantProfiles,
  getAdminPayments,
  getAdminUserDetail,
  getAdminUsers,
  reviewAdminMerchantChangeRequest,
  reviewAdminMerchantProfile,
} from "@/lib/historyApi";
import type {
  MerchantProfile,
  MerchantProfileChangeRequest,
} from "@/types/auth";
import type {
  AdminInvestmentRecord,
  AdminInvestmentSummaryResponse,
  AdminPaymentsResponse,
  AdminUserDetailResponse,
  AdminUserRecord,
} from "@/types/history";

const ADMIN_TOKEN_STORAGE = "oowa-admin-token";

const shorten = (value: string, head = 8, tail = 6): string =>
  `${value.slice(0, head)}...${value.slice(-tail)}`;

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "대기 중";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const userStatusLabel = (status: AdminUserRecord["status"]) => {
  switch (status) {
    case "active":
      return "정상";
    case "disabled":
      return "비활성화";
    case "deleted":
      return "탈퇴 처리";
    default:
      return status;
  }
};

const paymentStatusLabel = (status: string) => {
  switch (status) {
    case "partial_failed":
      return "일부 실패";
    case "failed":
      return "실패";
    case "completed":
      return "완료";
    case "processing":
      return "처리 중";
    case "created":
      return "생성됨";
    default:
      return status;
  }
};

const paymentTypeLabel = (paymentType: "standard" | "merchant") =>
  paymentType === "merchant" ? "가맹점 결제" : "일반 송금";

const merchantStatusLabel = (status: MerchantProfile["status"]) => {
  switch (status) {
    case "draft":
      return "대기";
    case "pending":
      return "대기";
    case "approved":
      return "승인";
    case "denied":
      return "반려";
    default:
      return status;
  }
};

type AdminTab = "users" | "merchants" | "payments" | "investments";
type MerchantFilter = "all" | "pending" | "approved" | "denied";
type PaymentFilter = "all" | "completed" | "failed" | "partial_failed" | "processing";
type PaymentTypeFilter = "all" | "standard" | "merchant";
type InvestmentFilter = "all" | "active" | "completed" | "payout_failed";

const merchantFilterToStatuses = (filter: MerchantFilter): string[] => {
  switch (filter) {
    case "pending":
      return ["draft", "pending"];
    case "approved":
      return ["approved"];
    case "denied":
      return ["denied"];
    case "all":
    default:
      return ["draft", "pending", "approved", "denied"];
  }
};

const paymentFilterToStatuses = (filter: PaymentFilter): string[] => {
  switch (filter) {
    case "completed":
      return ["completed"];
    case "failed":
      return ["failed"];
    case "partial_failed":
      return ["partial_failed"];
    case "processing":
      return ["created", "processing"];
    case "all":
    default:
      return ["created", "processing", "completed", "failed", "partial_failed"];
  }
};

const investmentStatusLabel = (status: AdminInvestmentRecord["adminStatus"]) => {
  switch (status) {
    case "active":
      return "진행 중";
    case "completed":
      return "종료 완료";
    case "payout_failed":
      return "지급 실패";
    default:
      return status;
  }
};

const investmentFilterToStatuses = (filter: InvestmentFilter): string[] => {
  switch (filter) {
    case "active":
      return ["active"];
    case "completed":
      return ["completed"];
    case "payout_failed":
      return ["payout_failed"];
    case "all":
    default:
      return ["active", "completed", "payout_failed"];
  }
};

export default function AdminPage() {
  const [adminPassword, setAdminPassword] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [currentTab, setCurrentTab] = useState<AdminTab>("users");
  const [userSearch, setUserSearch] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [paymentTypeFilter, setPaymentTypeFilter] =
    useState<PaymentTypeFilter>("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [investmentFilter, setInvestmentFilter] = useState<InvestmentFilter>("all");
  const [investmentSearch, setInvestmentSearch] = useState("");
  const [passwordResetValue, setPasswordResetValue] = useState("");
  const [investmentSummary, setInvestmentSummary] =
    useState<AdminInvestmentSummaryResponse | null>(null);
  const [investments, setInvestments] = useState<AdminInvestmentRecord[]>([]);
  const [investmentsTotal, setInvestmentsTotal] = useState(0);
  const [investmentsPage, setInvestmentsPage] = useState(0);
  const [investmentsLimit, setInvestmentsLimit] = useState(20);
  const [selectedInvestment, setSelectedInvestment] =
    useState<AdminInvestmentRecord | null>(null);
  const [showInvestmentDetailModal, setShowInvestmentDetailModal] = useState(false);
  const [payments, setPayments] = useState<AdminPaymentsResponse["payments"]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(0);
  const [paymentsLimit, setPaymentsLimit] = useState(20);
  const [selectedPayment, setSelectedPayment] =
    useState<AdminPaymentsResponse["payments"][number] | null>(null);
  const [showPaymentDetailModal, setShowPaymentDetailModal] = useState(false);
  const [merchantProfiles, setMerchantProfiles] = useState<MerchantProfile[]>([]);
  const [merchantChangeRequests, setMerchantChangeRequests] = useState<
    MerchantProfileChangeRequest[]
  >([]);
  const [merchantChangeRequestsTotal, setMerchantChangeRequestsTotal] = useState(0);
  const [merchantChangeRequestsPage, setMerchantChangeRequestsPage] = useState(0);
  const [merchantChangeRequestsLimit, setMerchantChangeRequestsLimit] = useState(20);
  const [merchantsTotal, setMerchantsTotal] = useState(0);
  const [merchantsPage, setMerchantsPage] = useState(0);
  const [merchantsLimit, setMerchantsLimit] = useState(20);
  const [merchantFilter, setMerchantFilter] = useState<MerchantFilter>("all");
  const [selectedMerchantProfile, setSelectedMerchantProfile] =
    useState<MerchantProfile | null>(null);
  const [showMerchantDetailModal, setShowMerchantDetailModal] = useState(false);
  const [merchantReviewNote, setMerchantReviewNote] = useState("");
  const [selectedMerchantChangeRequest, setSelectedMerchantChangeRequest] =
    useState<MerchantProfileChangeRequest | null>(null);
  const [showMerchantChangeRequestModal, setShowMerchantChangeRequestModal] =
    useState(false);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [usersLimit, setUsersLimit] = useState(20);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] =
    useState<AdminUserDetailResponse | null>(null);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_TOKEN_STORAGE);
    if (!saved) {
      setAuthChecking(false);
      return;
    }

    void getAdminSession(saved)
      .then(() => {
        setAdminToken(saved);
      })
      .catch(() => {
        sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  const loadUsers = useCallback(
    async (token: string, search: string, page: number, limit: number) => {
      if (!token.trim()) return;
      setLoading(true);
      setError("");
      try {
        const result = await getAdminUsers({ adminToken: token.trim(), search, page, limit });
        setUsers(result.users);
        setUsersTotal(result.total);
      } catch (err) {
        setUsers([]);
        setUsersTotal(0);
        setError(err instanceof Error ? err.message : "회원 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadMerchants = useCallback(
    async (
      token: string,
      filter: MerchantFilter,
      search: string,
      page: number,
      limit: number,
    ) => {
      if (!token.trim()) return;
      setLoading(true);
      setError("");
      try {
        const result = await getAdminMerchantProfiles({
          adminToken: token.trim(),
          statuses: merchantFilterToStatuses(filter),
          search,
          page,
          limit,
        });
        setMerchantProfiles(result.profiles);
        setMerchantsTotal(result.total);
      } catch (err) {
        setMerchantProfiles([]);
        setMerchantsTotal(0);
        setError(err instanceof Error ? err.message : "가맹점 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadMerchantChangeRequests = useCallback(
    async (token: string, search: string, page: number, limit: number) => {
      if (!token.trim()) return;
      setLoading(true);
      setError("");
      try {
        const result = await getAdminMerchantChangeRequests({
          adminToken: token.trim(),
          statuses: ["pending"],
          search,
          page,
          limit,
        });
        setMerchantChangeRequests(result.changeRequests);
        setMerchantChangeRequestsTotal(result.total);
      } catch (err) {
        setMerchantChangeRequests([]);
        setMerchantChangeRequestsTotal(0);
        setError(err instanceof Error ? err.message : "변경 요청 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadPayments = useCallback(
    async (
      token: string,
      filter: PaymentFilter,
      paymentType: PaymentTypeFilter,
      search: string,
      page: number,
      limit: number,
    ) => {
      if (!token.trim()) return;
      setLoading(true);
      setError("");
      try {
        const result = await getAdminPayments({
          adminToken: token.trim(),
          statuses: paymentFilterToStatuses(filter),
          paymentType,
          search,
          page,
          limit,
        });
        setPayments(result.payments);
        setPaymentsTotal(result.total);
      } catch (err) {
        setPayments([]);
        setPaymentsTotal(0);
        setError(err instanceof Error ? err.message : "결제 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadInvestmentSummary = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await getAdminInvestmentSummary({ adminToken: token.trim() });
      setInvestmentSummary(result);
    } catch (err) {
      setInvestmentSummary(null);
      setError(err instanceof Error ? err.message : "투자 요약을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvestments = useCallback(
    async (
      token: string,
      filter: InvestmentFilter,
      search: string,
      page: number,
      limit: number,
    ) => {
      if (!token.trim()) return;
      setLoading(true);
      setError("");
      try {
        const result = await getAdminInvestments({
          adminToken: token.trim(),
          statuses: investmentFilterToStatuses(filter),
          search,
          page,
          limit,
        });
        setInvestments(result.investments);
        setInvestmentsTotal(result.total);
      } catch (err) {
        setInvestments([]);
        setInvestmentsTotal(0);
        setError(err instanceof Error ? err.message : "투자 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadUserDetail = useCallback(async (token: string, userId: string) => {
    if (!token.trim() || !userId) {
      return;
    }

    setDetailLoading(true);
    setError("");
    try {
      const detail = await getAdminUserDetail({
        adminToken: token.trim(),
        userId,
      });
      setSelectedUserDetail(detail);
    } catch (err) {
      setSelectedUserDetail(null);
      setError(err instanceof Error ? err.message : "회원 상세를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    void loadUsers(adminToken, userSearch, usersPage, usersLimit);
  }, [adminToken, loadUsers, userSearch, usersPage, usersLimit]);

  useEffect(() => {
    if (!adminToken) return;
    void loadMerchants(
      adminToken,
      merchantFilter,
      merchantSearch,
      merchantsPage,
      merchantsLimit,
    );
  }, [
    adminToken,
    loadMerchants,
    merchantFilter,
    merchantSearch,
    merchantsPage,
    merchantsLimit,
  ]);

  useEffect(() => {
    if (!adminToken) return;
    void loadMerchantChangeRequests(
      adminToken,
      merchantSearch,
      merchantChangeRequestsPage,
      merchantChangeRequestsLimit,
    );
  }, [
    adminToken,
    loadMerchantChangeRequests,
    merchantSearch,
    merchantChangeRequestsPage,
    merchantChangeRequestsLimit,
  ]);

  useEffect(() => {
    if (!adminToken) return;
    void loadPayments(
      adminToken,
      paymentFilter,
      paymentTypeFilter,
      paymentSearch,
      paymentsPage,
      paymentsLimit,
    );
  }, [
    adminToken,
    loadPayments,
    paymentFilter,
    paymentTypeFilter,
    paymentSearch,
    paymentsPage,
    paymentsLimit,
  ]);

  useEffect(() => {
    if (!adminToken) return;
    void loadInvestmentSummary(adminToken);
  }, [adminToken, loadInvestmentSummary]);

  useEffect(() => {
    if (!adminToken) return;
    void loadInvestments(
      adminToken,
      investmentFilter,
      investmentSearch,
      investmentsPage,
      investmentsLimit,
    );
  }, [
    adminToken,
    loadInvestments,
    investmentFilter,
    investmentSearch,
    investmentsPage,
    investmentsLimit,
  ]);

  // 현재 탭 데이터를 최신 상태로 다시 불러오는 콜백
  const refreshCurrentTab = useCallback(() => {
    if (!adminToken) return;
    switch (currentTab) {
      case "users":
        void loadUsers(adminToken, userSearch, usersPage, usersLimit);
        break;
      case "merchants":
        void loadMerchants(
          adminToken,
          merchantFilter,
          merchantSearch,
          merchantsPage,
          merchantsLimit,
        );
        void loadMerchantChangeRequests(
          adminToken,
          merchantSearch,
          merchantChangeRequestsPage,
          merchantChangeRequestsLimit,
        );
        break;
      case "payments":
        void loadPayments(
          adminToken,
          paymentFilter,
          paymentTypeFilter,
          paymentSearch,
          paymentsPage,
          paymentsLimit,
        );
        break;
      case "investments":
        void loadInvestmentSummary(adminToken);
        void loadInvestments(
          adminToken,
          investmentFilter,
          investmentSearch,
          investmentsPage,
          investmentsLimit,
        );
        break;
    }
  }, [
    adminToken,
    currentTab,
    userSearch,
    usersPage,
    usersLimit,
    merchantFilter,
    merchantSearch,
    merchantsPage,
    merchantsLimit,
    merchantChangeRequestsPage,
    merchantChangeRequestsLimit,
    paymentFilter,
    paymentTypeFilter,
    paymentSearch,
    paymentsPage,
    paymentsLimit,
    investmentFilter,
    investmentSearch,
    investmentsPage,
    investmentsLimit,
    loadUsers,
    loadMerchants,
    loadMerchantChangeRequests,
    loadPayments,
    loadInvestmentSummary,
    loadInvestments,
  ]);

  // ref를 항상 최신 콜백으로 동기화 (stale closure 방지)
  const refreshCurrentTabRef = useRef(refreshCurrentTab);
  useEffect(() => {
    refreshCurrentTabRef.current = refreshCurrentTab;
  });

  // 어드민 탭 전환 시 해당 탭 즉시 갱신
  useEffect(() => {
    refreshCurrentTabRef.current();
  }, [currentTab]);

  // 브라우저 탭 돌아왔을 때 현재 탭 즉시 갱신
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshCurrentTabRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const handleAdminLogin = async () => {
    if (adminPassword.trim().length < 1) {
      setError("관리자 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await loginAdmin({ password: adminPassword.trim() });
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE, result.token);
      setAdminToken(result.token);
      setAdminPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "관리자 로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    const token = adminToken;
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
    setAdminToken("");
    setUsers([]);
    setInvestmentSummary(null);
    setInvestments([]);
    setInvestmentsTotal(0);
    setSelectedInvestment(null);
    setShowInvestmentDetailModal(false);
    setPayments([]);
    setSelectedPayment(null);
    setShowPaymentDetailModal(false);
    setMerchantProfiles([]);
    setMerchantChangeRequests([]);
    setSelectedMerchantProfile(null);
    setShowMerchantDetailModal(false);
    setSelectedMerchantChangeRequest(null);
    setShowMerchantChangeRequestModal(false);
    setMerchantReviewNote("");
    setSelectedUserId("");
    setSelectedUserDetail(null);
    setShowUserDetailModal(false);
    setError("");

    if (!token) {
      return;
    }

    try {
      await logoutAdmin(token);
    } catch {
      // 로컬 로그아웃 우선
    }
  };

  const handleReviewMerchant = async ({
    walletAddress,
    action,
  }: {
    walletAddress: string;
    action: "approve" | "deny";
  }) => {
    if (!adminToken.trim()) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await reviewAdminMerchantProfile({
        adminToken: adminToken.trim(),
        walletAddress,
        action,
        reviewNote: merchantReviewNote.trim() || undefined,
      });
      await loadMerchants(
        adminToken,
        merchantFilter,
        merchantSearch,
        merchantsPage,
        merchantsLimit,
      );
      if (selectedMerchantProfile?.walletAddress === walletAddress) {
        setSelectedMerchantProfile((current) =>
          current
            ? {
                ...current,
                status: action === "approve" ? "approved" : "denied",
                reviewNote: merchantReviewNote.trim() || current.reviewNote,
              }
            : current,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "가맹점 심사를 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleReviewMerchantChangeRequest = async ({
    walletAddress,
    action,
  }: {
    walletAddress: string;
    action: "approve" | "deny";
  }) => {
    if (!adminToken.trim()) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await reviewAdminMerchantChangeRequest({
        adminToken: adminToken.trim(),
        walletAddress,
        action,
        reviewNote: merchantReviewNote.trim() || undefined,
      });
      await Promise.all([
        loadMerchantChangeRequests(
          adminToken,
          merchantSearch,
          merchantChangeRequestsPage,
          merchantChangeRequestsLimit,
        ),
        loadMerchants(
          adminToken,
          merchantFilter,
          merchantSearch,
          merchantsPage,
          merchantsLimit,
        ),
      ]);
      closeMerchantChangeRequestModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경 요청 심사를 처리하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async ({
    action,
    userId,
  }: {
    action: "enable" | "disable" | "delete";
    userId: string;
  }) => {
    if (!adminToken.trim()) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }

    setDetailLoading(true);
    setError("");
    try {
      const detail = await adminUpdateUserStatus({
        adminToken: adminToken.trim(),
        userId,
        action,
      });
      setSelectedUserId(detail.user.id);
      setSelectedUserDetail(detail);
      await loadUsers(adminToken, userSearch, usersPage, usersLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원 상태를 변경하지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!adminToken.trim()) {
      setError("관리자 로그인이 필요합니다.");
      return;
    }
    if (!selectedUserId) {
      setError("회원 상세를 먼저 선택해주세요.");
      return;
    }
    if (passwordResetValue.trim().length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setDetailLoading(true);
    setError("");
    try {
      const detail = await adminResetUserPassword({
        adminToken: adminToken.trim(),
        userId: selectedUserId,
        nextPassword: passwordResetValue.trim(),
      });
      setSelectedUserDetail(detail);
      setPasswordResetValue("");
      await loadUsers(adminToken, userSearch, usersPage, usersLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호를 재설정하지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeUserDetailModal = () => {
    setShowUserDetailModal(false);
    setPasswordResetValue("");
  };

  const openMerchantDetailModal = (profile: MerchantProfile) => {
    setSelectedMerchantProfile(profile);
    setMerchantReviewNote(profile.reviewNote ?? "");
    setShowMerchantDetailModal(true);
  };

  const openMerchantChangeRequestModal = (
    changeRequest: MerchantProfileChangeRequest,
  ) => {
    setSelectedMerchantChangeRequest(changeRequest);
    setMerchantReviewNote(changeRequest.reviewNote ?? "");
    setShowMerchantChangeRequestModal(true);
  };

  const closeMerchantDetailModal = () => {
    setShowMerchantDetailModal(false);
    setSelectedMerchantProfile(null);
    setMerchantReviewNote("");
  };

  const closeMerchantChangeRequestModal = () => {
    setShowMerchantChangeRequestModal(false);
    setSelectedMerchantChangeRequest(null);
    setMerchantReviewNote("");
  };

  const openPaymentDetailModal = (
    payment: AdminPaymentsResponse["payments"][number],
  ) => {
    setSelectedPayment(payment);
    setShowPaymentDetailModal(true);
  };

  const closePaymentDetailModal = () => {
    setShowPaymentDetailModal(false);
    setSelectedPayment(null);
  };

  const openInvestmentDetailModal = (investment: AdminInvestmentRecord) => {
    setSelectedInvestment(investment);
    setShowInvestmentDetailModal(true);
  };

  const closeInvestmentDetailModal = () => {
    setShowInvestmentDetailModal(false);
    setSelectedInvestment(null);
  };

  if (authChecking) {
    return (
      <main className="app-shell">
        <section className="panel">
          <p className="status neutral">관리자 세션을 확인하는 중입니다.</p>
        </section>
      </main>
    );
  }

  if (!adminToken) {
    return (
      <main className="app-shell">
        <header className="app-topbar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <p className="eyebrow">OOWA Admin</p>
              <h1>운영 관리</h1>
            </div>
          </div>
        </header>

        <section className="panel auth-modal-panel">
          <div className="section-title compact">
            <h2>관리자 로그인</h2>
          </div>
          <div className="field">
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input
              id="admin-password"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="관리자 비밀번호 입력"
            />
          </div>
          <div className="button-grid single">
            <button
              className="button"
              type="button"
              disabled={loading}
              onClick={() => void handleAdminLogin()}
            >
              {loading ? "확인 중" : "로그인"}
            </button>
          </div>
          {error && <p className="status error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">OOWA Admin</p>
            <h1>운영 관리</h1>
          </div>
        </div>
        <button
          className="icon-text-button"
          type="button"
          onClick={handleAdminLogout}
        >
          <span className="button-icon">−</span>
          로그아웃
        </button>
      </header>

      <section className="panel">
        <div className="section-title compact">
          <h2>관리자 메뉴</h2>
        </div>
        <div className="segmented admin-tabs">
          <button
            className={currentTab === "users" ? "active" : ""}
            type="button"
            onClick={() => setCurrentTab("users")}
          >
            회원관리
          </button>
          <button
            className={currentTab === "merchants" ? "active" : ""}
            type="button"
            onClick={() => setCurrentTab("merchants")}
          >
            가맹점 신청
          </button>
          <button
            className={currentTab === "payments" ? "active" : ""}
            type="button"
            onClick={() => setCurrentTab("payments")}
          >
            결제관리
          </button>
          <button
            className={currentTab === "investments" ? "active" : ""}
            type="button"
            onClick={() => setCurrentTab("investments")}
          >
            투자관리
          </button>
        </div>
        {error && <p className="status error">{error}</p>}
      </section>

      {currentTab === "users" && (
        <section className="content-stack view-stack">
          <section className="panel">
            <div className="section-title compact">
              <h2>회원 목록</h2>
            </div>
            <div className="field">
              <label htmlFor="user-search">회원 검색</label>
              <input
                id="user-search"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="이름, 아이디, 전화번호, 지갑 주소"
              />
            </div>
            {loading && <p className="status neutral">불러오는 중입니다.</p>}
            {!loading && !error && users.length === 0 && (
              <p className="status neutral">조회된 회원이 없습니다.</p>
            )}
            {users.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>아이디</th>
                      <th>상태</th>
                      <th>가맹점 상태</th>
                      <th>최근 로그인</th>
                      <th>활성 투자</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.loginId}</td>
                        <td>{userStatusLabel(user.status)}</td>
                        <td>{user.merchantProfileStatus ?? "일반 사용자"}</td>
                        <td>{formatDateTime(user.lastLoginAt)}</td>
                        <td>{user.activeInvestmentCount}건</td>
                        <td>
                          <button
                            className="copy-button"
                            type="button"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setShowUserDetailModal(true);
                              void loadUserDetail(adminToken, user.id);
                            }}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {users.length > 0 && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={usersPage === 0}
                  onClick={() => setUsersPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {usersPage + 1} / {Math.max(1, Math.ceil(usersTotal / usersLimit))}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(usersPage + 1) * usersLimit >= usersTotal}
                  onClick={() => setUsersPage((p) => p + 1)}
                >
                  다음
                </button>
                <select
                  className="pagination-size-select"
                  value={usersLimit}
                  onChange={(e) => { setUsersLimit(Number(e.target.value)); setUsersPage(0); }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}개씩</option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-title compact">
              <h2>회원 안내</h2>
            </div>
            <p className="status neutral">
              회원 목록에서 <strong>상세</strong>를 누르면 팝업으로 상세정보를 확인할
              수 있습니다.
            </p>
          </section>
        </section>
      )}

      {currentTab === "merchants" && (
        <section className="content-stack view-stack">
          <section className="panel">
            <div className="section-title compact">
              <h2>가맹점 신청/검토</h2>
            </div>
            <div className="field">
              <label htmlFor="merchant-search">가맹점 검색</label>
              <input
                id="merchant-search"
                value={merchantSearch}
                onChange={(event) => {
                  setMerchantSearch(event.target.value);
                  setMerchantsPage(0);
                  setMerchantChangeRequestsPage(0);
                }}
                placeholder="상호명, 카테고리, 주소, 지갑 주소, 연락처"
              />
            </div>
            <div className="segmented admin-tabs admin-filter-tabs">
              <button
                className={merchantFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => { setMerchantFilter("all"); setMerchantsPage(0); }}
              >
                전체
              </button>
              <button
                className={merchantFilter === "pending" ? "active" : ""}
                type="button"
                onClick={() => { setMerchantFilter("pending"); setMerchantsPage(0); }}
              >
                대기
              </button>
              <button
                className={merchantFilter === "approved" ? "active" : ""}
                type="button"
                onClick={() => { setMerchantFilter("approved"); setMerchantsPage(0); }}
              >
                승인
              </button>
              <button
                className={merchantFilter === "denied" ? "active" : ""}
                type="button"
                onClick={() => { setMerchantFilter("denied"); setMerchantsPage(0); }}
              >
                반려
              </button>
            </div>
            {loading && <p className="status neutral">불러오는 중입니다.</p>}
            {!loading && !error && merchantProfiles.length === 0 && (
              <p className="status neutral">현재 검토할 가맹점이 없습니다.</p>
            )}
            {merchantProfiles.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>상호명</th>
                      <th>카테고리</th>
                      <th>상태</th>
                      <th>연락처</th>
                      <th>수정일</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantProfiles.map((profile) => (
                      <tr key={profile.walletAddress}>
                        <td>{profile.merchantName ?? "가맹점 신청"}</td>
                        <td>{profile.category ?? "미입력"}</td>
                        <td>{merchantStatusLabel(profile.status)}</td>
                        <td>{profile.phone ?? "-"}</td>
                        <td>{formatDateTime(profile.updatedAt)}</td>
                        <td>
                          <button
                            className="copy-button"
                            type="button"
                            onClick={() => openMerchantDetailModal(profile)}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {merchantProfiles.length > 0 && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={merchantsPage === 0}
                  onClick={() => setMerchantsPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {merchantsPage + 1} / {Math.max(1, Math.ceil(merchantsTotal / merchantsLimit))}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(merchantsPage + 1) * merchantsLimit >= merchantsTotal}
                  onClick={() => setMerchantsPage((p) => p + 1)}
                >
                  다음
                </button>
                <select
                  className="pagination-size-select"
                  value={merchantsLimit}
                  onChange={(e) => { setMerchantsLimit(Number(e.target.value)); setMerchantsPage(0); }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}개씩</option>
                  ))}
                </select>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-title compact">
              <h2>가맹점 정보 변경 요청</h2>
            </div>
            {loading && <p className="status neutral">불러오는 중입니다.</p>}
            {!loading && !error && merchantChangeRequests.length === 0 && (
              <p className="status neutral">대기 중인 변경 요청이 없습니다.</p>
            )}
            {merchantChangeRequests.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>상호명</th>
                      <th>카테고리</th>
                      <th>연락처</th>
                      <th>수정일</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantChangeRequests.map((changeRequest) => (
                      <tr key={changeRequest.walletAddress}>
                        <td>{changeRequest.merchantName ?? "변경 요청"}</td>
                        <td>{changeRequest.category ?? "미입력"}</td>
                        <td>{changeRequest.phone ?? "-"}</td>
                        <td>{formatDateTime(changeRequest.updatedAt)}</td>
                        <td>
                          <button
                            className="copy-button"
                            type="button"
                            onClick={() => openMerchantChangeRequestModal(changeRequest)}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {merchantChangeRequests.length > 0 && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={merchantChangeRequestsPage === 0}
                  onClick={() => setMerchantChangeRequestsPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {merchantChangeRequestsPage + 1} /{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      merchantChangeRequestsTotal / merchantChangeRequestsLimit,
                    ),
                  )}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={
                    (merchantChangeRequestsPage + 1) * merchantChangeRequestsLimit >=
                    merchantChangeRequestsTotal
                  }
                  onClick={() => setMerchantChangeRequestsPage((p) => p + 1)}
                >
                  다음
                </button>
                <select
                  className="pagination-size-select"
                  value={merchantChangeRequestsLimit}
                  onChange={(e) => {
                    setMerchantChangeRequestsLimit(Number(e.target.value));
                    setMerchantChangeRequestsPage(0);
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}개씩
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>
        </section>
      )}

      {currentTab === "payments" && (
        <section className="content-stack view-stack">
          <section className="panel">
            <div className="section-title compact">
              <h2>결제관리</h2>
            </div>
            <div className="field">
              <label htmlFor="payment-search">결제 검색</label>
              <input
                id="payment-search"
                value={paymentSearch}
                onChange={(event) => {
                  setPaymentSearch(event.target.value);
                  setPaymentsPage(0);
                }}
                placeholder="주문번호, 결제자 주소, 수신자 주소, 실패 사유"
              />
            </div>
            <div className="segmented admin-tabs admin-filter-tabs">
              <button
                className={paymentTypeFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentTypeFilter("all"); setPaymentsPage(0); }}
              >
                전체 유형
              </button>
              <button
                className={paymentTypeFilter === "standard" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentTypeFilter("standard"); setPaymentsPage(0); }}
              >
                일반 송금
              </button>
              <button
                className={paymentTypeFilter === "merchant" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentTypeFilter("merchant"); setPaymentsPage(0); }}
              >
                가맹점 결제
              </button>
            </div>
            <div className="segmented admin-tabs admin-filter-tabs">
              <button
                className={paymentFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentFilter("all"); setPaymentsPage(0); }}
              >
                전체
              </button>
              <button
                className={paymentFilter === "completed" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentFilter("completed"); setPaymentsPage(0); }}
              >
                성공
              </button>
              <button
                className={paymentFilter === "failed" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentFilter("failed"); setPaymentsPage(0); }}
              >
                실패
              </button>
              <button
                className={paymentFilter === "partial_failed" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentFilter("partial_failed"); setPaymentsPage(0); }}
              >
                일부 실패
              </button>
              <button
                className={paymentFilter === "processing" ? "active" : ""}
                type="button"
                onClick={() => { setPaymentFilter("processing"); setPaymentsPage(0); }}
              >
                처리 중
              </button>
            </div>
            {loading && <p className="status neutral">불러오는 중입니다.</p>}
            {!loading && !error && payments.length === 0 && (
              <p className="status neutral">조건에 맞는 결제가 없습니다.</p>
            )}
            {payments.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>주문번호</th>
                      <th>유형</th>
                      <th>상태</th>
                      <th>결제자</th>
                      <th>수신자</th>
                      <th>금액</th>
                      <th>수정일</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{shorten(payment.id, 6, 5)}</td>
                        <td>{paymentTypeLabel(payment.paymentType)}</td>
                        <td>{paymentStatusLabel(payment.status)}</td>
                        <td>{shorten(payment.payerWalletAddress, 8, 5)}</td>
                        <td>{shorten(payment.merchantWalletAddress, 8, 5)}</td>
                        <td>{payment.totalAmountDisplay} OOWA</td>
                        <td>{formatDateTime(payment.updatedAt)}</td>
                        <td>
                          <button
                            className="copy-button"
                            type="button"
                            onClick={() => openPaymentDetailModal(payment)}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {payments.length > 0 && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={paymentsPage === 0}
                  onClick={() => setPaymentsPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {paymentsPage + 1} / {Math.max(1, Math.ceil(paymentsTotal / paymentsLimit))}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(paymentsPage + 1) * paymentsLimit >= paymentsTotal}
                  onClick={() => setPaymentsPage((p) => p + 1)}
                >
                  다음
                </button>
                <select
                  className="pagination-size-select"
                  value={paymentsLimit}
                  onChange={(e) => { setPaymentsLimit(Number(e.target.value)); setPaymentsPage(0); }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}개씩</option>
                  ))}
                </select>
              </div>
            )}
          </section>
        </section>
      )}

      {currentTab === "investments" && (
        <section className="content-stack view-stack">
          <section className="panel">
            <div className="section-title compact">
              <h2>투자 요약</h2>
            </div>
            {investmentSummary && (
              <div className="investment-summary-grid">
                <div className="investment-summary-card">
                  <span>활성 투자</span>
                  <strong>{investmentSummary.activeCount}건</strong>
                </div>
                <div className="investment-summary-card">
                  <span>총 원금</span>
                  <strong>{investmentSummary.principalTotalDisplay} OOWA</strong>
                </div>
                <div className="investment-summary-card">
                  <span>누적 보상</span>
                  <strong>{investmentSummary.accruedRewardTotalDisplay} OOWA</strong>
                </div>
                <div className="investment-summary-card">
                  <span>지급 예정 총액</span>
                  <strong>{investmentSummary.totalReturnTotalDisplay} OOWA</strong>
                </div>
                <div className="investment-summary-card">
                  <span>종료 완료</span>
                  <strong>{investmentSummary.completedCount}건</strong>
                </div>
                <div className="investment-summary-card">
                  <span>지급 실패</span>
                  <strong>{investmentSummary.failedCount}건</strong>
                </div>
              </div>
            )}
            {!loading && !investmentSummary && (
              <p className="status neutral">투자 요약을 불러오지 못했습니다.</p>
            )}
          </section>

          <section className="panel">
            <div className="section-title compact">
              <h2>투자 목록</h2>
            </div>
            <div className="field">
              <label htmlFor="investment-search">투자 검색</label>
              <input
                id="investment-search"
                value={investmentSearch}
                onChange={(event) => {
                  setInvestmentSearch(event.target.value);
                  setInvestmentsPage(0);
                }}
                placeholder="이름, 아이디, 전화번호, 지갑 주소, txhash"
              />
            </div>
            <div className="segmented admin-tabs admin-filter-tabs">
              <button
                className={investmentFilter === "all" ? "active" : ""}
                type="button"
                onClick={() => {
                  setInvestmentFilter("all");
                  setInvestmentsPage(0);
                }}
              >
                전체
              </button>
              <button
                className={investmentFilter === "active" ? "active" : ""}
                type="button"
                onClick={() => {
                  setInvestmentFilter("active");
                  setInvestmentsPage(0);
                }}
              >
                진행 중
              </button>
              <button
                className={investmentFilter === "completed" ? "active" : ""}
                type="button"
                onClick={() => {
                  setInvestmentFilter("completed");
                  setInvestmentsPage(0);
                }}
              >
                종료 완료
              </button>
              <button
                className={investmentFilter === "payout_failed" ? "active" : ""}
                type="button"
                onClick={() => {
                  setInvestmentFilter("payout_failed");
                  setInvestmentsPage(0);
                }}
              >
                지급 실패
              </button>
            </div>
            {loading && <p className="status neutral">불러오는 중입니다.</p>}
            {!loading && !error && investments.length === 0 && (
              <p className="status neutral">조건에 맞는 투자 건이 없습니다.</p>
            )}
            {investments.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>회원</th>
                      <th>상태</th>
                      <th>원금</th>
                      <th>경과일</th>
                      <th>누적 보상</th>
                      <th>지급 예정액</th>
                      <th>시작일</th>
                      <th>상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map((investment) => (
                      <tr key={investment.id}>
                        <td>{investment.user.name}</td>
                        <td>{investmentStatusLabel(investment.adminStatus)}</td>
                        <td>{investment.principalDisplay} OOWA</td>
                        <td>{investment.accruedDays}일</td>
                        <td>{investment.accruedRewardDisplay} OOWA</td>
                        <td>{investment.totalReturnDisplay} OOWA</td>
                        <td>{formatDateTime(investment.startedAt)}</td>
                        <td>
                          <button
                            className="copy-button"
                            type="button"
                            onClick={() => openInvestmentDetailModal(investment)}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {investments.length > 0 && (
              <div className="history-pagination">
                <button
                  className="button secondary small"
                  type="button"
                  disabled={investmentsPage === 0}
                  onClick={() => setInvestmentsPage((p) => p - 1)}
                >
                  이전
                </button>
                <span className="pagination-info">
                  {investmentsPage + 1} /{" "}
                  {Math.max(1, Math.ceil(investmentsTotal / investmentsLimit))}
                </span>
                <button
                  className="button secondary small"
                  type="button"
                  disabled={(investmentsPage + 1) * investmentsLimit >= investmentsTotal}
                  onClick={() => setInvestmentsPage((p) => p + 1)}
                >
                  다음
                </button>
                <select
                  className="pagination-size-select"
                  value={investmentsLimit}
                  onChange={(e) => {
                    setInvestmentsLimit(Number(e.target.value));
                    setInvestmentsPage(0);
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}개씩
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>
        </section>
      )}

      {showInvestmentDetailModal && selectedInvestment && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeInvestmentDetailModal();
            }
          }}
        >
          <div className="modal-shell">
            <button
              aria-label="투자 상세 닫기"
              className="modal-close"
              type="button"
              onClick={closeInvestmentDetailModal}
            >
              ×
            </button>
            <section
              aria-labelledby="admin-investment-detail-title"
              aria-modal="true"
              className="modal-panel wide"
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <h2 id="admin-investment-detail-title">투자 상세</h2>
                  <p>현재 누적 보상과 종료 상태를 확인합니다.</p>
                </div>
              </div>

              <dl className="info-list admin-order-meta">
                <div>
                  <dt>회원</dt>
                  <dd>
                    {selectedInvestment.user.name} ({selectedInvestment.user.loginId})
                  </dd>
                </div>
                <div>
                  <dt>연락처</dt>
                  <dd>{selectedInvestment.user.phone}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{investmentStatusLabel(selectedInvestment.adminStatus)}</dd>
                </div>
                <div>
                  <dt>지갑 주소</dt>
                  <dd>{selectedInvestment.walletAddress}</dd>
                </div>
                <div>
                  <dt>원금</dt>
                  <dd>{selectedInvestment.principalDisplay} OOWA</dd>
                </div>
                <div>
                  <dt>일일 보상</dt>
                  <dd>{selectedInvestment.dailyRewardDisplay} OOWA</dd>
                </div>
                <div>
                  <dt>경과 일수</dt>
                  <dd>{selectedInvestment.accruedDays}일</dd>
                </div>
                <div>
                  <dt>누적 보상</dt>
                  <dd>{selectedInvestment.accruedRewardDisplay} OOWA</dd>
                </div>
                <div>
                  <dt>지급 예정액</dt>
                  <dd>{selectedInvestment.totalReturnDisplay} OOWA</dd>
                </div>
                <div>
                  <dt>최대 반환액</dt>
                  <dd>{selectedInvestment.maxReturnDisplay} OOWA</dd>
                </div>
                <div>
                  <dt>시작일</dt>
                  <dd>{formatDateTime(selectedInvestment.startedAt)}</dd>
                </div>
                <div>
                  <dt>종료일</dt>
                  <dd>{formatDateTime(selectedInvestment.endedAt)}</dd>
                </div>
                <div>
                  <dt>입금 tx</dt>
                  <dd>{selectedInvestment.depositTxhash}</dd>
                </div>
                {selectedInvestment.payoutTxhash && (
                  <div>
                    <dt>지급 tx</dt>
                    <dd>{selectedInvestment.payoutTxhash}</dd>
                  </div>
                )}
                {selectedInvestment.latestPayout && (
                  <>
                    <div>
                      <dt>최근 지급 상태</dt>
                      <dd>{selectedInvestment.latestPayout.status}</dd>
                    </div>
                    {selectedInvestment.latestPayout.errorMessage && (
                      <div>
                        <dt>지급 실패 사유</dt>
                        <dd>{selectedInvestment.latestPayout.errorMessage}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </section>
          </div>
        </div>
      )}

      {showUserDetailModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeUserDetailModal();
            }
          }}
        >
          <div className="modal-shell">
            <button
              aria-label="회원 상세 닫기"
              className="modal-close"
              type="button"
              onClick={closeUserDetailModal}
            >
              ×
            </button>
            <section
              aria-labelledby="admin-user-detail-title"
              aria-modal="true"
              className="modal-panel wide"
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <h2 id="admin-user-detail-title">회원 상세</h2>
                  <p>회원 상태와 계정 관리 작업을 이 화면에서 처리합니다.</p>
                </div>
              </div>

              {detailLoading && (
                <p className="status neutral">회원 상세를 불러오는 중입니다.</p>
              )}

              {selectedUserDetail && !detailLoading && (
                <>
                  <dl className="info-list admin-order-meta">
                    <div>
                      <dt>이름</dt>
                      <dd>{selectedUserDetail.user.name}</dd>
                    </div>
                    <div>
                      <dt>아이디</dt>
                      <dd>{selectedUserDetail.user.loginId}</dd>
                    </div>
                    <div>
                      <dt>전화번호</dt>
                      <dd>{selectedUserDetail.user.phone}</dd>
                    </div>
                    <div>
                      <dt>상태</dt>
                      <dd>{userStatusLabel(selectedUserDetail.user.status)}</dd>
                    </div>
                    <div>
                      <dt>지갑 주소</dt>
                      <dd>{selectedUserDetail.user.wallet.address}</dd>
                    </div>
                    <div>
                      <dt>추천인</dt>
                      <dd>{selectedUserDetail.referrerWalletAddress ?? "없음"}</dd>
                    </div>
                    <div>
                      <dt>상위 추천인</dt>
                      <dd>{selectedUserDetail.referrerLevel2WalletAddress ?? "없음"}</dd>
                    </div>
                    <div>
                      <dt>가맹점 상태</dt>
                      <dd>
                        {selectedUserDetail.user.merchantProfileStatus ?? "일반 사용자"}
                      </dd>
                    </div>
                    <div>
                      <dt>거래 수</dt>
                      <dd>{selectedUserDetail.user.transactionCount}건</dd>
                    </div>
                    <div>
                      <dt>투자 건수</dt>
                      <dd>
                        {selectedUserDetail.user.investmentCount}건 / 활성{" "}
                        {selectedUserDetail.user.activeInvestmentCount}건
                      </dd>
                    </div>
                  </dl>

                  <div className="field">
                    <label htmlFor="reset-password">새 비밀번호 재설정</label>
                    <input
                      id="reset-password"
                      type="text"
                      value={passwordResetValue}
                      onChange={(event) => setPasswordResetValue(event.target.value)}
                      placeholder="8자 이상 새 비밀번호"
                      disabled={selectedUserDetail.user.status === "deleted"}
                    />
                  </div>
                  {selectedUserDetail.user.status !== "deleted" ? (
                    <div className="button-grid">
                      <button
                        className="button"
                        type="button"
                        disabled={detailLoading}
                        onClick={() => void handleResetPassword()}
                      >
                        비밀번호 재설정
                      </button>
                      {selectedUserDetail.user.status === "active" ? (
                        <button
                          className="button danger"
                          type="button"
                          disabled={detailLoading}
                          onClick={() =>
                            void handleUserAction({
                              action: "disable",
                              userId: selectedUserDetail.user.id,
                            })
                          }
                        >
                          계정 비활성화
                        </button>
                      ) : (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={detailLoading}
                          onClick={() =>
                            void handleUserAction({
                              action: "enable",
                              userId: selectedUserDetail.user.id,
                            })
                          }
                        >
                          계정 활성화
                        </button>
                      )}
                      <button
                        className="button danger"
                        type="button"
                        disabled={detailLoading}
                        onClick={() =>
                          void handleUserAction({
                            action: "delete",
                            userId: selectedUserDetail.user.id,
                          })
                        }
                      >
                        회원탈퇴 처리
                      </button>
                    </div>
                  ) : (
                    <p className="status neutral">
                      이미 탈퇴 처리된 계정입니다. 다시 활성화할 수 없습니다.
                    </p>
                  )}

                  {selectedUserDetail.latestTransactions.length > 0 && (
                    <div className="admin-transfer-list">
                      {selectedUserDetail.latestTransactions.map((transaction) => (
                        <div className="admin-transfer-item" key={transaction.id}>
                          <div>
                            <p className="history-title">
                              {transaction.direction === "outgoing" ? "보냄" : "받음"}
                              <span>{transaction.status}</span>
                            </p>
                            <p className="history-address">{transaction.toAddress}</p>
                            <p className="history-time">
                              {formatDateTime(
                                transaction.chainTimestamp ?? transaction.createdAt,
                              )}
                            </p>
                          </div>
                          <strong>{transaction.amountDisplay} OOWA</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {showMerchantDetailModal && selectedMerchantProfile && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeMerchantDetailModal();
            }
          }}
        >
          <div className="modal-shell">
            <button
              aria-label="가맹점 상세 닫기"
              className="modal-close"
              type="button"
              onClick={closeMerchantDetailModal}
            >
              ×
            </button>
            <section
              aria-labelledby="admin-merchant-detail-title"
              aria-modal="true"
              className="modal-panel wide"
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <h2 id="admin-merchant-detail-title">가맹점 상세</h2>
                  <p>가맹점 신청 정보와 심사 상태를 확인하고 승인 또는 반려할 수 있습니다.</p>
                </div>
              </div>

              <dl className="info-list admin-order-meta">
                <div>
                  <dt>상호명</dt>
                  <dd>{selectedMerchantProfile.merchantName ?? "가맹점 신청"}</dd>
                </div>
                <div>
                  <dt>카테고리</dt>
                  <dd>{selectedMerchantProfile.category ?? "미입력"}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{merchantStatusLabel(selectedMerchantProfile.status)}</dd>
                </div>
                <div>
                  <dt>지갑 주소</dt>
                  <dd>{selectedMerchantProfile.walletAddress}</dd>
                </div>
                <div>
                  <dt>연락처</dt>
                  <dd>{selectedMerchantProfile.phone ?? "-"}</dd>
                </div>
                <div>
                  <dt>주소</dt>
                  <dd>
                    {selectedMerchantProfile.addressMain
                      ? `${selectedMerchantProfile.addressMain}${selectedMerchantProfile.addressDetail ? ` ${selectedMerchantProfile.addressDetail}` : ""}`
                      : "미입력"}
                  </dd>
                </div>
                <div>
                  <dt>소개</dt>
                  <dd>{selectedMerchantProfile.description ?? "-"}</dd>
                </div>
              </dl>

              <div className="field">
                <label htmlFor="merchant-review-note">심사 메모</label>
                <textarea
                  id="merchant-review-note"
                  value={merchantReviewNote}
                  onChange={(event) => setMerchantReviewNote(event.target.value)}
                  placeholder="승인 또는 반려 사유를 남길 수 있습니다."
                  readOnly={
                    selectedMerchantProfile.status === "approved" ||
                    selectedMerchantProfile.status === "denied"
                  }
                />
              </div>

              {(selectedMerchantProfile.status === "draft" ||
                selectedMerchantProfile.status === "pending") && (
                <div className="button-grid">
                  <button
                    className="button"
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void handleReviewMerchant({
                        walletAddress: selectedMerchantProfile.walletAddress,
                        action: "approve",
                      })
                    }
                  >
                    승인
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void handleReviewMerchant({
                        walletAddress: selectedMerchantProfile.walletAddress,
                        action: "deny",
                      })
                    }
                  >
                    반려
                  </button>
                </div>
              )}

              {selectedMerchantProfile.status === "approved" && (
                <p className="status neutral">이미 승인된 가맹점입니다.</p>
              )}

              {selectedMerchantProfile.status === "denied" && (
                <p className="status neutral">이미 반려된 신청입니다.</p>
              )}
            </section>
          </div>
        </div>
      )}

      {showMerchantChangeRequestModal && selectedMerchantChangeRequest && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeMerchantChangeRequestModal();
            }
          }}
        >
          <div className="modal-shell">
            <button
              aria-label="가맹점 변경 요청 상세 닫기"
              className="modal-close"
              type="button"
              onClick={closeMerchantChangeRequestModal}
            >
              ×
            </button>
            <section
              aria-labelledby="admin-merchant-change-request-title"
              aria-modal="true"
              className="modal-panel wide"
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <h2 id="admin-merchant-change-request-title">가맹점 변경 요청</h2>
                  <p>승인된 가맹점이 요청한 정보 변경 내용을 검토하고 승인 또는 반려합니다.</p>
                </div>
              </div>

              <dl className="info-list admin-order-meta">
                <div>
                  <dt>상호명</dt>
                  <dd>{selectedMerchantChangeRequest.merchantName ?? "-"}</dd>
                </div>
                <div>
                  <dt>카테고리</dt>
                  <dd>{selectedMerchantChangeRequest.category ?? "-"}</dd>
                </div>
                <div>
                  <dt>지갑 주소</dt>
                  <dd>{selectedMerchantChangeRequest.walletAddress}</dd>
                </div>
                <div>
                  <dt>연락처</dt>
                  <dd>{selectedMerchantChangeRequest.phone ?? "-"}</dd>
                </div>
                <div>
                  <dt>주소</dt>
                  <dd>
                    {selectedMerchantChangeRequest.addressMain
                      ? `${selectedMerchantChangeRequest.addressMain}${selectedMerchantChangeRequest.addressDetail ? ` ${selectedMerchantChangeRequest.addressDetail}` : ""}`
                      : "미입력"}
                  </dd>
                </div>
                <div>
                  <dt>소개</dt>
                  <dd>{selectedMerchantChangeRequest.description ?? "-"}</dd>
                </div>
              </dl>

              <div className="field">
                <label htmlFor="merchant-change-review-note">심사 메모</label>
                <textarea
                  id="merchant-change-review-note"
                  value={merchantReviewNote}
                  onChange={(event) => setMerchantReviewNote(event.target.value)}
                  placeholder="승인 또는 반려 사유를 남길 수 있습니다."
                />
              </div>

              <div className="button-grid">
                <button
                  className="button"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void handleReviewMerchantChangeRequest({
                      walletAddress: selectedMerchantChangeRequest.walletAddress,
                      action: "approve",
                    })
                  }
                >
                  승인
                </button>
                <button
                  className="button danger"
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    void handleReviewMerchantChangeRequest({
                      walletAddress: selectedMerchantChangeRequest.walletAddress,
                      action: "deny",
                    })
                  }
                >
                  반려
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {showPaymentDetailModal && selectedPayment && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePaymentDetailModal();
            }
          }}
        >
          <div className="modal-shell">
            <button
              aria-label="결제 상세 닫기"
              className="modal-close"
              type="button"
              onClick={closePaymentDetailModal}
            >
              ×
            </button>
            <section
              aria-labelledby="admin-payment-detail-title"
              aria-modal="true"
              className="modal-panel wide"
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <h2 id="admin-payment-detail-title">
                    {selectedPayment.paymentType === "merchant"
                      ? "가맹점 결제 상세"
                      : "일반 송금 상세"}
                  </h2>
                  <p>
                    {selectedPayment.paymentType === "merchant"
                      ? "주문 정보와 분배 전송 상태를 확인합니다."
                      : "일반 송금 주문 정보와 실제 전송 상태를 확인합니다."}
                  </p>
                </div>
              </div>

              <dl className="info-list admin-order-meta">
                <div>
                  <dt>주문번호</dt>
                  <dd>{selectedPayment.id}</dd>
                </div>
                <div>
                  <dt>유형</dt>
                  <dd>{paymentTypeLabel(selectedPayment.paymentType)}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{paymentStatusLabel(selectedPayment.status)}</dd>
                </div>
                <div>
                  <dt>결제자</dt>
                  <dd>{selectedPayment.payerWalletAddress}</dd>
                </div>
                <div>
                  <dt>{selectedPayment.paymentType === "merchant" ? "가맹점" : "수신자"}</dt>
                  <dd>{selectedPayment.merchantWalletAddress}</dd>
                </div>
                <div>
                  <dt>금액</dt>
                  <dd>{selectedPayment.totalAmountDisplay} OOWA</dd>
                </div>
                {selectedPayment.failureReason && (
                  <div>
                    <dt>실패 사유</dt>
                    <dd>{selectedPayment.failureReason}</dd>
                  </div>
                )}
              </dl>

              <div className="admin-transfer-list">
                {selectedPayment.transfers.map((transfer) => (
                  <div className="admin-transfer-item" key={transfer.id}>
                    <div>
                      <p className="history-title">
                        {selectedPayment.paymentType === "merchant"
                          ? transfer.transferRole === "merchant"
                            ? "가맹점"
                            : transfer.transferRole === "referrer_level1"
                              ? "추천인 보상 (7%)"
                              : transfer.transferRole === "referrer_level2"
                                ? "상위 추천인 보상 (3%)"
                                : "수신자"
                          : "수신자"}
                        <span>{transfer.status}</span>
                      </p>
                      <p className="history-address">{transfer.toWalletAddress}</p>
                      {transfer.txhash && (
                        <p className="history-time">tx {transfer.txhash}</p>
                      )}
                      {transfer.errorMessage && (
                        <p className="history-time">{transfer.errorMessage}</p>
                      )}
                    </div>
                    <strong>{transfer.amountDisplay} OOWA</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
