"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Coffee,
  GraduationCap,
  LayoutGrid,
  Pill,
  Scissors,
  ShoppingBag,
  Stethoscope,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { openKakaoPostcode } from "@/lib/kakaoPostcode";
import type { MerchantProfile, MerchantProfileChangeRequest } from "@/types/auth";

const MODAL_CLOSE_MS = 180;

const CATEGORY_OPTIONS = [
  { value: "식당", label: "식당", Icon: UtensilsCrossed },
  { value: "카페", label: "카페", Icon: Coffee },
  { value: "병원", label: "병원", Icon: Stethoscope },
  { value: "약국", label: "약국", Icon: Pill },
  { value: "미용", label: "미용", Icon: Scissors },
  { value: "교육", label: "교육", Icon: GraduationCap },
  { value: "쇼핑", label: "쇼핑", Icon: ShoppingBag },
  { value: "서비스", label: "서비스", Icon: Wrench },
  { value: "기타", label: "기타", Icon: LayoutGrid },
] as const;

interface MerchantProfileModalProps {
  open: boolean;
  loading: boolean;
  initialProfile: MerchantProfile | null;
  changeRequest: MerchantProfileChangeRequest | null;
  defaultPhone: string;
  onClose: () => void;
  onSubmit: (input: {
    merchantName: string;
    category: string;
    postalCode?: string;
    addressMain: string;
    addressDetail?: string;
    phone?: string;
    description?: string;
  }) => Promise<void>;
}

