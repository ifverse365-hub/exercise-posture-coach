import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#0a0e17",
        color: "#22d3ee",
        fontFamily: "sans-serif",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 56 }}>💪</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>AI 운동 자세 코치</div>
      <div style={{ fontSize: 13, color: "#94a3b8" }}>
        AI 모델을 불러오는 중...
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid #1e293b",
          borderTopColor: "#22d3ee",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
