/**
 * 가이드 단계별 스켈레톤 스틱 피규어 SVG 컴포넌트
 * motionId + stageIndex → 목표 자세를 보여주는 인라인 SVG
 */

// 각 포즈의 관절 좌표 (viewBox 0 0 36 36)
// head, neck, shoulderL, shoulderR, elbowL, elbowR, wristL, wristR,
// hipL, hipR, kneeL, kneeR, ankleL, ankleR
// highlight: 강조할 segment 이름 배열

const POSES = {
  // ── HELP 자세 (seated) ──────────────────────────
  // Stage 0: 팔 교차 — 양 손목이 가슴 중앙에서 X자
  "1-0": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [15, 14], elbowR: [21, 14],
    wristL: [23, 12], wristR: [13, 12],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [13, 26], kneeR: [23, 26],
    ankleL: [13, 32], ankleR: [23, 32],
    highlight: ["armL", "armR"],
  },
  // Stage 1: 팔꿈치 접기 — 팔꿈치 더 타이트하게
  "1-1": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [14, 13], elbowR: [22, 13],
    wristL: [21, 11], wristR: [15, 11],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [13, 26], kneeR: [23, 26],
    ankleL: [13, 32], ankleR: [23, 32],
    highlight: ["elbowL", "elbowR"],
  },
  // Stage 2: 무릎 올리기 — 무릎이 가슴까지
  "1-2": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [14, 13], elbowR: [22, 13],
    wristL: [21, 11], wristR: [15, 11],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [13, 16], kneeR: [23, 16],
    ankleL: [15, 22], ankleR: [21, 22],
    highlight: ["legL", "legR"],
  },

  // ── 새우등뜨기 (seated, forward bend) ──────────
  // Stage 0: 상체 숙이기 — 상체 앞으로 90°+
  "2-0": {
    head: [27, 12], neck: [25, 11],
    shoulderL: [22, 9], shoulderR: [28, 9],
    elbowL: [20, 14], elbowR: [27, 14],
    wristL: [19, 18], wristR: [26, 18],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [12, 26], kneeR: [22, 26],
    ankleL: [12, 32], ankleR: [22, 32],
    highlight: ["torso"],
  },
  // Stage 1: 머리 숙이기 — 머리가 어깨 아래로
  "2-1": {
    head: [28, 15], neck: [26, 12],
    shoulderL: [22, 9], shoulderR: [28, 9],
    elbowL: [20, 14], elbowR: [27, 14],
    wristL: [19, 18], wristR: [26, 18],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [12, 26], kneeR: [22, 26],
    ankleL: [12, 32], ankleR: [22, 32],
    highlight: ["head"],
  },
  // Stage 2: 무릎 감싸기 — 양손이 무릎 감쌈
  "2-2": {
    head: [28, 15], neck: [26, 12],
    shoulderL: [22, 9], shoulderR: [28, 9],
    elbowL: [18, 16], elbowR: [24, 16],
    wristL: [14, 22], wristR: [22, 22],
    hipL: [14, 20], hipR: [22, 20],
    kneeL: [12, 26], kneeR: [22, 26],
    ankleL: [12, 32], ankleR: [22, 32],
    highlight: ["armL", "armR"],
  },

  // ── 누워뜨기 (standing, T-pose) ───────────────
  // Stage 0: 팔 벌리기 — T자 팔 벌림
  "6-0": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [7, 10], elbowR: [29, 10],
    wristL: [2, 10], wristR: [34, 10],
    hipL: [14, 22], hipR: [22, 22],
    kneeL: [14, 28], kneeR: [22, 28],
    ankleL: [14, 34], ankleR: [22, 34],
    highlight: ["armL", "armR"],
  },
  // Stage 1: 팔 높이 — 어깨 높이 수평 유지
  "6-1": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [7, 10], elbowR: [29, 10],
    wristL: [2, 10], wristR: [34, 10],
    hipL: [14, 22], hipR: [22, 22],
    kneeL: [14, 28], kneeR: [22, 28],
    ankleL: [14, 34], ankleR: [22, 34],
    highlight: ["shoulderLine"],
    // 어깨 높이 기준선 표시
    refLine: { y: 10, dash: true },
  },
  // Stage 2: 팔꿈치 펴기 — 팔꿈치 완전히 폄
  "6-2": {
    head: [18, 4], neck: [18, 8],
    shoulderL: [12, 10], shoulderR: [24, 10],
    elbowL: [7, 10], elbowR: [29, 10],
    wristL: [2, 10], wristR: [34, 10],
    hipL: [14, 22], hipR: [22, 22],
    kneeL: [14, 28], kneeR: [22, 28],
    ankleL: [14, 34], ankleR: [22, 34],
    highlight: ["elbowL", "elbowR"],
  },
};

function Line({ x1, y1, x2, y2, stroke, strokeWidth = 2, ...props }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" {...props} />;
}

function isHighlighted(pose, segmentName) {
  return pose.highlight.includes(segmentName);
}