export function MerchantProfileModal({
  open,
  loading,
  initialProfile,
  changeRequest,
  defaultPhone,
  onClose,
  onSubmit,
}: MerchantProfileModalProps) {
  const [merchantName, setMerchantName] = useState(
    changeRequest?.merchantName ?? initialProfile?.merchantName ?? "",
  );
  const [category, setCategory] = useState(
    changeRequest?.category ?? initialProfile?.category ?? CATEGORY_OPTIONS[0].value,
  );
  const [postalCode, setPostalCode] = useState(
    changeRequest?.postalCode ?? initialProfile?.postalCode ?? "",
  );
  const [addressMain, setAddressMain] = useState(
    changeRequest?.addressMain ?? initialProfile?.addressMain ?? "",
  );
  const [addressDetail, setAddressDetail] = useState(
    changeRequest?.addressDetail ?? initialProfile?.addressDetail ?? "",
  );
  const [phone, setPhone] = useState(changeRequest?.phone ?? initialProfile?.phone ?? defaultPhone);
  const [description, setDescription] = useState(
    changeRequest?.description ?? initialProfile?.description ?? "",
  );
  const [error, setError] = useState("");
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const isApproved = initialProfile?.status === "approved";
  const hasPendingChangeRequest = changeRequest?.status === "pending";
  const title = isApproved
    ? "가맹점 정보"
    : initialProfile?.status === "pending"
      ? "가맹점 정보"
      : "가맹점 등록";
  const isReadOnly =
    initialProfile?.status === "pending" ||
    (isApproved && (!editMode || hasPendingChangeRequest));
  const helperText =
    initialProfile?.status === "pending"
      ? "심사 중인 신청 정보입니다. 심사가 끝날 때까지 수정할 수 없습니다."
      : isApproved
        ? hasPendingChangeRequest
          ? "변경 요청이 심사 중입니다. 심사 결과가 나올 때까지 다시 수정할 수 없습니다."
          : editMode
            ? "변경 내용을 저장하면 정보 변경 요청으로 접수됩니다."
            : "승인된 가맹점 정보입니다. 정보 수정 요청을 누르면 변경 요청을 작성할 수 있습니다."
        : "가맹점 심사를 위해 기본 정보를 입력해주세요.";
  const canSubmit = useMemo(
    () =>
      merchantName.trim().length >= 2 &&
      category.trim().length >= 1 &&
      addressMain.trim().length >= 4 &&
      !isReadOnly,
    [merchantName, category, addressMain, isReadOnly],
  );

  useEffect(() => {
    setMerchantName(changeRequest?.merchantName ?? initialProfile?.merchantName ?? "");
    setCategory(changeRequest?.category ?? initialProfile?.category ?? CATEGORY_OPTIONS[0].value);
    setPostalCode(changeRequest?.postalCode ?? initialProfile?.postalCode ?? "");
    setAddressMain(changeRequest?.addressMain ?? initialProfile?.addressMain ?? "");
    setAddressDetail(changeRequest?.addressDetail ?? initialProfile?.addressDetail ?? "");
    setPhone(changeRequest?.phone ?? initialProfile?.phone ?? defaultPhone);
    setDescription(changeRequest?.description ?? initialProfile?.description ?? "");
    setError("");
    setEditMode(false);
  }, [changeRequest, defaultPhone, initialProfile, open]);

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

  if (!rendered) {
    return null;
  }

  const handleSearchAddress = async () => {
    if (isReadOnly) {
      return;
    }
    setSearchingAddress(true);
    setError("");
    try {
      const result = await openKakaoPostcode();
      setPostalCode(result.postalCode);
      setAddressMain(result.addressMain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "주소 검색을 열지 못했습니다.");
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isReadOnly) {
      return;
    }
    if (!canSubmit) {
      setError("상호명, 카테고리, 주소를 입력해주세요.");
      return;
    }

    setError("");
    try {
      await onSubmit({
        merchantName: merchantName.trim(),
        category: category.trim(),
        postalCode: postalCode.trim() || undefined,
        addressMain: addressMain.trim(),
        addressDetail: addressDetail.trim() || undefined,
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "가맹점 정보를 저장하지 못했습니다.");
    }
  };

  return (
    <div
      className={`modal-backdrop${closing ? " closing" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-shell">
        <div className={`modal-panel${closing ? " closing" : ""}`}>
          <div className="modal-header">
            <div>
              <h2>{title}</h2>
              <p>{helperText}</p>
            </div>
            <button className="modal-close" type="button" onClick={onClose}>
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="merchant-name">상호명</label>
              <input
                id="merchant-name"
                value={merchantName}
                disabled={isReadOnly}
                onChange={(event) => setMerchantName(event.target.value)}
                placeholder="상호명을 입력하세요"
              />
            </div>

            <div className="field">
              <label>카테고리</label>
              <div className="category-grid">
                {CATEGORY_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isReadOnly}
                    className={`category-btn${category === value ? " active" : ""}`}
                    onClick={() => setCategory(value)}
                  >
                    <Icon size={20} strokeWidth={1.6} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="merchant-postal-code">주소</label>
              <div className="button-grid merchant-address-grid">
                <input
                  id="merchant-postal-code"
                  value={postalCode}
                  disabled={isReadOnly}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder="우편번호"
                />
                <button
                  className="button secondary"
                  type="button"
                  disabled={searchingAddress || isReadOnly}
                  onClick={() => void handleSearchAddress()}
                >
                  {searchingAddress ? "검색 중" : "주소 검색"}
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="merchant-address-main">기본 주소</label>
              <input
                id="merchant-address-main"
                value={addressMain}
                disabled={isReadOnly}
                onChange={(event) => setAddressMain(event.target.value)}
                placeholder="주소를 입력하세요"
              />
            </div>

            <div className="field">
              <label htmlFor="merchant-address-detail">상세 주소</label>
              <input
                id="merchant-address-detail"
                value={addressDetail}
                disabled={isReadOnly}
                onChange={(event) => setAddressDetail(event.target.value)}
                placeholder="상세 주소를 입력하세요"
              />
            </div>

            <div className="field">
              <label htmlFor="merchant-phone">연락처</label>
              <input
                id="merchant-phone"
                value={phone}
                disabled={isReadOnly}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="연락 가능한 번호"
              />
            </div>

            <div className="field">
              <label htmlFor="merchant-description">소개</label>
              <textarea
                id="merchant-description"
                value={description}
                disabled={isReadOnly}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="가맹점 소개를 입력하세요"
              />
            </div>

            <p className="status neutral">로고 업로드는 준비 중입니다.</p>
            {error && <p className="status error">{error}</p>}

            <div className="button-grid">
              <button className="button secondary" type="button" onClick={onClose}>
                {isReadOnly ? "확인" : "닫기"}
              </button>
              {isApproved && !editMode && !hasPendingChangeRequest && (
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setEditMode(true);
                    setError("");
                  }}
                >
                  정보 수정 요청
                </button>
              )}
              {!isReadOnly && (
                <button className="button" type="submit" disabled={!canSubmit || loading}>
                  {loading ? "저장 중" : isApproved ? "변경 요청 저장" : "저장"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
