declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: {
          zonecode: string;
          address: string;
          addressType?: string;
          bname?: string;
          buildingName?: string;
        }) => void;
      }) => {
        open: () => void;
      };
    };
  }
}

const KAKAO_POSTCODE_SCRIPT =
  "//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let scriptPromise: Promise<void> | null = null;

const ensureScript = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경에서만 주소 검색을 사용할 수 있습니다."));
  }

  if (window.daum?.Postcode) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${KAKAO_POSTCODE_SCRIPT}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = KAKAO_POSTCODE_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
    document.body.appendChild(script);
  });

  return scriptPromise;
};

export interface KakaoPostcodeResult {
  postalCode: string;
  addressMain: string;
}

export const openKakaoPostcode = async (): Promise<KakaoPostcodeResult> => {
  await ensureScript();

  return new Promise((resolve, reject) => {
    if (!window.daum?.Postcode) {
      reject(new Error("주소 검색 기능을 사용할 수 없습니다."));
      return;
    }

    new window.daum.Postcode({
      oncomplete(data) {
        resolve({
          postalCode: data.zonecode,
          addressMain: data.address,
        });
      },
    }).open();
  });
};
