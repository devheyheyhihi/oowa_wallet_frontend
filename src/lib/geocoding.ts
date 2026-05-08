interface GeocodingResult {
  lat: number;
  lng: number;
}

const ensureKakaoMaps = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 지도를 사용할 수 있습니다.");
  }

  if (!window.kakao?.maps?.load) {
    throw new Error("카카오 지도 스크립트를 불러오지 못했습니다.");
  }

  await new Promise<void>((resolve) => {
    window.kakao.maps.load(() => resolve());
  });
};

export const geocodeAddress = async (address: string): Promise<GeocodingResult> => {
  await ensureKakaoMaps();

  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps?.services?.Geocoder) {
      reject(new Error("카카오 주소 변환 기능을 사용할 수 없습니다."));
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result: any[], status: string) => {
      if (status !== window.kakao.maps.services.Status.OK || !result?.[0]) {
        reject(new Error("선택한 주소의 위치를 찾지 못했습니다."));
        return;
      }

      resolve({
        lat: Number(result[0].y),
        lng: Number(result[0].x),
      });
    });
  });
};
