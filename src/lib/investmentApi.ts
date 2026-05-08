import type {
  InvestmentProduct,
  InvestmentPositionsResponse,
  StartInvestmentResponse,
  StopInvestmentResponse,
} from "@/types/investment";

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

export const getInvestmentProduct = async (): Promise<InvestmentProduct> => {
  const response = await fetch(apiUrl("/api/investment/product"), {
    method: "GET",
  });

  return readJsonResponse<InvestmentProduct>(response);
};

export const getMyInvestments = async (
  token: string,
  { page = 0, limit = 10 }: { page?: number; limit?: number } = {},
): Promise<InvestmentPositionsResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const response = await fetch(apiUrl(`/api/investments/me?${params}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJsonResponse<InvestmentPositionsResponse>(response);
};

export const startInvestment = async ({
  token,
  amountRaw,
}: {
  token: string;
  amountRaw: string;
}): Promise<StartInvestmentResponse> => {
  const response = await fetch(apiUrl("/api/investments/start"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amountRaw }),
  });

  return readJsonResponse<StartInvestmentResponse>(response);
};

export const stopInvestment = async ({
  token,
  positionId,
}: {
  token: string;
  positionId: string;
}): Promise<StopInvestmentResponse> => {
  const response = await fetch(
    apiUrl(`/api/investments/${encodeURIComponent(positionId)}/stop`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return readJsonResponse<StopInvestmentResponse>(response);
};
