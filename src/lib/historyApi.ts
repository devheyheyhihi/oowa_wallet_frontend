import type {
  ActivityKindFilter,
  AdminInvestmentsResponse,
  AdminInvestmentSummaryResponse,
  AdminMerchantChangeRequestsResponse,
  AdminMerchantProfilesResponse,
  AdminPaymentsResponse,
  AdminUserDetailResponse,
  AdminUsersResponse,
  ExecutePaymentResponse,
  PaymentOrderCreateResponse,
  PaymentQuoteRequest,
  PaymentQuoteResponse,
  PaymentTransferBroadcastedResponse,
  PaymentTransferFailedResponse,
  SaveTransactionRequest,
  SaveTransactionResponse,
  WalletActivityResponse,
  WalletRecipientsResponse,
} from "@/types/history";

const BACKEND_API_BASE_URL =
  process.env.NEXT_PUBLIC_OOWA_BACKEND_API_BASE_URL ?? "http://localhost:4000";

const apiUrl = (path: string): string => `${BACKEND_API_BASE_URL}${path}`;

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed: ${response.status}`;

    throw new Error(message);
  }

  return data as T;
};

export const saveTransactionHistory = async (
  request: SaveTransactionRequest,
): Promise<SaveTransactionResponse> => {
  const response = await fetch(apiUrl("/api/transactions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveTransactionResponse>(response);
};

export const getWalletActivity = async (
  walletAddress: string,
  {
    page = 0,
    limit = 20,
    direction,
    kind,
  }: {
    page?: number;
    limit?: number;
    direction?: "outgoing" | "incoming" | null;
    kind?: ActivityKindFilter | null;
  } = {},
): Promise<WalletActivityResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (direction) params.set("direction", direction);
  if (kind && kind !== "all") params.set("kind", kind);
  const response = await fetch(
    apiUrl(`/api/wallets/${encodeURIComponent(walletAddress)}/activity?${params}`),
    { method: "GET" },
  );

  return readJsonResponse<WalletActivityResponse>(response);
};

export const getWalletRecipients = async (
  walletAddress: string,
): Promise<WalletRecipientsResponse> => {
  const response = await fetch(
    apiUrl(`/api/wallets/${encodeURIComponent(walletAddress)}/recipients`),
    { method: "GET" },
  );

  return readJsonResponse<WalletRecipientsResponse>(response);
};

export const getPaymentQuote = async (
  request: PaymentQuoteRequest,
): Promise<PaymentQuoteResponse> => {
  const response = await fetch(apiUrl("/api/payments/quote"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<PaymentQuoteResponse>(response);
};

export const createPaymentOrder = async (
  request: PaymentQuoteRequest,
): Promise<PaymentOrderCreateResponse> => {
  const response = await fetch(apiUrl("/api/payments"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<PaymentOrderCreateResponse>(response);
};

export const executeAuthenticatedPayment = async ({
  token,
  request,
}: {
  token: string;
  request: Pick<PaymentQuoteRequest, "toWalletAddress" | "amountRaw">;
}): Promise<ExecutePaymentResponse> => {
  const response = await fetch(apiUrl("/api/payments/execute"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<ExecutePaymentResponse>(response);
};

export const recordPaymentTransferBroadcasted = async ({
  paymentOrderId,
  transferRole,
  request,
}: {
  paymentOrderId: string;
  transferRole: string;
  request: SaveTransactionRequest;
}): Promise<PaymentTransferBroadcastedResponse> => {
  const response = await fetch(
    apiUrl(
      `/api/payments/${encodeURIComponent(paymentOrderId)}/transfers/${encodeURIComponent(
        transferRole,
      )}/broadcasted`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  return readJsonResponse<PaymentTransferBroadcastedResponse>(response);
};

export const recordPaymentTransferFailed = async ({
  paymentOrderId,
  transferRole,
  errorMessage,
}: {
  paymentOrderId: string;
  transferRole: string;
  errorMessage: string;
}): Promise<PaymentTransferFailedResponse> => {
  const response = await fetch(
    apiUrl(
      `/api/payments/${encodeURIComponent(paymentOrderId)}/transfers/${encodeURIComponent(
        transferRole,
      )}/failed`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ errorMessage }),
    },
  );

  return readJsonResponse<PaymentTransferFailedResponse>(response);
};

export const getAdminPayments = async ({
  adminToken,
  statuses = ["created", "processing", "completed", "failed", "partial_failed"],
  paymentType = "all",
  search = "",
  page = 0,
  limit = 20,
}: {
  adminToken: string;
  statuses?: string[];
  paymentType?: "all" | "standard" | "merchant";
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminPaymentsResponse> => {
  const query = new URLSearchParams({
    statuses: statuses.join(","),
    paymentType,
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) {
    query.set("search", search.trim());
  }
  const response = await fetch(apiUrl(`/api/admin/payments?${query.toString()}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  return readJsonResponse<AdminPaymentsResponse>(response);
};

