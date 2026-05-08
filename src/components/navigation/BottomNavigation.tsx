"use client";

import {
  ArrowLeftRight,
  House,
  MapPin,
  PiggyBank,
} from "lucide-react";

type AppView = "home" | "transfer" | "investment" | "map";

interface BottomNavigationProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
}

export function BottomNavigation({
  currentView,
  onChange,
}: BottomNavigationProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 네비게이션">
      <button
        className={`bottom-nav-item${currentView === "home" ? " active" : ""}`}
        type="button"
        onClick={() => onChange("home")}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <House size={16} strokeWidth={2.4} />
        </span>
        <span>홈</span>
      </button>
      <button
        className={`bottom-nav-item${currentView === "transfer" ? " active" : ""}`}
        type="button"
        onClick={() => onChange("transfer")}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <ArrowLeftRight size={16} strokeWidth={2.4} />
        </span>
        <span>송금</span>
      </button>
      <button
        className={`bottom-nav-item${currentView === "investment" ? " active" : ""}`}
        type="button"
        onClick={() => onChange("investment")}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <PiggyBank size={16} strokeWidth={2.4} />
        </span>
        <span>투자</span>
      </button>
      <button
        className={`bottom-nav-item${currentView === "map" ? " active" : ""}`}
        type="button"
        onClick={() => onChange("map")}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <MapPin size={16} strokeWidth={2.4} />
        </span>
        <span>지도</span>
      </button>
    </nav>
  );
}
