import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "OOWA Wallet",
  description: "OOWA Wallet",
  icons: {
    icon: "/images/logo-oowa.png",
    shortcut: "/images/logo-oowa.png",
    apple: "/images/logo-oowa.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const kakaoMapApiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;

  return (
    <html lang="ko">
      <body>
        {kakaoMapApiKey ? (
          <Script
            src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoMapApiKey}&libraries=services&autoload=false`}
            strategy="afterInteractive"
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
