import "./globals.css";

export const metadata = {
  title: "AI 운동 자세 코치",
  description: "AI 기반 실시간 운동 자세 분석 시스템",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "운동코치",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0e17",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
