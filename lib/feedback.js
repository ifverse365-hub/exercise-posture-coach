/**
 * 규칙 기반 자세 피드백 시스템 - 헬스 운동용
 */

function getPoint(landmarks, idx) {
  const lm = landmarks[idx];
  return { x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility };
}

function distance2D(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function midpoint(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
}

function angle3D(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magA = Math.hypot(ba.x, ba.y, ba.z) || 0.001;
  const magC = Math.hypot(bc.x, bc.y, bc.z) || 0.001;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC)))) * (180 / Math.PI);
}

function getShoulderWidth(landmarks) {
  return distance2D(getPoint(landmarks, 11), getPoint(landmarks, 12)) || 0.001;
}

export class FeedbackHistory {
  constructor(maxFrames = 15) { this.maxFrames = maxFrames; this.history = []; }
  add(landmarks) {
    this.history.push({ timestamp: Date.now(), landmarks });
    if (this.history.length > this.maxFrames) this.history.shift();
  }
  getYMovement(idx) {
    if (this.history.length < 5) return 0;
    return this.history.slice(1).reduce((sum, h, i) => sum + Math.abs(h.landmarks[idx].y - this.history[i].landmarks[idx].y), 0);
  }
  getXMovement(idx) {
    if (this.history.length < 5) return 0;
    return this.history.slice(1).reduce((sum, h, i) => sum + Math.abs(h.landmarks[idx].x - this.history[i].landmarks[idx].x), 0);
  }
  getHipHeightChange() {
    if (this.history.length < 5) return { range: 0 };
    const heights = this.history.map(h => (h.landmarks[23].y + h.landmarks[24].y) / 2);
    return { range: Math.max(...heights) - Math.min(...heights) };
  }
  getWristDistanceChange() {
    if (this.history.length < 5) return { range: 0 };
    const dists = this.history.map(h => Math.hypot(h.landmarks[15].x - h.landmarks[16].x, h.landmarks[15].y - h.landmarks[16].y));
    return { range: Math.max(...dists) - Math.min(...dists) };
  }
  clear() { this.history = []; }
}

export function evaluatePose(motionId, landmarks, history) {
  if (!landmarks || landmarks.length < 33) return { checks: [], overallScore: 0, summaryMessage: "포즈 감지 불가", allPassed: false };
  switch (motionId) {
    case 1: return evaluateSquat(landmarks, history);
    case 2: return evaluateLunge(landmarks, history);
    case 3: return evaluatePushup(landmarks, history);
    case 4: return evaluatePlank(landmarks);
    case 5: return evaluateShoulderPress(landmarks, history);
    case 6: return evaluateBurpee(landmarks, history);
    default: return { checks: [], overallScore: 0, summaryMessage: "알 수 없는 동작", allPassed: false };
  }
}

function evaluateSquat(lm, hist) {
  const checks = [], sw = getShoulderWidth(lm);
  const lS = getPoint(lm, 11), rS = getPoint(lm, 12), lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const lK = getPoint(lm, 25), rK = getPoint(lm, 26), lA = getPoint(lm, 27), rA = getPoint(lm, 28);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH);
  const avgKnee = (angle3D(lH, lK, lA) + angle3D(rH, rK, rA)) / 2;
  checks.push({ name: "스쿼트 깊이", passed: avgKnee < 110, message: avgKnee < 110 ? "충분히 내려감" : "더 내려가세요", priority: 1 });
  checks.push({ name: "무릎 정렬", passed: distance2D(lK, rK) >= distance2D(lA, rA) * 0.9, message: distance2D(lK, rK) >= distance2D(lA, rA) * 0.9 ? "정렬 좋음" : "무릎 모이지 않게", priority: 2 });
  const torso = Math.atan2(sMid.y - hMid.y, Math.abs(sMid.x - hMid.x)) * (180 / Math.PI);
  checks.push({ name: "상체 자세", passed: torso > 60, message: torso > 60 ? "상체 바름" : "상체 세우세요", priority: 3 });
  const moving = hist ? hist.getHipHeightChange().range > 0.05 : false;
  checks.push({ name: "동작 수행", passed: moving, message: moving ? "동작 중" : "앉았다 일어서세요", priority: 4 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "완벽한 스쿼트!" : p + "/" + checks.length, allPassed: p === checks.length };
}

