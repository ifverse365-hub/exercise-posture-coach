-- ═══════════════════════════════════════════════════════════
-- AI 운동 자세 분석 코치 - Supabase 스키마
-- 개인 사용자용 (학교 시스템 없음)
-- ═══════════════════════════════════════════════════════════

-- 학습 데이터 테이블 (KNN 분류기용)
CREATE TABLE training_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  motion_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  features JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 운동 기록 테이블
CREATE TABLE workout_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  motion_id INTEGER NOT NULL,
  motion_name TEXT NOT NULL,
  mode TEXT NOT NULL,  -- 'instant' | 'knn'
  duration_sec INTEGER DEFAULT 0,
  reps_completed INTEGER DEFAULT 0,
  target_reps INTEGER DEFAULT 0,
  avg_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 (조회 성능 향상)
CREATE INDEX idx_training_user ON training_data(user_id);
CREATE INDEX idx_training_motion ON training_data(motion_id);
CREATE INDEX idx_training_user_motion ON training_data(user_id, motion_id);

CREATE INDEX idx_workout_user ON workout_records(user_id);
CREATE INDEX idx_workout_created ON workout_records(created_at DESC);

-- RLS 정책 (Row Level Security)
ALTER TABLE training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_records ENABLE ROW LEVEL SECURITY;

-- 모든 사용자 허용 (익명 사용자 - 클라이언트에서 user_id로 필터링)
CREATE POLICY "Anyone can read training_data"
  ON training_data FOR SELECT USING (true);
CREATE POLICY "Anyone can insert training_data"
  ON training_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete training_data"
  ON training_data FOR DELETE USING (true);

CREATE POLICY "Anyone can read workout_records"
  ON workout_records FOR SELECT USING (true);
CREATE POLICY "Anyone can insert workout_records"
  ON workout_records FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 사용 방법:
-- 1. Supabase 프로젝트 생성 (https://supabase.com)
-- 2. SQL Editor에서 이 스크립트 실행
-- 3. Vercel 환경변수 설정:
--    NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
--    NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
-- ═══════════════════════════════════════════════════════════
