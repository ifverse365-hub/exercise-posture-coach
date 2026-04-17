"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MOTIONS } from "@/lib/motions";
import { extractFeatures } from "@/lib/features";
import { KNNClassifier } from "@/lib/knn";
import { PracticeSession } from "@/lib/session";
import { evaluatePose, FeedbackHistory } from "@/lib/feedback";
import { StageSkeleton } from "@/lib/skeletonIcons";
import {
  getSchools,
  createSchool,
  verifyAdminPassword,
  saveTrainingData,
  deleteTrainingData,
  deleteAllTrainingDataBySchool,
  DEFAULT_SCHOOL_ID,
} from "@/lib/supabase";

// 스켈레톤 연결선
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

// 학습 콘텐츠 데이터
const LEARN_CONTENT = {
  intro: {
    title: "생존수영이란",
    icon: "📘",
    content: `생존수영은 위급한 수상 상황에서 자신의 생명을 지키기 위한 기본적인 수영 기술입니다.

물에 빠졌을 때 구조대가 올 때까지 체력을 보존하고, 침착하게 대응하는 방법을 배웁니다.

2015년부터 초등학교 정규 교육과정에 포함되어 모든 학생들이 배우게 되었습니다.`,
    points: [
      "물에서 호흡 유지하기",
      "체온 보존 자세 취하기",
      "구조 신호 보내기",
      "기본 영법으로 이동하기"
    ]
  },
  safety: {
    title: "물놀이 안전수칙",
    icon: "⚠️",
    content: `안전한 물놀이를 위해 반드시 지켜야 할 수칙들입니다.`,
    points: [
      "수영 전 충분한 준비운동 하기",
      "보호자나 안전요원이 있는 곳에서만 수영하기",
      "음식을 먹은 직후에는 수영하지 않기",
      "수심을 확인하고 뛰어들지 않기",
      "구명조끼 착용하기"
    ]
  },
  cpr: {
    title: "심폐소생술",
    icon: "❤️",
    content: `익수자를 구조한 후 의식이 없고 호흡이 없다면 즉시 심폐소생술을 시작해야 합니다.`,
    points: [
      "119에 신고하기",
      "가슴 압박 30회 실시",
      "인공호흡 2회 실시",
      "구급대가 올 때까지 반복"
    ]
  }
};

