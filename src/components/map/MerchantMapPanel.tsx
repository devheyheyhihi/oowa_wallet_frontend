"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { getApprovedMerchantProfiles } from "@/lib/authApi";
import type { MerchantProfile } from "@/types/auth";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const DISTANCE_OPTIONS = [
  { label: "전체", value: null },
  { label: "500m", value: 0.5 },
  { label: "1km", value: 1 },
  { label: "2km", value: 2 },
  { label: "5km", value: 5 },
  { label: "10km", value: 10 },
] as const;

type DistanceFilter = null | 0.5 | 1 | 2 | 5 | 10;

// ── 카테고리별 마커 아이콘 (lucide SVG + 배경색) ──────────────
const SVG_ATTR =
  'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const CATEGORY_MARKER: Record<string, { color: string; svg: string }> = {
  식당: {
    color: "#ef4444",
    svg: `<svg ${SVG_ATTR}><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>`,
  },
  카페: {
    color: "#92400e",
    svg: `<svg ${SVG_ATTR}><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/></svg>`,
  },
  병원: {
    color: "#3b82f6",
    svg: `<svg ${SVG_ATTR}><path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></svg>`,
  },
  약국: {
    color: "#22c55e",
    svg: `<svg ${SVG_ATTR}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
  },
  미용: {
    color: "#ec4899",
    svg: `<svg ${SVG_ATTR}><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>`,
  },
  교육: {
    color: "#8b5cf6",
    svg: `<svg ${SVG_ATTR}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,
  },
  쇼핑: {
    color: "#f59e0b",
    svg: `<svg ${SVG_ATTR}><path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/></svg>`,
  },
  서비스: {
    color: "#64748b",
    svg: `<svg ${SVG_ATTR}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>`,
  },
  기타: {
    color: "#6b7280",
    svg: `<svg ${SVG_ATTR}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
  },
};

const DEFAULT_MARKER = { color: "#6b7280", svg: CATEGORY_MARKER["기타"].svg };

const createMerchantMarkerContent = (category: string | null): string => {
  const { color, svg } = CATEGORY_MARKER[category ?? ""] ?? DEFAULT_MARKER;
  return `
    <div class="map-merchant-wrap">
      <div class="map-merchant-marker" style="background:${color}">${svg}</div>
      <div class="map-merchant-tip" style="border-top-color:${color}"></div>
    </div>`;
};

const LIST_LIMIT = 5;

const calcDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (km: number): string => {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
};

const formatAddress = (profile: MerchantProfile): string => {
  if (!profile.addressMain) {
    return "주소 준비 중";
  }

  return profile.addressDetail
    ? `${profile.addressMain} ${profile.addressDetail}`
    : profile.addressMain;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const ensureKakaoMap = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경에서만 지도를 사용할 수 있습니다.");
  }
  if (!window.kakao?.maps?.load) {
    throw new Error("카카오 지도 키를 설정한 뒤 다시 시도해주세요.");
  }

  await new Promise<void>((resolve) => {
    window.kakao.maps.load(() => resolve());
  });
};

interface MerchantMapPanelProps {
  active: boolean;
}

export function MerchantMapPanel({ active }: MerchantMapPanelProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const currentMarkerRef = useRef<any>(null);
  const hasCenteredOnLocationRef = useRef(false);
  const [profiles, setProfiles] = useState<MerchantProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{ profile: MerchantProfile; distance: number | null } | null>(null);

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(profiles.map((p) => p.category ?? "기타").filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "ko")),
    [profiles],
  );

  const profilesWithDistance = useMemo(
    () =>
      profiles.map((profile) => ({
        profile,
        distance:
          currentLocation && profile.lat != null && profile.lng != null
            ? calcDistance(
                currentLocation.lat,
                currentLocation.lng,
                profile.lat,
                profile.lng,
              )
            : null,
      })),
    [profiles, currentLocation],
  );

  const filteredProfiles = useMemo(() => {
    const filtered = profilesWithDistance.filter(({ profile, distance }) => {
      if (categoryFilter !== null && (profile.category ?? "기타") !== categoryFilter) {
        return false;
      }
      if (distanceFilter === null) return true;
      if (distance === null) return false;
      return distance <= distanceFilter;
    });

    return filtered.sort((a, b) => {
      if (a.distance === null && b.distance === null) {
        return (a.profile.merchantName ?? "").localeCompare(
          b.profile.merchantName ?? "",
          "ko",
        );
      }
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
  }, [profilesWithDistance, distanceFilter, categoryFilter]);

  useEffect(() => {
    setListOpen(false);
  }, [filteredProfiles]);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getApprovedMerchantProfiles();
      setProfiles(result.profiles);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "가맹점 지도를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const moveToCurrentLocation = useCallback(() => {
    if (!currentLocation || !mapInstanceRef.current || !window.kakao?.maps?.LatLng) {
      return;
    }

    const position = new window.kakao.maps.LatLng(
      currentLocation.lat,
      currentLocation.lng,
    );
    mapInstanceRef.current.setCenter(position);
    mapInstanceRef.current.setLevel(4);
  }, [currentLocation]);

  useEffect(() => {
    if (!active) {
      hasCenteredOnLocationRef.current = false;
      return;
    }

    void refreshProfiles();
  }, [active, refreshProfiles]);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // 위치 권한은 선택 사항입니다.
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      },
    );
  }, [active]);

  useEffect(() => {
    if (!active || !mapRef.current) {
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      try {
        await ensureKakaoMap();
        if (cancelled || !mapRef.current) {
          return;
        }

        const firstProfile = filteredProfiles[0]?.profile;
        const initialCenter =
          currentLocation ??
          (firstProfile?.lat !== null &&
          firstProfile?.lat !== undefined &&
          firstProfile?.lng !== null &&
          firstProfile?.lng !== undefined
            ? { lat: firstProfile.lat, lng: firstProfile.lng }
            : DEFAULT_CENTER);

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.kakao.maps.Map(mapRef.current, {
            center: new window.kakao.maps.LatLng(initialCenter.lat, initialCenter.lng),
            level: 4,
          });
          if (currentLocation) {
            hasCenteredOnLocationRef.current = true;
          }
        } else {
          mapInstanceRef.current.relayout();
          if (currentLocation && !hasCenteredOnLocationRef.current) {
            hasCenteredOnLocationRef.current = true;
            mapInstanceRef.current.panTo(
              new window.kakao.maps.LatLng(currentLocation.lat, currentLocation.lng),
            );
          }
        }

        markerRefs.current.forEach((marker) => marker.setMap(null));
        markerRefs.current = [];

        if (currentMarkerRef.current) {
          currentMarkerRef.current.setMap(null);
          currentMarkerRef.current = null;
        }

        if (currentLocation) {
          const content = `
            <div class="map-current-marker">
              <div class="map-current-pulse"></div>
              <div class="map-current-dot"></div>
            </div>`;
          currentMarkerRef.current = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(
              currentLocation.lat,
              currentLocation.lng,
            ),
            content,
            map: mapInstanceRef.current,
            zIndex: 10,
          });
        }

        filteredProfiles.forEach(({ profile }) => {
          if (profile.lat === null || profile.lng === null) {
            return;
          }

          const marker = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(profile.lat, profile.lng),
            content: createMerchantMarkerContent(profile.category ?? null),
            map: mapInstanceRef.current,
            xAnchor: 0.5,
            yAnchor: 1,
            zIndex: 5,
          });

          const distanceVal =
            currentLocation && profile.lat != null && profile.lng != null
              ? calcDistance(
                  currentLocation.lat,
                  currentLocation.lng,
                  profile.lat,
                  profile.lng,
                )
              : null;

          window.kakao.maps.event.addListener(marker, "click", () => {
            setSelectedProfile({ profile, distance: distanceVal });
          });

          markerRefs.current.push(marker);
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "지도를 준비하지 못했습니다.",
          );
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [active, currentLocation, filteredProfiles]);

  if (!active) {
    return (
      <section className="panel map-panel">
        <p className="status neutral">로그인 후 지도를 사용할 수 있습니다.</p>
      </section>
    );
  }

  return (
    <section className="panel map-panel">
      <div className="section-title">
        <div>
          <h2>가맹점 지도</h2>
          <p>승인된 가맹점을 지도에서 바로 확인할 수 있습니다.</p>
        </div>
      </div>

      <div className="map-toolbar">
        <p className="map-count">
          {distanceFilter !== null && currentLocation
            ? `${filteredProfiles.length}곳 / 전체 ${profiles.length}곳`
            : `승인된 가맹점 ${filteredProfiles.length}곳`}
        </p>
        <div className="map-toolbar-actions">
          <button
            className="button secondary map-toolbar-button"
            type="button"
            onClick={() => void refreshProfiles()}
            disabled={loading}
          >
            {loading ? "불러오는 중" : "새로고침"}
          </button>
          <button
            className="button secondary map-toolbar-button"
            type="button"
            onClick={moveToCurrentLocation}
            disabled={!currentLocation}
          >
            내 위치
          </button>
        </div>
      </div>

      <div className="map-distance-filter">
        <span className="meta-label">거리 필터</span>
        <div className="map-distance-buttons">
          {DISTANCE_OPTIONS.map((option) => (
            <button
              key={String(option.value)}
              className={`map-distance-btn${distanceFilter === option.value ? " active" : ""}${!currentLocation && option.value !== null ? " disabled" : ""}`}
              type="button"
              disabled={!currentLocation && option.value !== null}
              onClick={() => setDistanceFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!currentLocation && (
          <p className="mini-note">내 위치를 허용하면 거리 필터를 사용할 수 있습니다.</p>
        )}
      </div>

      {availableCategories.length > 0 && (
        <div className="map-distance-filter">
          <span className="meta-label">카테고리 필터</span>
          <div className="map-distance-buttons">
            <button
              className={`map-distance-btn${categoryFilter === null ? " active" : ""}`}
              type="button"
              onClick={() => setCategoryFilter(null)}
            >
              전체
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                className={`map-distance-btn${categoryFilter === cat ? " active" : ""}`}
                type="button"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? <p className="status error">{error}</p> : null}

      <div className="merchant-map-surface">
        <div className="merchant-map-canvas" ref={mapRef} />

        <div className={`merchant-map-list${listOpen ? " open" : ""}`}>
          {/* 토글 버튼 (항상 표시) */}
          <button
            className="merchant-map-toggle"
            type="button"
            onClick={() => setListOpen((o) => !o)}
          >
            <span>
              가맹점{" "}
              <strong>{filteredProfiles.length}</strong>곳
            </span>
            <span className={`merchant-map-toggle-arrow${listOpen ? " up" : ""}`}>▲</span>
          </button>

          {/* 리스트 (펼쳐진 상태에서만) */}
          {listOpen && (
            <div className="merchant-map-items">
              {filteredProfiles.length === 0 ? (
                <p className="status neutral merchant-map-empty">
                  {distanceFilter !== null
                    ? "해당 거리 내 가맹점이 없습니다."
                    : "표시할 승인 가맹점이 없습니다."}
                </p>
              ) : (
                filteredProfiles.map(({ profile, distance }) => (
                  <article className="merchant-map-item" key={profile.walletAddress}>
                    <div>
                      <p className="merchant-map-title">
                        {profile.merchantName ?? "가맹점"}
                      </p>
                      <p className="merchant-map-meta">
                        {profile.category ?? "기타"} · {formatAddress(profile)}
                      </p>
                      {distance !== null && (
                        <p className="merchant-map-distance">
                          📍 {formatDistance(distance)}
                        </p>
                      )}
                    </div>
                    <button
                      className="copy-button"
                      type="button"
                      onClick={() => {
                        if (
                          profile.lat === null ||
                          profile.lng === null ||
                          !mapInstanceRef.current ||
                          !window.kakao?.maps?.LatLng
                        ) {
                          return;
                        }
                        mapInstanceRef.current.setCenter(
                          new window.kakao.maps.LatLng(profile.lat, profile.lng),
                        );
                        mapInstanceRef.current.setLevel(3);
                        setSelectedProfile({ profile, distance });
                        setListOpen(false);
                      }}
                    >
                      보기
                    </button>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {selectedProfile && (
        <div className="map-detail-popup">
          <div className="modal-panel">
            <button
              className="modal-close"
              type="button"
              onClick={() => setSelectedProfile(null)}
              aria-label="닫기"
            >
              ×
            </button>

            <div className="map-detail-header">
              <div className="map-detail-badge-wrap">
                <span
                  className="map-detail-badge"
                  style={{
                    background:
                      (CATEGORY_MARKER[selectedProfile.profile.category ?? ""] ?? DEFAULT_MARKER).color,
                  }}
                >
                  <span
                    dangerouslySetInnerHTML={{
                      __html: (CATEGORY_MARKER[selectedProfile.profile.category ?? ""] ?? DEFAULT_MARKER).svg,
                    }}
                  />
                </span>
                <div>
                  <h3 className="map-detail-name">
                    {selectedProfile.profile.merchantName ?? "가맹점"}
                  </h3>
                  <p className="map-detail-category">
                    {selectedProfile.profile.category ?? "기타"}
                    {selectedProfile.distance !== null && (
                      <> · 📍 {formatDistance(selectedProfile.distance)}</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="map-detail-body">
              <p className="map-detail-row">
                <span className="map-detail-label">주소</span>
                <span>{formatAddress(selectedProfile.profile)}</span>
              </p>
              {selectedProfile.profile.phone && (
                <p className="map-detail-row">
                  <span className="map-detail-label">전화</span>
                  <a
                    className="map-detail-link"
                    href={`tel:${selectedProfile.profile.phone}`}
                  >
                    {selectedProfile.profile.phone}
                  </a>
                </p>
              )}
              {selectedProfile.profile.description && (
                <p className="map-detail-row">
                  <span className="map-detail-label">소개</span>
                  <span className="map-detail-desc">
                    {selectedProfile.profile.description}
                  </span>
                </p>
              )}
              <p className="map-detail-row">
                <span className="map-detail-label">지갑</span>
                <span className="map-detail-address-wrap">
                  <span className="map-detail-address">
                    {selectedProfile.profile.walletAddress.slice(0, 8)}…
                    {selectedProfile.profile.walletAddress.slice(-6)}
                  </span>
                  <button
                    className="copy-button"
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        selectedProfile.profile.walletAddress,
                      )
                    }
                  >
                    복사
                  </button>
                </span>
              </p>
            </div>

            <div className="map-detail-footer">
              <button
                className="button secondary"
                type="button"
                onClick={() => setSelectedProfile(null)}
              >
                닫기
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => {
                  const { profile } = selectedProfile;
                  if (
                    profile.lat === null ||
                    profile.lng === null ||
                    !mapInstanceRef.current ||
                    !window.kakao?.maps?.LatLng
                  ) {
                    return;
                  }
                  mapInstanceRef.current.setCenter(
                    new window.kakao.maps.LatLng(profile.lat, profile.lng),
                  );
                  mapInstanceRef.current.setLevel(3);
                  setSelectedProfile(null);
                }}
              >
                지도로 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
