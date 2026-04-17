import { createClient } from "@supabase/supabase-js";

// 환경 변수에서 Supabase 설정을 가져옴 (Vercel 배포 시 설정)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ═══════════════════════════════════════════════════════════
// 사용자 관련 함수 (익명 사용자 - 로컬 ID 기반)
// ═══════════════════════════════════════════════════════════

// 로컬 사용자 ID 가져오기/생성
export function getLocalUserId() {
  if (typeof window === "undefined") return null;
  let userId = localStorage.getItem("exercise_coach_user_id");
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("exercise_coach_user_id", userId);
  }
  return userId;
}

// ═══════════════════════════════════════════════════════════
// 학습 데이터 관련 함수
// ═══════════════════════════════════════════════════════════

// 학습 데이터 조회
export async function getTrainingData(userId = null) {
  if (!supabase) return [];
  const uid = userId || getLocalUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("training_data")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("학습 데이터 조회 오류:", error);
    return [];
  }
  return data;
}

// 특정 동작의 학습 데이터 조회
export async function getTrainingDataByMotion(motionId, userId = null) {
  if (!supabase) return [];
  const uid = userId || getLocalUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("training_data")
    .select("*")
    .eq("motion_id", motionId)
    .eq("user_id", uid)
    .order("step_index", { ascending: true });

  if (error) {
    console.error("동작별 데이터 조회 오류:", error);
    return [];
  }
  return data;
}

// 학습 데이터 저장
export async function saveTrainingData(motionId, stepIndex, features, userId = null) {
  if (!supabase) return null;
  const uid = userId || getLocalUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("training_data")
    .insert({
      motion_id: motionId,
      step_index: stepIndex,
      features: features,
      user_id: uid,
    })
    .select()
    .single();

  if (error) {
    console.error("학습 데이터 저장 오류:", error);
    return null;
  }
  return data;
}

// 특정 동작의 학습 데이터 삭제
export async function deleteTrainingData(motionId, userId = null) {
  if (!supabase) return;
  const uid = userId || getLocalUserId();
  if (!uid) return;

  const { error } = await supabase
    .from("training_data")
    .delete()
    .eq("motion_id", motionId)
    .eq("user_id", uid);

  if (error) {
    console.error("학습 데이터 삭제 오류:", error);
  }
}

// 모든 학습 데이터 삭제
export async function deleteAllTrainingData(userId = null) {
  if (!supabase) return;
  const uid = userId || getLocalUserId();
  if (!uid) return;

  const { error } = await supabase
    .from("training_data")
    .delete()
    .eq("user_id", uid);

  if (error) {
    console.error("전체 데이터 삭제 오류:", error);
  }
}

// 학습 데이터 통계 조회
export async function getTrainingStats(userId = null) {
  const data = await getTrainingData(userId);

  const stats = {};
  for (const item of data) {
    const key = `${item.motion_id}_${item.step_index}`;
    if (!stats[key]) {
      stats[key] = { motionId: item.motion_id, stepIndex: item.step_index, count: 0 };
    }
    stats[key].count++;
  }

  return Object.values(stats);
}

// ═══════════════════════════════════════════════════════════
// 운동 기록 관련 함수
// ═══════════════════════════════════════════════════════════

// 운동 기록 저장
export async function saveWorkoutRecord(record, userId = null) {
  if (!supabase) return null;
  const uid = userId || getLocalUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("workout_records")
    .insert({
      user_id: uid,
      motion_id: record.motionId,
      motion_name: record.motionName,
      mode: record.mode,
      duration_sec: record.durationSec,
      reps_completed: record.repsCompleted,
      target_reps: record.targetReps,
      avg_score: record.avgScore,
    })
    .select()
    .single();

  if (error) {
    console.error("운동 기록 저장 오류:", error);
    return null;
  }
  return data;
}

// 운동 기록 조회
export async function getWorkoutRecords(userId = null, limit = 50) {
  if (!supabase) return [];
  const uid = userId || getLocalUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("workout_records")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("운동 기록 조회 오류:", error);
    return [];
  }
  return data;
}

// 운동 통계 조회
export async function getWorkoutStats(userId = null) {
  const records = await getWorkoutRecords(userId, 1000);

  const stats = {
    totalWorkouts: records.length,
    totalDuration: records.reduce((sum, r) => sum + (r.duration_sec || 0), 0),
    totalReps: records.reduce((sum, r) => sum + (r.reps_completed || 0), 0),
    avgScore: records.length > 0
      ? Math.round(records.reduce((sum, r) => sum + (r.avg_score || 0), 0) / records.length)
      : 0,
    byMotion: {},
  };

  for (const r of records) {
    if (!stats.byMotion[r.motion_id]) {
      stats.byMotion[r.motion_id] = { count: 0, totalReps: 0, totalDuration: 0 };
    }
    stats.byMotion[r.motion_id].count++;
    stats.byMotion[r.motion_id].totalReps += r.reps_completed || 0;
    stats.byMotion[r.motion_id].totalDuration += r.duration_sec || 0;
  }

  return stats;
}