export default function App() {
  // 탭 상태
  const [activeTab, setActiveTab] = useState("home");

  // 연습/녹화 상태
  const [practiceMode, setPracticeMode] = useState(null); // null | "select" | "instant" | "knn" | "record"
  const [currentMotion, setCurrentMotion] = useState(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [holdGoalInput, setHoldGoalInput] = useState(30);

  // 학습 상태
  const [learnView, setLearnView] = useState(null); // null | motionId | "intro" | "safety" | "cpr"

  // 카메라/AI 상태
  const [cameraActive, setCameraActive] = useState(false);
  const [fps, setFps] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [practiceComplete, setPracticeComplete] = useState(null); // 완료 결과 {motionId, holdSec, cycles, score}
  const [, forceUpdate] = useState(0);

  // 카메라 선택
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("swim_camera_id") || "";
    }
    return "";
  });
  // 학교/관리자 상태
  const [schools, setSchools] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("swim_school_id") || "";
    }
    return "";
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // 피드백 상태
  const [feedback, setFeedback] = useState(null);

  // 모달
  const [modal, setModal] = useState(null);
  const modalResolveRef = useRef(null);

  // 토스트
  const [toast, setToast] = useState(null);

  // 자세 미리보기
  const [previewImage, setPreviewImage] = useState(null);

  // refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraContainerRef = useRef(null);
  const landmarkerRef = useRef(null);
  const classifiersRef = useRef({});
  const sessionRef = useRef(null);
  const lastPoseRef = useRef(null);
  const feedbackHistoryRef = useRef(new FeedbackHistory(15));
  const frameCountRef = useRef(0);
  const fpsTimeRef = useRef(performance.now());
  const lastTimestampRef = useRef(0);
  const rafRef = useRef(null);
  const flashRef = useRef([]);
  const streamRef = useRef(null);
  const practiceModeRef = useRef(practiceMode);
  const currentMotionRef = useRef(currentMotion);
  const graceStartRef = useRef(null); // 유예 시간 시작 시점
  const feedbackRef = useRef(null); // 피드백 ref (매 프레임 업데이트)
  const lastUIUpdateRef = useRef(0); // UI 업데이트 쓰로틀 타이머
  const UI_THROTTLE_MS = 150; // UI 업데이트 간격 (ms)

  // refs를 최신 상태로 동기화 (mainLoop 스테일 클로저 방지)
  practiceModeRef.current = practiceMode;
  currentMotionRef.current = currentMotion;

  // ═══════════════════════════════════════════════════════════
  // 초기화
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    async function init() {
      // KNN 분류기 초기화
      for (let i = 1; i <= 6; i++) {
        classifiersRef.current[i] = new KNNClassifier(5);
      }

      // 학교 목록 로드
      try {
        const schoolList = await getSchools();
        setSchools(schoolList);
      } catch (err) {
        console.error("Failed to load schools:", err);
      }

      // Supabase에서 학습 데이터 로드 (동작별 + step name 라벨)
      const savedSchoolId = localStorage.getItem("swim_school_id") || "";
      try {
        for (let i = 1; i <= 6; i++) {
          await classifiersRef.current[i].loadFromSupabase(
            i.toString(), MOTIONS[i].steps, savedSchoolId || null
          );
        }
        console.log("Training data loaded from Supabase");
      } catch (err) {
        console.error("Failed to load training data:", err);
      }

      // Supabase 데이터가 없는 동작만 localStorage에서 병합
      mergeLocalStorage();
      setDataLoading(false);

      // MediaPipe 로드
      const vision = await import("@mediapipe/tasks-vision");
      const { PoseLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      landmarkerRef.current = await PoseLandmarker.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }
      );
      setModelReady(true);
    }

    init().catch(console.error);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 카메라 제어
  // ═══════════════════════════════════════════════════════════

  // 카메라 목록 가져오기
  async function loadCameras() {
    try {
      // 권한 요청을 위해 임시로 미디어 스트림 획득
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === "videoinput");
      setCameras(videoDevices);

      // 저장된 카메라가 없거나 유효하지 않으면 첫 번째 카메라 선택
      if (!selectedCameraId || !videoDevices.find(d => d.deviceId === selectedCameraId)) {
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      }
    } catch (err) {
      console.error("Failed to load cameras:", err);
    }
  }

  // 초기 카메라 목록 로드
  useEffect(() => {
    loadCameras();
  }, []);

  async function startCamera() {
    if (streamRef.current) return;
    try {
      // 16:9 해상도 선호 (카메라가 지원하면 사용, 아니면 가능한 해상도 사용)
      const videoConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: "user" }),
      };
      const constraints = { video: videoConstraints };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      lastTimestampRef.current = 0;
      feedbackHistoryRef.current.clear();
      rafRef.current = requestAnimationFrame(mainLoop);
    } catch (err) {
      console.error("Camera failed:", err);
      showToast("카메라를 사용할 수 없습니다", "error");
    }
  }

  function stopCamera() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFps(0);
    setFeedback(null);
  }

  // ═══════════════════════════════════════════════════════════
  // 메인 루프
  // ═══════════════════════════════════════════════════════════
  const mainLoop = useCallback((timestamp) => {
    rafRef.current = requestAnimationFrame(mainLoop);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!landmarker || !video || !canvas || !video.videoWidth) return;

    // FPS
    frameCountRef.current++;
    if (timestamp - fpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      fpsTimeRef.current = timestamp;
    }

    // 캔버스 리사이즈
    const container = cameraContainerRef.current;
    if (container && (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight)) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    if (timestamp <= lastTimestampRef.current) return;
    lastTimestampRef.current = timestamp;

    const result = landmarker.detectForVideo(video, timestamp);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks && result.landmarks.length > 0) {
      const lms = result.landmarks[0];
      lastPoseRef.current = lms;
      drawSkeleton(ctx, lms, canvas.width, canvas.height, video.videoWidth, video.videoHeight);

      // 피드백 히스토리 업데이트
      feedbackHistoryRef.current.add(lms);

      const pm = practiceModeRef.current;
      const cm = currentMotionRef.current;

      // 즉시 연습 모드 또는 KNN 모드: 규칙 기반 피드백은 항상 실행
      if ((pm === "instant" || pm === "knn") && cm) {
        const fb = evaluatePose(cm, lms, feedbackHistoryRef.current);
        feedbackRef.current = fb;

        const session = sessionRef.current;
        let needsUIUpdate = false;

        if (pm === "instant") {
          const GRACE_MS = 500; // 0.5초 유예

          if (session && session.motion.holdStages && !session.guideStageDone) {
            // ── 가이드 단계 진행 중 ──
            const stageIdx = session.guideStageIdx;
            const checksUpToCurrent = fb.checks.slice(0, stageIdx + 1);
            const allUpToCurrent = checksUpToCurrent.every(c => c.passed);

            session.updateGuideStageConfirm(allUpToCurrent, timestamp / 1000);

            if (allUpToCurrent && session.guideStageConfirmSec >= session.currentGuideStage.confirmSec) {
              session.advanceGuideStage();
              if (session.flashMsg && performance.now() - session.flashTime < 100) {
                addFlash(session.flashMsg);
                session.flashMsg = "";
              }
              // guideStageDone이 되면 graceStart 리셋
              if (session.guideStageDone) {
                graceStartRef.current = null;
              }
            }
            needsUIUpdate = true;
          } else if (session && fb.allPassed) {
            // ── 전체 체크 통과 (가이드 완료 후 최종 유지 또는 비가이드) ──
            graceStartRef.current = null;
            if (session.motion.instantGoal) {
              // 시퀀스 동작 즉시 모드: 시간 기반 추적
              session.updateInstantHold(timestamp / 1000);
            } else {
              session.update(session.motion.sequence[0] || "완료", 1.0, timestamp / 1000);
            }
            if (session.flashMsg && performance.now() - session.flashTime < 100) {
              addFlash(session.flashMsg);
              session.flashMsg = "";
            }
            needsUIUpdate = true;
          } else if (session) {
            // ── 체크 미통과 → 유예 시간 처리 ──
            const now = performance.now();
            if (!graceStartRef.current) {
              graceStartRef.current = now;
            }
            if (now - graceStartRef.current > GRACE_MS) {
              // 최종 유지 단계에서만 holdSec 리셋
              if (session.guideStageDone || !session.motion.holdStages) {
                session.holdStart = null;
                session.holdSec = 0;
              }
              needsUIUpdate = true;
            }
          }
        } else if (pm === "knn") {
          // KNN 모드: AI 분류 + 규칙 피드백 병행
          const clf = classifiersRef.current[cm];
          if (session && clf && clf.numClasses >= 2) {
            const features = extractFeatures(lms);
            const { label, confidence } = clf.predict(features);
            session.update(label, confidence, timestamp / 1000);

            if (session.flashMsg && performance.now() - session.flashTime < 100) {
              addFlash(session.flashMsg);
              session.flashMsg = "";
            }
          }
          needsUIUpdate = true;
        }

        // 목표 달성 감지 → 카메라 정지 + 완료 화면
        if (session && session.done) {
          const m = MOTIONS[cm];
          saveHistory(session);
          // RAF 중단 (카메라 인식 정지)
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          // 진동 피드백 (모바일)
          if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
          setPracticeComplete({
            motionId: cm,
            motionName: m.name,
            motionIcon: m.icon,
            holdSec: session.holdSec,
            cycles: session.cyclesDone,
            targetCycles: m.targetCycles,
            holdGoal: session.customHoldGoal,
            score: session.score,
            holdMode: m.holdMode || !!m.instantGoal,
          });
          setFeedback(feedbackRef.current);
          forceUpdate(n => n + 1);
          return; // 루프 종료
        }

        // UI 업데이트 쓰로틀: 150ms 간격으로만 React 리렌더링
        const now = performance.now();
        if (needsUIUpdate && now - lastUIUpdateRef.current >= UI_THROTTLE_MS) {
          lastUIUpdateRef.current = now;
          setFeedback(feedbackRef.current);
          forceUpdate(n => n + 1);
        }
      }
    } else {
      lastPoseRef.current = null;
      if (feedbackRef.current !== null) {
        feedbackRef.current = null;
        setFeedback(null);
      }
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // 스켈레톤 그리기
  // ═══════════════════════════════════════════════════════════
  function drawSkeleton(ctx, lms, cw, ch, vw, vh) {
    // object-fit: contain과 동일하게 Math.min 사용
    const scale = Math.min(cw / vw, ch / vh);
    const ox = (cw - vw * scale) / 2;
    const oy = (ch - vh * scale) / 2;

    function toScreen(lm) {
      // 좌우반전 (거울 모드)
      return [(1 - lm.x) * vw * scale + ox, lm.y * vh * scale + oy];
    }

    ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
    ctx.lineWidth = 2.5;
    for (const [a, b] of CONNECTIONS) {
      const [x1, y1] = toScreen(lms[a]);
      const [x2, y2] = toScreen(lms[b]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    for (let i = 11; i < 33; i++) {
      const [x, y] = toScreen(lms[i]);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 유틸리티
  // ═══════════════════════════════════════════════════════════
  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  // ── 커스텀 모달 ──
  // type: "confirm" | "prompt" | "prompt2" (입력 2개)
  function showModal({ type = "confirm", title, message, placeholder, placeholder2, danger }) {
    return new Promise((resolve) => {
      modalResolveRef.current = resolve;
      setModal({ type, title, message, placeholder, placeholder2, danger, inputVal: "", inputVal2: "" });
    });
  }

  function closeModal(result) {
    modalResolveRef.current?.(result);
    modalResolveRef.current = null;
    setModal(null);
  }

  function addFlash(msg) {
    const id = Date.now();
    flashRef.current = [...flashRef.current, { id, msg }];
    forceUpdate(n => n + 1);
    setTimeout(() => {
      flashRef.current = flashRef.current.filter(f => f.id !== id);
      forceUpdate(n => n + 1);
    }, 2500);
  }

  async function recordSample() {
    if (!lastPoseRef.current || !currentMotion) return;
    const m = MOTIONS[currentMotion];
    const stepName = m.steps[selectedStep];
    const features = extractFeatures(lastPoseRef.current);
    const clf = classifiersRef.current[currentMotion];

    // 관리자 모드일 때만 Supabase에 저장
    if (isAdmin && selectedSchoolId) {
      const success = await clf.addSampleToSupabase(
        currentMotion.toString(),
        selectedStep,
        stepName,
        features,
        selectedSchoolId
      );
      if (success) {
        const cnt = clf.getSampleCounts()[stepName] || 0;
        addFlash(`${stepName} 녹화! (${cnt}개)`);
      } else {
        showToast("저장 실패", "error");
      }
    } else {
      // 비관리자: localStorage에만 저장 (기존 방식)
      clf.addSample(stepName, features);
      localStorage.setItem(`swim_knn_${currentMotion}`, clf.export());
      const cnt = clf.getSampleCounts()[stepName] || 0;
      addFlash(`${stepName} 녹화! (${cnt}개)`);
    }

    forceUpdate(n => n + 1);
  }

  // ── 키보드 단축키 (SPACE: 녹화, ESC: 종료) ──
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && previewImage) {
        setPreviewImage(null);
        return;
      }
      if (practiceMode === "record") {
        if (e.code === "Space") {
          e.preventDefault();
          recordSample();
        } else if (e.key === "Escape") {
          exitPractice();
        }
      } else if (practiceMode === "instant" || practiceMode === "knn") {
        if (e.key === "Escape") {
          exitPractice();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [practiceMode, currentMotion, selectedStep, previewImage]);

  function startPractice(motionId, mode) {
    setCurrentMotion(motionId);
    const m = MOTIONS[motionId];
    const goal = m.holdMode ? holdGoalInput : null;
    sessionRef.current = new PracticeSession(motionId, goal);
    feedbackHistoryRef.current.clear();
    setPracticeMode(mode);
    startCamera();
  }

  function exitPractice() {
    stopCamera();
    setPracticeMode(null);
    setCurrentMotion(null);
    sessionRef.current = null;
    setFeedback(null);
    feedbackRef.current = null;
    setPracticeComplete(null);
  }

  // ═══════════════════════════════════════════════════════════
  // 히스토리 관리
  // ═══════════════════════════════════════════════════════════
  function saveHistory(session) {
    if (!session || !session.done) return;
    const history = JSON.parse(localStorage.getItem("swim_history") || "[]");
    history.unshift({
      id: Date.now(),
      motionId: session.mid,
      date: new Date().toISOString(),
      score: session.score,
      holdSec: session.holdSec,
      cycles: session.cyclesDone,
    });
    // 최근 100개만 보관
    localStorage.setItem("swim_history", JSON.stringify(history.slice(0, 100)));
  }

  // ═══════════════════════════════════════════════════════════
  // 탭 렌더링
  // ═══════════════════════════════════════════════════════════

  // 홈 탭
  function renderHomeTab() {
    return (
      <div className="main-content">
        <div className="home-hero">
          <div className="hero-icon">🏊</div>
          <h1>생존수영 트레이너</h1>
          <p>AI 기반 실시간 동작 분석 시스템</p>
        </div>

        <div className="home-section">
          <div className="section-title">🎯 생존수영 동작</div>
          <div className="motion-cards-grid">
            {Object.entries(MOTIONS).filter(([, m]) => !m.hidden).map(([id, m]) => {
              const clf = classifiersRef.current[id];
              const total = clf?.totalSamples || 0;

              return (
                <div
                  key={id}
                  className="motion-card"
                  onClick={() => {
                    setActiveTab("practice");
                    setPracticeMode("select");
                    setCurrentMotion(parseInt(id));
                    setHoldGoalInput(m.holdGoal || 30);
                  }}
                >
                  <div className="card-icon">{m.icon}</div>
                  <div className="card-info">
                    <h3>
                      {m.name}
                      <span className={`card-badge ${m.posture === "standing" ? "badge-standing" : "badge-seated"}`}>
                        {m.posture === "standing" ? "서서" : "앉아서"}
                      </span>
                    </h3>
                    <p>{m.desc}</p>
                  </div>
                  <div className="card-arrow">›</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 학습 탭
  function renderLearnTab() {
    if (learnView) {
      return renderLearnDetail();
    }

    return (
      <div className="main-content">
        <div className="page-header">
          <h1>📖 학습</h1>
          <p>생존수영의 기초부터 응급처치까지</p>
        </div>

        {/* 생존수영 소개 */}
        <div className="learn-category">
          <div className="category-header">생존수영 소개</div>
          <div className="learn-item" onClick={() => setLearnView("intro")}>
            <span className="item-icon">📘</span>
            <div className="item-text">
              <h4>생존수영이란</h4>
              <p>생존수영의 정의와 필요성</p>
            </div>
            <span className="item-arrow">›</span>
          </div>
        </div>

        {/* 생존뜨기 */}
        <div className="learn-category">
          <div className="category-header">생존뜨기</div>
          {[1, 2, 6].filter(id => !MOTIONS[id].hidden).map(id => {
            const m = MOTIONS[id];
            return (
              <div key={id} className="learn-item" onClick={() => setLearnView(id)}>
                <span className="item-icon">{m.icon}</span>
                <div className="item-text">
                  <h4>{m.name}</h4>
                  <p>{m.sub}</p>
                </div>
                <span className="item-arrow">›</span>
              </div>
            );
          })}
        </div>

        {/* 생존수영 영법 */}
        <div className="learn-category">
          <div className="category-header">생존수영 영법</div>
          {[5, 4, 3].map(id => {
            const m = MOTIONS[id];
            return (
              <div key={id} className="learn-item" onClick={() => setLearnView(id)}>
                <span className="item-icon">{m.icon}</span>
                <div className="item-text">
                  <h4>{m.name}</h4>
                  <p>{m.sub}</p>
                </div>
                <span className="item-arrow">›</span>
              </div>
            );
          })}
        </div>

        {/* 안전/응급 */}
        <div className="learn-category">
          <div className="category-header">수상안전 / 응급처치</div>
          <div className="learn-item" onClick={() => setLearnView("safety")}>
            <span className="item-icon">⚠️</span>
            <div className="item-text">
              <h4>물놀이 안전수칙</h4>
              <p>안전한 물놀이를 위한 수칙</p>
            </div>
            <span className="item-arrow">›</span>
          </div>
          <div className="learn-item" onClick={() => setLearnView("cpr")}>
            <span className="item-icon">❤️</span>
            <div className="item-text">
              <h4>심폐소생술</h4>
              <p>익수자 구조 후 응급처치</p>
            </div>
            <span className="item-arrow">›</span>
          </div>
        </div>
      </div>
    );
  }

  // 학습 상세
  function renderLearnDetail() {
    // 일반 콘텐츠
    if (typeof learnView === "string") {
      const content = LEARN_CONTENT[learnView];
      if (!content) return null;

      return (
        <div className="main-content">
          <div className="practice-header">
            <button className="back-btn" onClick={() => setLearnView(null)}>←</button>
            <h2>{content.title}</h2>
          </div>
          <div className="learn-detail">
            <div className="detail-header">
              <div className="detail-icon">{content.icon}</div>
              <h2>{content.title}</h2>
            </div>
            <div className="detail-section">
              <h3>개요</h3>
              <p style={{ whiteSpace: "pre-line" }}>{content.content}</p>
            </div>
            <div className="detail-section">
              <h3>핵심 포인트</h3>
              <ul className="checklist">
                {content.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    // 동작 상세
    const m = MOTIONS[learnView];
    if (!m) return null;

    const detail = m.detailGuide;

    return (
      <div className="main-content">
        <div className="practice-header">
          <button className="back-btn" onClick={() => setLearnView(null)}>←</button>
          <h2>{m.name}</h2>
        </div>
        <div className="learn-detail">
          <div className="detail-header">
            <div className="detail-icon">{m.icon}</div>
            <h2>{m.name}</h2>
            <p className="detail-sub">{m.sub}</p>
          </div>

          {/* 동작 이미지 */}
          {m.learnImage && (
            <div className="detail-section learn-image-section">
              <img src={m.learnImage} alt={m.name} className="learn-image" />
            </div>
          )}

          {/* 목적 설명 */}
          <div className="detail-section">
            <h3>왜 이 동작을 배우나요?</h3>
            <p>{detail?.purpose || m.guide}</p>
          </div>

          {/* 단계별 가이드 */}
          {detail?.stepByStep && (
            <div className="detail-section">
              <h3>단계별 자세 가이드</h3>
              <div className="step-guide">
                {detail.stepByStep.map((item, i) => (
                  <div key={i} className="step-guide-item">
                    <div className="step-number">{i + 1}</div>
                    <div className="step-content">
                      <strong>{item.step}</strong>
                      <p>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 핵심 포인트 */}
          {detail?.keyPoints && (
            <div className="detail-section">
              <h3>핵심 체크포인트</h3>
              <ul className="checklist success">
                {detail.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 흔한 실수 */}
          {detail?.commonMistakes && (
            <div className="detail-section">
              <h3>이런 실수를 피하세요</h3>
              <ul className="checklist warning">
                {detail.commonMistakes.map((mistake, i) => (
                  <li key={i}>{mistake}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 수행 정보 */}
          <div className="detail-section">
            <h3>수행 정보</h3>
            <div className="info-chips">
              <span className="info-chip">{m.posture === "standing" ? "🧍 서서" : "🪑 앉아서"}</span>
              <span className="info-chip">
                {m.holdMode ? `⏱️ ${m.holdGoal}초 유지` : `🔄 ${m.targetCycles}회 반복`}
              </span>
            </div>
          </div>

          <button
            className="practice-btn"
            onClick={() => {
              setLearnView(null);
              setActiveTab("practice");
              setPracticeMode("select");
              setCurrentMotion(learnView);
              setHoldGoalInput(m.holdGoal || 30);
            }}
          >
            🏊 연습하러 가기
          </button>

          <div className="ref-links">
            <a href="https://www.safetv.go.kr" target="_blank" rel="noopener noreferrer">
              📺 안전한TV 교육영상 보기
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 연습 탭
  function renderPracticeTab() {
    // 카메라 활성 상태 (연습/녹화 중)
    if (practiceMode === "instant" || practiceMode === "knn" || practiceMode === "record") {
      return renderPracticeView();
    }

    // 동작 선택됨 - 모드 선택
    if (practiceMode === "select" && currentMotion) {
      return renderModeSelect();
    }

    // 기본 - 동작 선택
    return (
      <div className="main-content">
        <div className="page-header">
          <h1>🏊 연습</h1>
          <p>동작을 선택하여 연습을 시작하세요</p>
        </div>

        <div className="motion-select">
          <h2>동작 선택</h2>
          {Object.entries(MOTIONS).filter(([, m]) => !m.hidden).map(([id, m]) => {
            const clf = classifiersRef.current[id];
            const trained = (clf?.numClasses || 0) >= 2;

            return (
              <div
                key={id}
                className="motion-select-card"
                onClick={() => {
                  setCurrentMotion(parseInt(id));
                  setHoldGoalInput(m.holdGoal || 30);
                  setPracticeMode("select");
                }}
              >
                <div className="sel-icon">{m.icon}</div>
                <div className="sel-info">
                  <h3>{m.name}</h3>
                  <p>{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 모드 선택 화면
  function renderModeSelect() {
    const m = MOTIONS[currentMotion];
    const clf = classifiersRef.current[currentMotion];
    const trained = (clf?.numClasses || 0) >= 2;
    const total = clf?.totalSamples || 0;

    return (
      <div className="main-content">
        <div className="practice-header">
          <button className="back-btn" onClick={() => { setPracticeMode(null); setCurrentMotion(null); }}>←</button>
          <h2>{m.icon} {m.name}</h2>
        </div>

        <div className="motion-select" style={{ paddingTop: 10 }}>
          <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>
            {m.guide}
          </p>

          {/* 유지시간 설정 (holdMode만) */}
          {m.holdMode && (
            <div className="hold-slider">
              <label>⏱ 목표 유지 시간</label>
              <div className="slider-row">
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={holdGoalInput}
                  onChange={(e) => setHoldGoalInput(parseInt(e.target.value))}
                />
                <span className="slider-value">{holdGoalInput}초</span>
              </div>
            </div>
          )}

          <h2 style={{ marginTop: 20 }}>연습 모드 선택</h2>

          {/* 즉시 연습 */}
          <div
            className="motion-select-card"
            onClick={() => startPractice(currentMotion, "instant")}
          >
            <div className="sel-icon">⚡</div>
            <div className="sel-info">
              <h3>즉시 연습</h3>
              <p>학습 데이터 없이 바로 시작 (규칙 기반 피드백)</p>
            </div>
          </div>

          {/* KNN 연습 */}
          <div
            className="motion-select-card"
            style={{ opacity: trained ? 1 : 0.5 }}
            onClick={() => trained && startPractice(currentMotion, "knn")}
          >
            <div className="sel-icon">🤖</div>
            <div className="sel-info">
              <h3>AI 연습</h3>
              <p>
                {trained
                  ? `학습 데이터 기반 정밀 분석 (${total}개 샘플)`
                  : "학습 데이터가 필요합니다 (녹화 먼저)"}
              </p>
            </div>
          </div>

          {/* 녹화 모드 */}
          <div
            className="motion-select-card"
            onClick={() => {
              setSelectedStep(0);
              setPracticeMode("record");
              startCamera();
            }}
          >
            <div className="sel-icon">🎬</div>
            <div className="sel-info">
              <h3>녹화 모드</h3>
              <p>AI 학습을 위한 동작 데이터 수집</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 연습/녹화 뷰
  function renderPracticeView() {
    const m = currentMotion ? MOTIONS[currentMotion] : null;
    if (!m) return null;

    const session = sessionRef.current;
    const isRecord = practiceMode === "record";

    return (
      <div className="practice-view">
        {/* 헤더 (모바일용) */}
        <div className="practice-header mobile-only">
          <button className="back-btn" onClick={exitPractice}>←</button>
          <h2>{m.icon} {m.name}</h2>
          <span className={`mode-badge ${isRecord ? "mode-record" : practiceMode === "knn" ? "mode-knn" : "mode-instant"}`}>
            {isRecord ? "녹화" : practiceMode === "knn" ? "AI" : "즉시"}
          </span>
        </div>

        {/* 카메라 영역 */}
        <div
          className="camera-container"
          ref={cameraContainerRef}
        >
          {/* PC용 오버레이 헤더 */}
          <div className="camera-header pc-only">
            <button className="back-btn" onClick={exitPractice}>← 돌아가기</button>
            <h2>{m.icon} {m.name}</h2>
            <span className={`mode-badge ${isRecord ? "mode-record" : practiceMode === "knn" ? "mode-knn" : "mode-instant"}`}>
              {isRecord ? "녹화" : practiceMode === "knn" ? "AI" : "즉시"}
            </span>
          </div>
          {/* eslint-disable-next-line react/no-unknown-property */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            webkit-playsinline=""
            muted
            disablePictureInPicture
            style={{ WebkitMediaPlaybackRequiresUserAction: false }}
          />
          <canvas ref={canvasRef} />

          {/* FPS */}
          {cameraActive && <div className="fps-badge">FPS: {fps}</div>}

          {/* 자세 미리보기 버튼 */}
          {m.learnImage && !practiceComplete && (
            <button
              className="camera-preview-btn"
              onClick={() => setPreviewImage(m.learnImage)}
            >
              자세 미리보기
            </button>
          )}

          {/* 가이드 단계 스켈레톤 오버레이 */}
          {!isRecord && m.holdStages && session && !session.guideStageDone && (
            <div className="skeleton-guide-overlay">
              <StageSkeleton
                motionId={parseInt(session.mid)}
                stageIndex={session.guideStageIdx}
                color="rgba(255,255,255,0.45)"
                highlightColor="#fff"
                size={160}
              />
              <span className="skeleton-guide-label">{session.currentGuideStage?.checkName}</span>
            </div>
          )}

          {/* 단계별 확인 타이머 오버레이 (가이드 진행 중) */}
          {!isRecord && m.holdStages && session && !session.guideStageDone && session.guideStageConfirmSec > 0 && (
            <div className="stage-confirm-overlay">
              <div className="stage-confirm-circle">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" stroke="var(--border)" />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    stroke="var(--success)"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 * (1 - Math.min(
                        session.guideStageConfirmSec / session.currentGuideStage.confirmSec,
                        1
                      ))
                    }
                  />
                </svg>
                <span className="stage-confirm-text">{session.guideStageConfirmSec.toFixed(1)}</span>
              </div>
              <span className="stage-confirm-label">{session.currentGuideStage?.checkName}</span>
            </div>
          )}

          {/* 유지시간 타이머 (최종 유지 단계) */}
          {!isRecord && (m.holdMode || m.instantGoal) && session && session.holdSec > 0
            && (!m.holdStages || session.guideStageDone) && (
            <div className="hold-timer">
              <div className="hold-circle">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" stroke="var(--border)" />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    stroke="var(--accent)"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 * (1 - Math.min(session.holdSec / session.customHoldGoal, 1))
                    }
                  />
                </svg>
                <span className="hold-time-text">{session.holdSec.toFixed(1)}</span>
              </div>
              <span className="hold-label">/ {session.customHoldGoal}초</span>
            </div>
          )}

          {/* 플래시 메시지 */}
          {flashRef.current.map((f) => (
            <div key={f.id} className="flash-msg">{f.msg}</div>
          ))}

          {/* 완료 오버레이 */}
          {practiceComplete && (
            <div className="complete-overlay">
              <div className="complete-icon">{practiceComplete.motionIcon}</div>
              <div className="complete-title">목표 달성!</div>
              <div className="complete-motion">{practiceComplete.motionName}</div>
              <div className="complete-stats">
                {practiceComplete.holdMode ? (
                  <div className="complete-stat">
                    <span className="stat-value">{practiceComplete.holdSec.toFixed(1)}</span>
                    <span className="stat-label">초 유지</span>
                  </div>
                ) : (
                  <div className="complete-stat">
                    <span className="stat-value">{practiceComplete.cycles}</span>
                    <span className="stat-label">회 완료</span>
                  </div>
                )}
                <div className="complete-stat">
                  <span className="stat-value">{practiceComplete.score}</span>
                  <span className="stat-label">점</span>
                </div>
              </div>
              <div className="complete-buttons">
                <button className="complete-btn retry" onClick={() => {
                  setPracticeComplete(null);
                  session?.reset();
                  graceStartRef.current = null;
                  feedbackHistoryRef.current.clear();
                  feedbackRef.current = null;
                  setFeedback(null);
                  // RAF 재시작
                  if (!rafRef.current) {
                    rafRef.current = requestAnimationFrame(mainLoop);
                  }
                  forceUpdate(n => n + 1);
                }}>
                  다시 하기
                </button>
                <button className="complete-btn exit" onClick={exitPractice}>
                  다른 동작
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 녹화 패널 */}
        {isRecord && renderRecordPanel()}

        {/* 피드백 패널 */}
        {!isRecord && !practiceComplete && cameraActive && renderFeedbackPanel()}

        {/* 컨트롤 (녹화 모드만) */}
        {!practiceComplete && isRecord && (
          <div className="practice-controls">
            <button className="ctrl-btn primary" onClick={recordSample}>
              📷 녹화 (SPACE)
            </button>
            <button className="ctrl-btn secondary" onClick={exitPractice}>
              완료
            </button>
          </div>
        )}
      </div>
    );
  }

  // 녹화 패널
  function renderRecordPanel() {
    const m = MOTIONS[currentMotion];
    const clf = classifiersRef.current[currentMotion];
    const counts = clf?.getSampleCounts() || {};

    return (
      <div className="record-panel">
        <div className="step-selector">
          {m.steps.map((step, i) => {
            const cnt = counts[step] || 0;
            const isActive = i === selectedStep;
            let iconClass = "empty";
            if (isActive) iconClass = "recording";
            else if (cnt >= 10) iconClass = "ready";
            else if (cnt > 0) iconClass = "has-data";

            return (
              <button
                key={step}
                className={`step-btn ${isActive ? "active" : ""}`}
                onClick={() => setSelectedStep(i)}
              >
                <div className={`step-icon ${iconClass}`}>
                  {isActive ? "●" : cnt >= 10 ? "✓" : cnt || "·"}
                </div>
                <span className="step-name">{step}</span>
                <span className="step-count">{cnt}개</span>
              </button>
            );
          })}
        </div>
        <p className="record-info">
          자세를 취하고 <b style={{ color: "var(--accent)" }}>녹화</b> 버튼을 눌러 저장하세요.
          단계별 10~15개 권장.
        </p>
        {isAdmin ? (
          <p className="record-info" style={{ color: "var(--success)", marginTop: "8px" }}>
            🔐 관리자 모드: 서버에 저장됩니다
          </p>
        ) : (
          <p className="record-info" style={{ color: "var(--text2)", marginTop: "8px" }}>
            💾 로컬 저장 (이 기기에서만 사용)
          </p>
        )}
      </div>
    );
  }

  // 피드백 패널
  function renderFeedbackPanel() {
    const fb = feedback || feedbackRef.current;
    if (!fb) return (
      <div className="feedback-panel">
        <div className="feedback-score">
          <div className="score-circle">
            <svg viewBox="0 0 56 56">
              <circle cx="28" cy="28" r={24} stroke="var(--border)" />
            </svg>
            0%
          </div>
          <div className="feedback-message">
            <div className="main-msg">카메라에 자세를 보여주세요</div>
            <div className="sub-msg">포즈 감지 대기 중...</div>
          </div>
        </div>
      </div>
    );

    const { checks, overallScore, summaryMessage, allPassed } = fb;
    const session = sessionRef.current;
    const isGuidedHold = session?.motion?.holdStages && !session?.guideStageDone;
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - overallScore / 100);

    return (
      <div className="feedback-panel">
        <div className="feedback-score">
          <div className={`score-circle ${allPassed ? "perfect" : ""}`}>
            <svg viewBox="0 0 56 56">
              <circle cx="28" cy="28" r={radius} stroke="var(--border)" />
              <circle
                cx="28"
                cy="28"
                r={radius}
                stroke={allPassed ? "var(--success)" : "var(--accent)"}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            {overallScore}%
          </div>
          <div className="feedback-message">
            <div className="main-msg" style={{ color: allPassed ? "var(--success)" : "var(--text)" }}>
              {isGuidedHold ? session.currentGuideStage?.label : summaryMessage}
            </div>
            <div className="sub-msg">
              {isGuidedHold
                ? `단계 ${session.guideStageIdx + 1} / ${session.guideStageCount}`
                : allPassed ? "자세를 유지하세요!" : "아래 체크포인트를 확인하세요"}
            </div>
          </div>
        </div>

        {/* 가이드 단계 진행 바 */}
        {session?.motion?.holdStages && (
          <div className="stage-progress">
            <div className="stage-progress-bar">
              {session.motion.holdStages.map((_, i) => (
                <div
                  key={i}
                  className={`stage-dot ${
                    i < session.guideStageIdx ? "completed" :
                    i === session.guideStageIdx && !session.guideStageDone ? "active" :
                    session.guideStageDone ? "completed" : "pending"
                  }`}
                />
              ))}
              <div className={`stage-dot ${session.guideStageDone ? "active" : "pending"}`} />
            </div>
            {/* 단계 확인 progress bar */}
            {isGuidedHold && session.guideStageConfirmSec > 0 && (
              <div className="stage-confirm-bar">
                <div
                  className="stage-confirm-fill"
                  style={{
                    width: `${Math.min(
                      (session.guideStageConfirmSec / session.currentGuideStage.confirmSec) * 100,
                      100
                    )}%`
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* 전체 단계 완료 배너 */}
        {session?.guideStageDone && session.motion.holdStages && (
          <div className="stage-complete-banner">
            자세 완성! {session.customHoldGoal}초 유지하세요
          </div>
        )}

        <div className="feedback-checks">
          {checks.map((check, i) => {
            const isLocked = isGuidedHold && i > session.guideStageIdx;
            const isCurrentStage = isGuidedHold && i === session.guideStageIdx;

            return (
              <div key={i} className={`check-item ${
                isLocked ? "locked" : check.passed ? "passed" : "failed"
              } ${isCurrentStage ? "current-stage" : ""}`}>
                <span className={`check-icon ${session?.motion?.holdStages ? "has-skeleton" : ""}`}>
                  {session?.motion?.holdStages ? (
                    <StageSkeleton
                      motionId={parseInt(session.mid)}
                      stageIndex={i}
                      color={
                        isLocked ? "var(--text3)" :
                        check.passed ? "var(--success)" :
                        isCurrentStage ? "var(--accent)" :
                        "var(--warning)"
                      }
                      highlightColor={
                        isLocked ? "var(--text3)" :
                        isCurrentStage ? "#fff" :
                        undefined
                      }
                      size={36}
                    />
                  ) : (
                    isLocked ? "🔒" : check.passed ? "✅" : isCurrentStage ? "👉" : "⚠️"
                  )}
                </span>
                <div className="check-text">
                  <div className="check-name">{check.name}</div>
                  <div className="check-msg">
                    {isLocked ? "이전 단계를 완료하세요" : check.message}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 기록 탭
  function renderHistoryTab() {
    const history = JSON.parse(localStorage.getItem("swim_history") || "[]");

    // 통계 계산
    const totalSessions = history.length;
    const totalMotions = new Set(history.map(h => h.motionId)).size;
    const avgScore = totalSessions > 0
      ? Math.round(history.reduce((sum, h) => sum + h.score, 0) / totalSessions)
      : 0;

    return (
      <div className="main-content">
        <div className="page-header">
          <h1>📊 기록</h1>
          <p>연습 히스토리 및 통계</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{totalSessions}</div>
            <div className="stat-label">총 연습 횟수</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalMotions}</div>
            <div className="stat-label">연습한 동작</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgScore}</div>
            <div className="stat-label">평균 점수</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{history.filter(h => h.score >= 15).length}</div>
            <div className="stat-label">성공 횟수</div>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="history-empty">
            <div className="empty-icon">📝</div>
            <p>아직 연습 기록이 없습니다</p>
            <p style={{ marginTop: 8 }}>연습을 완료하면 여기에 기록됩니다</p>
          </div>
        ) : (
          <div className="history-list">
            {history.slice(0, 20).map((item) => {
              const m = MOTIONS[item.motionId];
              const date = new Date(item.date);
              return (
                <div key={item.id} className="history-item">
                  <div className="hist-header">
                    <span className="hist-icon">{m?.icon || "🏊"}</span>
                    <div className="hist-title">
                      <h4>{m?.name || "알 수 없음"}</h4>
                      <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>
                    </div>
                    <span className="hist-score">{item.score}/20</span>
                  </div>
                  <div className="hist-details">
                    {item.holdSec > 0 && <span>유지시간: {item.holdSec.toFixed(1)}초</span>}
                    {item.cycles > 0 && <span>사이클: {item.cycles}회</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // localStorage 데이터 병합 (Supabase 데이터가 없는 동작만)
  function mergeLocalStorage() {
    for (let i = 1; i <= 6; i++) {
      const clf = classifiersRef.current[i];
      // Supabase에서 이미 로드된 데이터가 있으면 건너뛰기 (중복 방지)
      if (clf.totalSamples > 0) continue;

      const saved = localStorage.getItem(`swim_knn_${i}`);
      if (saved) {
        try {
          const localSamples = JSON.parse(saved);
          for (const [label, features] of Object.entries(localSamples)) {
            for (const feat of features) {
              clf.addSample(label, feat);
            }
          }
        } catch (e) {
          console.error(`Failed to merge local data for motion ${i}:`, e);
        }
      }
    }
  }

  // 학교 관리자 로그인
  async function handleAdminLogin(schoolId, password) {
    try {
      const valid = await verifyAdminPassword(schoolId, password);
      if (valid) {
        setIsAdmin(true);
        setSelectedSchoolId(schoolId);
        localStorage.setItem("swim_school_id", schoolId);
        showToast("관리자 로그인 성공");

        // 해당 학교 데이터 다시 로드
        setDataLoading(true);
        for (let i = 1; i <= 6; i++) {
          await classifiersRef.current[i].loadFromSupabase(
            i.toString(), MOTIONS[i].steps, schoolId
          );
        }
        mergeLocalStorage();
        setDataLoading(false);
        forceUpdate(n => n + 1);
      } else {
        showToast("비밀번호가 틀립니다", "error");
      }
    } catch (err) {
      console.error("Admin login failed:", err);
      showToast("로그인 실패", "error");
    }
  }

  // 학교 생성
  async function handleCreateSchool(name, password) {
    try {
      const newSchool = await createSchool(name, password);
      setSchools(prev => [...prev, newSchool]);
      showToast(`'${name}' 학교가 생성되었습니다`);
      return newSchool;
    } catch (err) {
      console.error("Create school failed:", err);
      if (err.message?.includes("duplicate")) {
        showToast("이미 존재하는 학교명입니다", "error");
      } else {
        showToast("학교 생성 실패", "error");
      }
      return null;
    }
  }

  // localStorage → Supabase 업로드
  // motionId: 특정 동작만 업로드 (null이면 전체)
  // overwrite: true면 덮어쓰기, false면 추가
  async function handleUploadToSupabase(motionId = null, overwrite = false) {
    const schoolId = selectedSchoolId || DEFAULT_SCHOOL_ID;
    let totalUploaded = 0;
    const motionIds = motionId ? [motionId] : [1, 2, 3, 4, 5, 6];

    // 총 업로드할 샘플 수 미리 계산
    let totalToUpload = 0;
    for (const mid of motionIds) {
      const saved = localStorage.getItem(`swim_knn_${mid}`);
      if (!saved) continue;
      const localSamples = JSON.parse(saved);
      const m = MOTIONS[mid];
      for (const [label, features] of Object.entries(localSamples)) {
        if (m.steps.indexOf(label) !== -1) totalToUpload += features.length;
      }
    }

    if (totalToUpload === 0) {
      await showModal({ title: "업로드 실패", message: "업로드할 로컬 데이터가 없습니다." });
      return;
    }

    setLoadingMsg(`업로드 준비 중... 0/${totalToUpload}`);
    setDataLoading(true);

    try {
      if (overwrite) {
        setLoadingMsg("기존 데이터 삭제 중...");
        if (motionId) {
          await deleteTrainingData(motionId.toString(), schoolId);
        } else {
          await deleteAllTrainingDataBySchool(schoolId);
        }
      }

      for (const mid of motionIds) {
        const saved = localStorage.getItem(`swim_knn_${mid}`);
        if (!saved) continue;

        const localSamples = JSON.parse(saved);
        const m = MOTIONS[mid];

        for (const [label, features] of Object.entries(localSamples)) {
          const stepIndex = m.steps.indexOf(label);
          if (stepIndex === -1) continue;

          for (const feat of features) {
            await saveTrainingData(mid.toString(), stepIndex, feat, schoolId);
            totalUploaded++;
            if (totalUploaded % 5 === 0 || totalUploaded === totalToUpload) {
              setLoadingMsg(`업로드 중... ${totalUploaded}/${totalToUpload}`);
            }
          }
        }
      }
      // 업로드 성공 후 localStorage 정리 (중복 로딩 방지)
      for (const mid of motionIds) {
        localStorage.removeItem(`swim_knn_${mid}`);
      }

      // Supabase에서 다시 로드하여 라벨 동기화
      for (let i = 1; i <= 6; i++) {
        await classifiersRef.current[i].loadFromSupabase(
          i.toString(), MOTIONS[i].steps, schoolId || null
        );
      }

      setDataLoading(false);
      setLoadingMsg("");
      forceUpdate(n => n + 1);
      await showModal({ title: "업로드 완료", message: `${totalUploaded}개 샘플이 서버에 업로드되었습니다.\n로컬 임시 데이터는 정리되었습니다.` });
    } catch (err) {
      console.error("Upload failed:", err);
      setDataLoading(false);
      setLoadingMsg("");
      await showModal({ title: "업로드 오류", message: `업로드 중 오류가 발생했습니다.\n(${totalUploaded}/${totalToUpload}개 완료)` });
    }
  }

  // 학교 선택
  async function handleSchoolSelect(schoolId) {
    setIsAdmin(false);
    setSelectedSchoolId(schoolId);
    localStorage.setItem("swim_school_id", schoolId);

    // 해당 학교 데이터 로드
    setDataLoading(true);
    for (let i = 1; i <= 6; i++) {
      await classifiersRef.current[i].loadFromSupabase(
        i.toString(), MOTIONS[i].steps, schoolId || null
      );
    }
    mergeLocalStorage();
    setDataLoading(false);
    forceUpdate(n => n + 1);
    showToast(schoolId ? "학교 데이터 로드 완료" : "기본 데이터 로드 완료");
  }

  // 설정 탭
  function renderSettingsTab() {
    return (
      <div className="main-content">
        <div className="page-header">
          <h1>⚙️ 설정</h1>
          <p>앱 설정 및 데이터 관리</p>
        </div>

        {/* 학교 설정 */}
        <div className="settings-section">
          <h3>학교 설정</h3>

          {/* 현재 상태 */}
          <div className="setting-item">
            <span className="setting-icon">🏫</span>
            <div className="setting-text">
              <h4>현재 학교</h4>
              <p>
                {selectedSchoolId
                  ? schools.find(s => s.id === selectedSchoolId)?.name || "알 수 없음"
                  : "기본 (개발자 제공)"}
                {isAdmin && " (관리자)"}
              </p>
            </div>
          </div>

          {/* 학교 선택 */}
          <select
            value={selectedSchoolId}
            onChange={(e) => handleSchoolSelect(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text)",
              fontSize: "14px",
              marginTop: "8px",
              cursor: "pointer",
            }}
          >
            <option value="">기본 (개발자 제공 데이터)</option>
            {schools.filter(s => s.id !== DEFAULT_SCHOOL_ID).map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          {/* 관리자 로그인 */}
          {!isAdmin && !showAdminLogin && (
            <button
              className="setting-btn"
              style={{ marginTop: "12px" }}
              onClick={() => setShowAdminLogin(true)}
            >
              🔐 관리자 로그인
            </button>
          )}

          {!isAdmin && showAdminLogin && (
            <div className="admin-login-box" style={{ marginTop: "12px" }}>
              <div className="admin-login-header">
                <span>🔐 {selectedSchoolId ? (schools.find(s => s.id === selectedSchoolId)?.name || "학교") : "기본 (개발자)"} 관리자</span>
                <button className="admin-login-close" onClick={() => { setShowAdminLogin(false); setAdminPassword(""); }}>✕</button>
              </div>
              <div className="admin-login-input-row">
                <input
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && adminPassword) {
                      handleAdminLogin(selectedSchoolId || DEFAULT_SCHOOL_ID, adminPassword);
                      setAdminPassword("");
                      setShowAdminLogin(false);
                    }
                  }}
                  className="admin-login-input"
                  autoFocus
                />
                <button
                  className="admin-login-submit"
                  disabled={!adminPassword}
                  onClick={() => {
                    handleAdminLogin(selectedSchoolId || DEFAULT_SCHOOL_ID, adminPassword);
                    setAdminPassword("");
                    setShowAdminLogin(false);
                  }}
                >
                  확인
                </button>
              </div>
            </div>
          )}

          {/* 관리자 로그아웃 */}
          {isAdmin && (
            <button
              className="setting-btn"
              style={{ marginTop: "12px" }}
              onClick={() => {
                setIsAdmin(false);
                setShowAdminLogin(false);
                showToast("관리자 로그아웃");
              }}
            >
              🔓 관리자 로그아웃
            </button>
          )}

          {/* 학교 생성 (관리자 전용) */}
          {isAdmin && (<button
            className="setting-btn"
            style={{ marginTop: "8px" }}
            onClick={async () => {
              const result = await showModal({ type: "prompt2", title: "새 학교 등록", message: "학교 이름과 관리자 비밀번호를 입력하세요.", placeholder: "학교 이름", placeholder2: "관리자 비밀번호" });
              if (result) handleCreateSchool(result.val1, result.val2);
            }}
          >
            ➕ 새 학교 등록
          </button>)}

          {dataLoading && (
            <p style={{ color: "var(--text2)", fontSize: "13px", marginTop: "8px" }}>
              ⏳ 학습 데이터 로딩 중...
            </p>
          )}
        </div>

        {/* 카메라 설정 */}
        <div className="settings-section">
          <h3>카메라 설정</h3>
          <div className="setting-item">
            <span className="setting-icon">📷</span>
            <div className="setting-text">
              <h4>카메라 선택</h4>
              <p>사용할 카메라를 선택하세요</p>
            </div>
          </div>
          <select
            value={selectedCameraId}
            onChange={(e) => {
              const newId = e.target.value;
              setSelectedCameraId(newId);
              localStorage.setItem("swim_camera_id", newId);
              showToast("카메라가 변경되었습니다");
            }}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text)",
              fontSize: "14px",
              marginTop: "8px",
              cursor: "pointer",
            }}
          >
            {cameras.length === 0 ? (
              <option value="">카메라를 찾는 중...</option>
            ) : (
              cameras.map((cam, idx) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `카메라 ${idx + 1}`}
                </option>
              ))
            )}
          </select>
          <button
            className="setting-btn"
            style={{ marginTop: "12px" }}
            onClick={loadCameras}
          >
            🔄 카메라 목록 새로고침
          </button>
        </div>

        {/* 데이터 관리 (관리자 전용) */}
        {isAdmin && (<div className="settings-section">
          <h3>학습 데이터</h3>
          {Object.entries(MOTIONS).map(([id, m]) => {
            const clf = classifiersRef.current[id];
            const counts = clf?.getSampleCounts() || {};
            const total = clf?.totalSamples || 0;

            return (
              <div key={id} className="data-motion">
                <div className="dm-header">
                  <span className="dm-icon">{m.icon}</span>
                  <span className="dm-name">{m.name}</span>
                  <span className="dm-total">{total}개</span>
                </div>
                <div className="dm-steps">
                  {m.steps.map((step) => {
                    const cnt = counts[step] || 0;
                    return (
                      <div key={step} className="dm-step">
                        <span className="step-name">{step}</span>
                        <div className="step-bar">
                          <div
                            className="step-bar-fill"
                            style={{
                              width: `${Math.min((cnt / 15) * 100, 100)}%`,
                              background: cnt >= 10 ? "var(--success)" : cnt > 0 ? "var(--warning)" : "var(--border)"
                            }}
                          />
                        </div>
                        <span className="step-count">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dm-actions">
                  <button
                    onClick={() => {
                      const data = clf?.export();
                      if (data) {
                        const blob = new Blob([data], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `swim_knn_${id}.json`;
                        a.click();
                        showToast("내보내기 완료");
                      }
                    }}
                  >
                    내보내기
                  </button>
                  <button
                    disabled={dataLoading || total === 0}
                    onClick={async () => {
                      const ok = await showModal({ title: `${m.name} 업로드`, message: "서버에 추가합니다. (기존 데이터 유지)" });
                      if (ok) handleUploadToSupabase(parseInt(id), false);
                    }}
                  >
                    ☁️ 추가
                  </button>
                  <button
                    disabled={dataLoading || total === 0}
                    onClick={async () => {
                      const ok = await showModal({ title: `${m.name} 덮어쓰기`, message: "서버의 기존 데이터를 삭제하고 새로 업로드합니다.", danger: true });
                      if (ok) handleUploadToSupabase(parseInt(id), true);
                    }}
                  >
                    🔄 덮어쓰기
                  </button>
                  <button
                    className="delete"
                    onClick={async () => {
                      const ok = await showModal({ title: "데이터 삭제", message: `${m.name}의 모든 학습 데이터를 삭제할까요?`, danger: true });
                      if (ok) {
                        clf?.clear();
                        localStorage.removeItem(`swim_knn_${id}`);
                        showToast("삭제 완료");
                        forceUpdate(n => n + 1);
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>)}

        {isAdmin && (<div className="settings-section">
          <h3>전체 데이터</h3>
          <button
            className="setting-btn primary"
            onClick={async () => {
              const ok = await showModal({ title: "전체 추가 업로드", message: "모든 로컬 학습 데이터를 서버에 추가합니다.\n기존 서버 데이터는 유지됩니다." });
              if (ok) handleUploadToSupabase(null, false);
            }}
            disabled={dataLoading}
          >
            {dataLoading ? "⏳ 업로드 중..." : "☁️ 전체 추가 업로드"}
          </button>
          <button
            className="setting-btn"
            onClick={async () => {
              const ok = await showModal({ title: "전체 덮어쓰기", message: "서버의 기존 데이터를 모두 삭제하고\n로컬 데이터로 새로 업로드합니다.", danger: true });
              if (ok) handleUploadToSupabase(null, true);
            }}
            disabled={dataLoading}
          >
            🔄 전체 덮어쓰기
          </button>
          <button
            className="setting-btn"
            onClick={() => {
              const allData = {};
              for (let i = 1; i <= 6; i++) {
                const d = localStorage.getItem(`swim_knn_${i}`);
                if (d) allData[`swim_knn_${i}`] = d;
              }
              allData.swim_history = localStorage.getItem("swim_history") || "[]";

              const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `swim_trainer_backup_${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              showToast("전체 백업 완료");
            }}
          >
            📤 전체 내보내기
          </button>

          <button
            className="setting-btn"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result);
                    for (const key in data) {
                      localStorage.setItem(key, typeof data[key] === "string" ? data[key] : JSON.stringify(data[key]));
                    }
                    // 분류기 다시 로드
                    for (let i = 1; i <= 6; i++) {
                      const saved = localStorage.getItem(`swim_knn_${i}`);
                      if (saved) {
                        classifiersRef.current[i].import(saved);
                      }
                    }
                    showToast("가져오기 완료");
                    forceUpdate(n => n + 1);
                  } catch (err) {
                    showToast("파일 형식 오류", "error");
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
          >
            📥 가져오기
          </button>

          <button
            className="setting-btn danger"
            onClick={async () => {
              const ok = await showModal({ title: "전체 삭제", message: "모든 데이터(학습 데이터 + 연습 기록)를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.", danger: true });
              if (ok) {
                for (let i = 1; i <= 6; i++) {
                  localStorage.removeItem(`swim_knn_${i}`);
                  classifiersRef.current[i]?.clear();
                }
                localStorage.removeItem("swim_history");
                showToast("전체 삭제 완료");
                forceUpdate(n => n + 1);
              }
            }}
          >
            🗑 전체 삭제
          </button>
        </div>)}

      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 메인 렌더
  // ═══════════════════════════════════════════════════════════
  // 연습/녹화 중일 때는 탭바 숨김
  const showTabBar = !(practiceMode === "instant" || practiceMode === "knn" || practiceMode === "record");

  return (
    <div className="app-frame">
      {/* 메인 콘텐츠 */}
      {activeTab === "home" && renderHomeTab()}
      {activeTab === "learn" && renderLearnTab()}
      {activeTab === "practice" && renderPracticeTab()}
      {activeTab === "history" && renderHistoryTab()}
      {activeTab === "settings" && renderSettingsTab()}

      {/* 하단 탭 바 */}
      {showTabBar && (
        <nav className="tab-bar">
          <button
            className={`tab-item ${activeTab === "home" ? "active" : ""}`}
            onClick={() => setActiveTab("home")}
          >
            <img src="/icons/home.png" alt="홈" className="tab-icon" />
            <span className="tab-label">홈</span>
          </button>
          <button
            className={`tab-item ${activeTab === "learn" ? "active" : ""}`}
            onClick={() => { setActiveTab("learn"); setLearnView(null); }}
          >
            <img src="/icons/learn.png" alt="학습" className="tab-icon" />
            <span className="tab-label">학습</span>
          </button>
          <button
            className={`tab-item ${activeTab === "practice" ? "active" : ""}`}
            onClick={() => { setActiveTab("practice"); setPracticeMode(null); setCurrentMotion(null); }}
          >
            <img src="/icons/practice.png" alt="연습" className="tab-icon" />
            <span className="tab-label">연습</span>
          </button>
          <button
            className={`tab-item ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <img src="/icons/history.png" alt="기록" className="tab-icon" />
            <span className="tab-label">기록</span>
          </button>
          <button
            className={`tab-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <img src="/icons/setting.png" alt="설정" className="tab-icon" />
            <span className="tab-label">설정</span>
          </button>
        </nav>
      )}

      {/* 로딩 오버레이 */}
      {dataLoading && loadingMsg && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p className="loading-text">{loadingMsg}</p>
        </div>
      )}

      {/* 커스텀 모달 */}
      {modal && (
        <div className="modal-overlay" onClick={() => closeModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {modal.title && <h3 className="modal-title">{modal.title}</h3>}
            {modal.message && <p className="modal-message">{modal.message}</p>}

            {(modal.type === "prompt" || modal.type === "prompt2") && (
              <input
                className="modal-input"
                type="text"
                placeholder={modal.placeholder || ""}
                value={modal.inputVal}
                onChange={(e) => setModal(prev => ({ ...prev, inputVal: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && modal.type === "prompt" && modal.inputVal) closeModal(modal.inputVal);
                }}
                autoFocus
              />
            )}
            {modal.type === "prompt2" && (
              <input
                className="modal-input"
                type="password"
                placeholder={modal.placeholder2 || ""}
                value={modal.inputVal2}
                onChange={(e) => setModal(prev => ({ ...prev, inputVal2: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && modal.inputVal && modal.inputVal2) closeModal({ val1: modal.inputVal, val2: modal.inputVal2 });
                }}
              />
            )}

            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => closeModal(null)}>취소</button>
              {modal.type === "confirm" && (
                <button className={`modal-btn ok ${modal.danger ? "danger" : ""}`} onClick={() => closeModal(true)}>확인</button>
              )}
              {modal.type === "prompt" && (
                <button className="modal-btn ok" disabled={!modal.inputVal} onClick={() => closeModal(modal.inputVal)}>확인</button>
              )}
              {modal.type === "prompt2" && (
                <button className="modal-btn ok" disabled={!modal.inputVal || !modal.inputVal2} onClick={() => closeModal({ val1: modal.inputVal, val2: modal.inputVal2 })}>확인</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 자세 미리보기 오버레이 */}
      {previewImage && (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="자세 미리보기" />
          <button className="preview-close" onClick={() => setPreviewImage(null)}>✕</button>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
