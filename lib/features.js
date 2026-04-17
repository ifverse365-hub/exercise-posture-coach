/**
 * MediaPipe 33개 관절 → 114차원 특징 벡터 추출
 * (정규화 좌표 99 + 각도 8 + 거리 6 + 기울기 1)
 */
export function extractFeatures(landmarks) {
  const pts = landmarks.map((l) => [l.x, l.y, l.z]);

  // 엉덩이 중심으로 원점 이동
  const hip = [
    (pts[23][0] + pts[24][0]) / 2,
    (pts[23][1] + pts[24][1]) / 2,
    (pts[23][2] + pts[24][2]) / 2,
  ];
  const norm = pts.map((p) => [p[0] - hip[0], p[1] - hip[1], p[2] - hip[2]]);

  // 어깨 너비로 스케일 정규화
  const shDist =
    Math.hypot(
      pts[11][0] - pts[12][0],
      pts[11][1] - pts[12][1],
      pts[11][2] - pts[12][2]
    ) || 0.001;
  const scaled = norm.map((p) => [
    p[0] / shDist,
    p[1] / shDist,
    p[2] / shDist,
  ]);

  const coords = scaled.flat(); // 99

  // 핵심 관절 각도 (8개)
  function ang(a, b, c) {
    const ba = [
      pts[a][0] - pts[b][0],
      pts[a][1] - pts[b][1],
      pts[a][2] - pts[b][2],
    ];
    const bc = [
      pts[c][0] - pts[b][0],
      pts[c][1] - pts[b][1],
      pts[c][2] - pts[b][2],
    ];
    const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
    const magA = Math.hypot(...ba) || 0.001;
    const magB = Math.hypot(...bc) || 0.001;
    return (
      Math.acos(Math.max(-1, Math.min(1, dot / (magA * magB)))) *
      (180 / Math.PI)
    );
  }

  const angles = [
    ang(23, 11, 13),
    ang(24, 12, 14),
    ang(11, 13, 15),
    ang(12, 14, 16),
    ang(13, 11, 23),
    ang(14, 12, 24),
    ang(11, 23, 25),
    ang(12, 24, 26),
  ].map((a) => a / 180); // 8

  // 핵심 거리 (6개)
  function dist(a, b) {
    return Math.hypot(
      scaled[a][0] - scaled[b][0],
      scaled[a][1] - scaled[b][1],
      scaled[a][2] - scaled[b][2]
    );
  }
  const dists = [
    dist(15, 16),
    dist(15, 23),
    dist(16, 24),
    dist(15, 0),
    dist(16, 0),
    dist(0, 23),
  ]; // 6

  // 상체 기울기 (1개)
  const shMid = [(pts[11][0] + pts[12][0]) / 2, (pts[11][1] + pts[12][1]) / 2];
  const hpMid = [(pts[23][0] + pts[24][0]) / 2, (pts[23][1] + pts[24][1]) / 2];
  const diff = [shMid[0] - hpMid[0], shMid[1] - hpMid[1]];
  const lean = [
    (Math.atan2(Math.abs(diff[0]), Math.abs(diff[1])) * (180 / Math.PI)) / 90,
  ]; // 1

  return [...coords, ...angles, ...dists, ...lean]; // 114
}
