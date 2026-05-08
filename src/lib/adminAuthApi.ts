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

export interface AdminSession {
  token: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
}

export const loginAdmin = async ({
  password,
}: {
  password: string;
}): Promise<{ token: string; expiresInHours: number }> => {
  const response = await fetch(apiUrl("/api/admin/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  return readJsonResponse<{ token: string; expiresInHours: number }>(response);
};

export const getAdminSession = async (
  token: string,
): Promise<AdminSession> => {
  const response = await fetch(apiUrl("/api/admin/auth/session"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJsonResponse<AdminSession>(response);
};

export const logoutAdmin = async (token: string): Promise<void> => {
  const response = await fetch(apiUrl("/api/admin/auth/logout"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await readJsonResponse<{ ok: true }>(response);
};