function evaluateLunge(lm, hist) {
  const checks = [], sw = getShoulderWidth(lm);
  const lS = getPoint(lm, 11), rS = getPoint(lm, 12), lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const lK = getPoint(lm, 25), rK = getPoint(lm, 26), lA = getPoint(lm, 27), rA = getPoint(lm, 28);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH);
  const leftFwd = lA.y > rA.y;
  const fK = leftFwd ? lK : rK, fA = leftFwd ? lA : rA, fH = leftFwd ? lH : rH;
  const bK = leftFwd ? rK : lK, bA = leftFwd ? rA : lA, bH = leftFwd ? rH : lH;
  const fAngle = angle3D(fH, fK, fA);
  checks.push({ name: "앞무릎 각도", passed: fAngle > 70 && fAngle < 110, message: (fAngle > 70 && fAngle < 110) ? "90도 유지" : "조절 필요", priority: 1 });
  checks.push({ name: "뒷무릎", passed: angle3D(bH, bK, bA) < 130, message: angle3D(bH, bK, bA) < 130 ? "좋습니다" : "더 내리세요", priority: 2 });
  checks.push({ name: "상체 수직", passed: Math.abs(sMid.x - hMid.x) < sw * 0.3, message: Math.abs(sMid.x - hMid.x) < sw * 0.3 ? "바름" : "세우세요", priority: 3 });
  checks.push({ name: "보폭", passed: Math.abs(fA.y - bA.y) > sw * 0.5, message: Math.abs(fA.y - bA.y) > sw * 0.5 ? "적절" : "크게 내딛으세요", priority: 4 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "완벽한 런지!" : p + "/" + checks.length, allPassed: p === checks.length };
}

function evaluatePushup(lm, hist) {
  const checks = [], sw = getShoulderWidth(lm);
  const lS = getPoint(lm, 11), rS = getPoint(lm, 12), lE = getPoint(lm, 13), rE = getPoint(lm, 14);
  const lW = getPoint(lm, 15), rW = getPoint(lm, 16), lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH);
  const avgElbow = (angle3D(lS, lE, lW) + angle3D(rS, rE, rW)) / 2;
  checks.push({ name: "내려가기", passed: avgElbow < 110, message: avgElbow < 110 ? "충분히 내려감" : "더 내려가세요", priority: 1 });
  checks.push({ name: "몸 일직선", passed: Math.abs(sMid.y - hMid.y) < sw * 0.4, message: Math.abs(sMid.y - hMid.y) < sw * 0.4 ? "일직선 유지" : "허리 조절", priority: 2 });
  checks.push({ name: "손 위치", passed: Math.abs(lW.x - lS.x) < sw * 0.5 && Math.abs(rW.x - rS.x) < sw * 0.5, message: Math.abs(lW.x - lS.x) < sw * 0.5 ? "좋습니다" : "어깨 아래로", priority: 3 });
  const moving = hist ? hist.getYMovement(0) > 0.03 : false;
  checks.push({ name: "동작 수행", passed: moving, message: moving ? "동작 중" : "팔을 굽혔다 펴세요", priority: 4 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "완벽한 푸시업!" : p + "/" + checks.length, allPassed: p === checks.length };
}

function evaluatePlank(lm) {
  const checks = [], sw = getShoulderWidth(lm);
  const nose = getPoint(lm, 0), lS = getPoint(lm, 11), rS = getPoint(lm, 12);
  const lE = getPoint(lm, 13), rE = getPoint(lm, 14), lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const lA = getPoint(lm, 27), rA = getPoint(lm, 28);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH), aMid = midpoint(lA, rA), eMid = midpoint(lE, rE);
  checks.push({ name: "팔꿈치 위치", passed: Math.abs(eMid.x - sMid.x) < sw * 0.4, message: Math.abs(eMid.x - sMid.x) < sw * 0.4 ? "좋습니다" : "어깨 아래로", priority: 1 });
  const expHip = (sMid.y + aMid.y) / 2;
  checks.push({ name: "허리 정렬", passed: Math.abs(hMid.y - expHip) < sw * 0.3, message: Math.abs(hMid.y - expHip) < sw * 0.3 ? "정렬 좋음" : "허리 조절", priority: 2 });
  checks.push({ name: "시선", passed: nose.y > sMid.y - sw * 0.5, message: nose.y > sMid.y - sw * 0.5 ? "좋습니다" : "바닥을 보세요", priority: 3 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "완벽한 플랭크!" : p + "/" + checks.length, allPassed: p === checks.length };
}