export function StageSkeleton({
  motionId,
  stageIndex,
  color = "currentColor",
  highlightColor = null,
  size = 36,
}) {
  const key = `${motionId}-${stageIndex}`;
  const pose = POSES[key];
  if (!pose) return null;

  const hl = highlightColor || color;
  const dim = color; // 기본 색상 (비강조 부위)

  const armLHighlight = isHighlighted(pose, "armL");
  const armRHighlight = isHighlighted(pose, "armR");
  const legLHighlight = isHighlighted(pose, "legL");
  const legRHighlight = isHighlighted(pose, "legR");
  const torsoHighlight = isHighlighted(pose, "torso");
  const headHighlight = isHighlighted(pose, "head");
  const elbowLHighlight = isHighlighted(pose, "elbowL");
  const elbowRHighlight = isHighlighted(pose, "elbowR");
  const shoulderLineHighlight = isHighlighted(pose, "shoulderLine");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 기준선 (어깨 높이 등) */}
      {pose.refLine && (
        <line
          x1={1} y1={pose.refLine.y}
          x2={35} y2={pose.refLine.y}
          stroke={hl}
          strokeWidth={1}
          strokeDasharray={pose.refLine.dash ? "2 2" : "none"}
          opacity={0.5}
        />
      )}

      {/* 머리 */}
      <circle
        cx={pose.head[0]}
        cy={pose.head[1]}
        r={3}
        stroke={headHighlight ? hl : dim}
        strokeWidth={headHighlight ? 2 : 1.5}
        fill="none"
      />

      {/* 목 → 어깨 중간 */}
      <Line
        x1={pose.neck[0]} y1={pose.neck[1]}
        x2={pose.head[0]} y2={pose.head[1] + 3}
        stroke={torsoHighlight ? hl : dim}
      />

      {/* 어깨선 */}
      <Line
        x1={pose.shoulderL[0]} y1={pose.shoulderL[1]}
        x2={pose.shoulderR[0]} y2={pose.shoulderR[1]}
        stroke={shoulderLineHighlight ? hl : dim}
        strokeWidth={shoulderLineHighlight ? 2.5 : 2}
      />

      {/* 몸통 (목 → 엉덩이 중간) */}
      <Line
        x1={pose.neck[0]} y1={pose.neck[1]}
        x2={(pose.hipL[0] + pose.hipR[0]) / 2}
        y2={(pose.hipL[1] + pose.hipR[1]) / 2}
        stroke={torsoHighlight ? hl : dim}
        strokeWidth={torsoHighlight ? 2.5 : 2}
      />

      {/* 엉덩이선 */}
      <Line
        x1={pose.hipL[0]} y1={pose.hipL[1]}
        x2={pose.hipR[0]} y2={pose.hipR[1]}
        stroke={dim}
      />

      {/* 왼팔: 어깨 → 팔꿈치 → 손목 */}
      <Line
        x1={pose.shoulderL[0]} y1={pose.shoulderL[1]}
        x2={pose.elbowL[0]} y2={pose.elbowL[1]}
        stroke={armLHighlight || elbowLHighlight ? hl : dim}
        strokeWidth={armLHighlight ? 2.5 : 2}
      />
      <Line
        x1={pose.elbowL[0]} y1={pose.elbowL[1]}
        x2={pose.wristL[0]} y2={pose.wristL[1]}
        stroke={armLHighlight || elbowLHighlight ? hl : dim}
        strokeWidth={armLHighlight ? 2.5 : 2}
      />

      {/* 오른팔: 어깨 → 팔꿈치 → 손목 */}
      <Line
        x1={pose.shoulderR[0]} y1={pose.shoulderR[1]}
        x2={pose.elbowR[0]} y2={pose.elbowR[1]}
        stroke={armRHighlight || elbowRHighlight ? hl : dim}
        strokeWidth={armRHighlight ? 2.5 : 2}
      />
      <Line
        x1={pose.elbowR[0]} y1={pose.elbowR[1]}
        x2={pose.wristR[0]} y2={pose.wristR[1]}
        stroke={armRHighlight || elbowRHighlight ? hl : dim}
        strokeWidth={armRHighlight ? 2.5 : 2}
      />

      {/* 팔꿈치 관절 강조 (팔꿈치 펴기 등) */}
      {elbowLHighlight && (
        <circle cx={pose.elbowL[0]} cy={pose.elbowL[1]} r={2} fill={hl} />
      )}
      {elbowRHighlight && (
        <circle cx={pose.elbowR[0]} cy={pose.elbowR[1]} r={2} fill={hl} />
      )}

      {/* 왼다리: 엉덩이 → 무릎 → 발목 */}
      <Line
        x1={pose.hipL[0]} y1={pose.hipL[1]}
        x2={pose.kneeL[0]} y2={pose.kneeL[1]}
        stroke={legLHighlight ? hl : dim}
        strokeWidth={legLHighlight ? 2.5 : 2}
      />
      <Line
        x1={pose.kneeL[0]} y1={pose.kneeL[1]}
        x2={pose.ankleL[0]} y2={pose.ankleL[1]}
        stroke={legLHighlight ? hl : dim}
        strokeWidth={legLHighlight ? 2.5 : 2}
      />

      {/* 오른다리: 엉덩이 → 무릎 → 발목 */}
      <Line
        x1={pose.hipR[0]} y1={pose.hipR[1]}
        x2={pose.kneeR[0]} y2={pose.kneeR[1]}
        stroke={legRHighlight ? hl : dim}
        strokeWidth={legRHighlight ? 2.5 : 2}
      />
      <Line
        x1={pose.kneeR[0]} y1={pose.kneeR[1]}
        x2={pose.ankleR[0]} y2={pose.ankleR[1]}
        stroke={legRHighlight ? hl : dim}
        strokeWidth={legRHighlight ? 2.5 : 2}
      />

      {/* 손목 끝점 (교차/감싸기 강조) */}
      {(armLHighlight || armRHighlight) && (
        <>
          <circle cx={pose.wristL[0]} cy={pose.wristL[1]} r={1.5} fill={hl} />
          <circle cx={pose.wristR[0]} cy={pose.wristR[1]} r={1.5} fill={hl} />
        </>
      )}
    </svg>
  );
}
