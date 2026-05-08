import type {
  AuthSession,
  LoginRequest,
  MerchantProfileChangeRequest,
  MerchantProfile,
  RegisterRequest,
  RevealMnemonicResponse,
} from "@/types/auth";

const BACKEND_API_BASE_URL =
  process.env.NEXT_PUBLIC_OOWA_BACKEND_API_BASE_URL ?? "http://localhost:4000";

const apiUrl = (path: string): string => `${BACKEND_API_BASE_URL}${path}`;

export const AUTH_TOKEN_STORAGE_KEY = "oowa-auth-token";

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

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
});

const normalizeAuthSession = (
  payload: AuthSession | { token: string; session: AuthSession },
): AuthSession => {
  if (
    payload &&
    typeof payload === "object" &&
    "session" in payload &&
    payload.session
  ) {
    return payload.session;
  }

  return payload as AuthSession;
};

export const registerUser = async (
  request: RegisterRequest,
): Promise<AuthSession> => {
  const response = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return normalizeAuthSession(
    await readJsonResponse<AuthSession | { token: string; session: AuthSession }>(
      response,
    ),
  );
};

export const loginUser = async (request: LoginRequest): Promise<AuthSession> => {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return normalizeAuthSession(
    await readJsonResponse<AuthSession | { token: string; session: AuthSession }>(
      response,
    ),
  );
};

export const getAuthSession = async (token: string): Promise<AuthSession> => {
  const response = await fetch(apiUrl("/api/auth/session"), {
    method: "GET",
    headers: authHeaders(token),
  });

  return readJsonResponse<AuthSession>(response);
};

export const logoutUser = async (token: string): Promise<void> => {
  const response = await fetch(apiUrl("/api/auth/logout"), {
    method: "POST",
    headers: authHeaders(token),
  });

  await readJsonResponse<{ ok: true }>(response);
};

export const revealMnemonic = async ({
  token,
  password,
}: {
  token: string;
  password: string;
}): Promise<RevealMnemonicResponse> => {
  const response = await fetch(apiUrl("/api/auth/reveal-mnemonic"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ password }),
  });

  return readJsonResponse<RevealMnemonicResponse>(response);
};

export const upsertMerchantProfile = async ({
  token,
  merchantName,
  category,
  postalCode,
  addressMain,
  addressDetail,
  lat,
  lng,
  phone,
  description,
}: {
  token: string;
  merchantName: string;
  category: string;
  postalCode?: string;
  addressMain: string;
  addressDetail?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  description?: string;
}): Promise<{
  profile: MerchantProfile | null;
  changeRequest: MerchantProfileChangeRequest | null;
}> => {
  const response = await fetch(apiUrl("/api/merchant-profile"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({
      merchantName,
      category,
      postalCode,
      addressMain,
      addressDetail,
      lat,
      lng,
      phone,
      description,
    }),
  });

  return readJsonResponse<{
    profile: MerchantProfile | null;
    changeRequest: MerchantProfileChangeRequest | null;
  }>(response);
};

export const getApprovedMerchantProfiles = async (): Promise<{
  profiles: MerchantProfile[];
}> => {
  const response = await fetch(apiUrl("/api/merchant-profiles/approved"), {
    method: "GET",
  });

  return readJsonResponse<{ profiles: MerchantProfile[] }>(response);
};