function evaluateShoulderPress(lm, hist) {
  const checks = [], sw = getShoulderWidth(lm);
  const nose = getPoint(lm, 0), lS = getPoint(lm, 11), rS = getPoint(lm, 12);
  const lE = getPoint(lm, 13), rE = getPoint(lm, 14), lW = getPoint(lm, 15), rW = getPoint(lm, 16);
  const lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH);
  checks.push({ name: "팔 올리기", passed: lW.y < nose.y && rW.y < nose.y, message: (lW.y < nose.y && rW.y < nose.y) ? "올라갔습니다" : "머리 위로", priority: 1 });
  checks.push({ name: "팔꿈치 펴기", passed: angle3D(lS, lE, lW) > 150 && angle3D(rS, rE, rW) > 150, message: angle3D(lS, lE, lW) > 150 ? "펴졌습니다" : "펴세요", priority: 2 });
  checks.push({ name: "허리 중립", passed: (sMid.x - hMid.x) <= sw * 0.2, message: (sMid.x - hMid.x) <= sw * 0.2 ? "좋습니다" : "허리 젖히지 마세요", priority: 3 });
  const moving = hist ? (hist.getYMovement(15) + hist.getYMovement(16)) / 2 > 0.03 : false;
  checks.push({ name: "동작 수행", passed: moving, message: moving ? "동작 중" : "올렸다 내리세요", priority: 4 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "완벽한 숄더프레스!" : p + "/" + checks.length, allPassed: p === checks.length };
}

function evaluateBurpee(lm, hist) {
  const checks = [], sw = getShoulderWidth(lm);
  const lS = getPoint(lm, 11), rS = getPoint(lm, 12), lH = getPoint(lm, 23), rH = getPoint(lm, 24);
  const lA = getPoint(lm, 27), rA = getPoint(lm, 28);
  const sMid = midpoint(lS, rS), hMid = midpoint(lH, rH), aMid = midpoint(lA, rA);
  const moving = hist ? hist.getHipHeightChange().range > 0.1 : false;
  checks.push({ name: "전신 움직임", passed: moving, message: moving ? "좋습니다" : "스쿼트-플랭크-점프", priority: 1 });
  const isFloor = sMid.y > hMid.y - sw * 0.3;
  checks.push({ name: "자세 전환", passed: moving, message: isFloor ? "바닥자세" : "서있음", priority: 2 });
  const formOk = !isFloor || Math.abs(sMid.y - hMid.y) < sw * 0.5;
  checks.push({ name: "자세 유지", passed: formOk, message: formOk ? "좋습니다" : "허리 조절", priority: 3 });
  const p = checks.filter(c => c.passed).length;
  return { checks, overallScore: Math.round((p / checks.length) * 100), summaryMessage: p === checks.length ? "버피 좋습니다!" : p + "/" + checks.length, allPassed: p === checks.length };
}

export function evaluateReadyPose(lm) {
  if (!lm || lm.length < 33) return { isReady: false, message: "포즈 감지 불가" };
  const sw = getShoulderWidth(lm);
  const lS = getPoint(lm, 11), rS = getPoint(lm, 12), lW = getPoint(lm, 15), rW = getPoint(lm, 16);
  const sMid = midpoint(lS, rS);
  const level = Math.abs(lS.y - rS.y) < sw * 0.15;
  const armsDown = lW.y > sMid.y && rW.y > sMid.y;
  const facing = sw > 0.08;
  const isReady = level && armsDown && facing;
  let msg = "준비자세를 취하세요";
  if (!facing) msg = "카메라를 정면으로";
  else if (!level) msg = "어깨를 수평으로";
  else if (!armsDown) msg = "양팔을 내려주세요";
  else msg = "준비 완료! 시작하세요";
  return { isReady, message: msg };
}
