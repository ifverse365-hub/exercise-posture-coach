import "./globals.css";

export const metadata = {
  title: "생존수영 트레이너",
  description: "AI 기반 실시간 생존수영 동작 분석 시스템",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "생존수영",
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