export const getAdminInvestmentSummary = async ({
  adminToken,
}: {
  adminToken: string;
}): Promise<AdminInvestmentSummaryResponse> => {
  const response = await fetch(apiUrl("/api/admin/investments/summary"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  return readJsonResponse<AdminInvestmentSummaryResponse>(response);
};

export const getAdminInvestments = async ({
  adminToken,
  statuses = ["active", "completed", "payout_failed"],
  search = "",
  page = 0,
  limit = 20,
}: {
  adminToken: string;
  statuses?: string[];
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminInvestmentsResponse> => {
  const query = new URLSearchParams({
    statuses: statuses.join(","),
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) {
    query.set("search", search.trim());
  }
  const response = await fetch(apiUrl(`/api/admin/investments?${query.toString()}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  return readJsonResponse<AdminInvestmentsResponse>(response);
};

export const getAdminMerchantProfiles = async ({
  adminToken,
  statuses = ["draft", "pending", "denied"],
  search = "",
  page = 0,
  limit = 20,
}: {
  adminToken: string;
  statuses?: string[];
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminMerchantProfilesResponse> => {
  const query = new URLSearchParams({
    statuses: statuses.join(","),
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) {
    query.set("search", search.trim());
  }
  const response = await fetch(
    apiUrl(`/api/admin/merchant-profiles?${query.toString()}`),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  return readJsonResponse<AdminMerchantProfilesResponse>(response);
};

export const reviewAdminMerchantProfile = async ({
  adminToken,
  walletAddress,
  action,
  reviewNote,
}: {
  adminToken: string;
  walletAddress: string;
  action: "approve" | "deny";
  reviewNote?: string;
}) => {
  const response = await fetch(
    apiUrl(
      `/api/admin/merchant-profiles/${encodeURIComponent(walletAddress)}/${action}`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reviewNote }),
    },
  );

  return readJsonResponse<{ profile: import("@/types/auth").MerchantProfile }>(response);
};

export const getAdminMerchantChangeRequests = async ({
  adminToken,
  statuses = ["pending"],
  search = "",
  page = 0,
  limit = 20,
}: {
  adminToken: string;
  statuses?: string[];
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminMerchantChangeRequestsResponse> => {
  const query = new URLSearchParams({
    statuses: statuses.join(","),
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) {
    query.set("search", search.trim());
  }
  const response = await fetch(
    apiUrl(`/api/admin/merchant-change-requests?${query.toString()}`),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  return readJsonResponse<AdminMerchantChangeRequestsResponse>(response);
};

export const reviewAdminMerchantChangeRequest = async ({
  adminToken,
  walletAddress,
  action,
  reviewNote,
}: {
  adminToken: string;
  walletAddress: string;
  action: "approve" | "deny";
  reviewNote?: string;
}) => {
  const response = await fetch(
    apiUrl(
      `/api/admin/merchant-change-requests/${encodeURIComponent(walletAddress)}/${action}`,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reviewNote }),
    },
  );

  return readJsonResponse<{ changeRequest: import("@/types/auth").MerchantProfileChangeRequest }>(response);
};

export const getAdminUsers = async ({
  adminToken,
  statuses = ["active", "disabled", "deleted"],
  search = "",
  page = 0,
  limit = 20,
}: {
  adminToken: string;
  statuses?: string[];
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUsersResponse> => {
  const query = new URLSearchParams({
    statuses: statuses.join(","),
    page: String(page),
    limit: String(limit),
  });
  if (search.trim()) {
    query.set("search", search.trim());
  }

  const response = await fetch(apiUrl(`/api/admin/users?${query.toString()}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  return readJsonResponse<AdminUsersResponse>(response);
};

export const getAdminUserDetail = async ({
  adminToken,
  userId,
}: {
  adminToken: string;
  userId: string;
}): Promise<AdminUserDetailResponse> => {
  const response = await fetch(
    apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  return readJsonResponse<AdminUserDetailResponse>(response);
};

export const adminResetUserPassword = async ({
  adminToken,
  userId,
  nextPassword,
}: {
  adminToken: string;
  userId: string;
  nextPassword: string;
}): Promise<AdminUserDetailResponse> => {
  const response = await fetch(
    apiUrl(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ nextPassword }),
    },
  );

  return readJsonResponse<AdminUserDetailResponse>(response);
};

export const adminUpdateUserStatus = async ({
  adminToken,
  userId,
  action,
}: {
  adminToken: string;
  userId: string;
  action: "enable" | "disable" | "delete";
}): Promise<AdminUserDetailResponse> => {
  const response = await fetch(
    apiUrl(`/api/admin/users/${encodeURIComponent(userId)}/${action}`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    },
  );

  return readJsonResponse<AdminUserDetailResponse>(response);
};
