import {
  getTrainingDataByMotion,
  saveTrainingData,
  deleteTrainingData,
  DEFAULT_SCHOOL_ID,
} from "./supabase.js";

/**
 * K-Nearest Neighbors 분류기
 * Teachable Machine과 동일한 원리: 샘플 저장 → 거리 기반 투표
 */
export class KNNClassifier {
  constructor(k = 5) {
    this.k = k;
    this.samples = {}; // label → [featureArrays]
  }

  addSample(label, features) {
    if (!this.samples[label]) this.samples[label] = [];
    this.samples[label].push([...features]);
  }

  getSampleCounts() {
    const counts = {};
    for (const [label, arr] of Object.entries(this.samples)) {
      counts[label] = arr.length;
    }
    return counts;
  }

  get totalSamples() {
    return Object.values(this.samples).reduce((s, a) => s + a.length, 0);
  }

  get numClasses() {
    return Object.keys(this.samples).filter(
      (k) => this.samples[k].length > 0
    ).length;
  }

  predict(features) {
    if (this.totalSamples === 0 || this.numClasses < 2) {
      return { label: null, confidence: 0 };
    }

    const distances = [];
    for (const [label, samples] of Object.entries(this.samples)) {
      for (const sample of samples) {
        let dist = 0;
        for (let i = 0; i < features.length; i++) {
          dist += (features[i] - sample[i]) ** 2;
        }
        distances.push({ label, dist: Math.sqrt(dist) });
      }
    }

    distances.sort((a, b) => a.dist - b.dist);
    const topK = distances.slice(0, this.k);

    // 가중 투표 (거리 역수)
    const votes = {};
    for (const { label, dist } of topK) {
      const weight = 1 / (dist + 0.0001);
      votes[label] = (votes[label] || 0) + weight;
    }

    let bestLabel = null,
      bestScore = 0,
      totalScore = 0;
    for (const [label, score] of Object.entries(votes)) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    return { label: bestLabel, confidence: bestScore / totalScore };
  }

  clear() {
    this.samples = {};
  }

  export() {
    return JSON.stringify(this.samples);
  }

  import(json) {
    try {
      this.samples = JSON.parse(json);
    } catch (e) {
      console.error("KNN import failed", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Supabase 연동 메서드
  // ═══════════════════════════════════════════════════════════

  // Supabase에서 학습 데이터 불러오기 (동작별, step name 라벨 사용)
  async loadFromSupabase(motionId, steps, schoolId = null) {
    try {
      const data = await getTrainingDataByMotion(motionId, schoolId);
      this.samples = {};

      for (const item of data) {
        const label = steps[item.step_index] || `step_${item.step_index}`;
        if (!this.samples[label]) this.samples[label] = [];
        this.samples[label].push(item.features);
      }

      console.log(`Motion ${motionId}: Loaded ${this.totalSamples} samples from Supabase`);
      return true;
    } catch (e) {
      console.error("Failed to load from Supabase:", e);
      return false;
    }
  }

  // Supabase에 샘플 저장
  async addSampleToSupabase(motionId, stepIndex, stepName, features, schoolId) {
    try {
      await saveTrainingData(motionId, stepIndex, features, schoolId);

      // 로컬에도 추가 (step name 라벨 사용)
      if (!this.samples[stepName]) this.samples[stepName] = [];
      this.samples[stepName].push([...features]);

      return true;
    } catch (e) {
      console.error("Failed to save to Supabase:", e);
      return false;
    }
  }

  // Supabase에서 특정 동작 데이터 삭제 (관리자용)
  async deleteMotionFromSupabase(motionId, schoolId) {
    try {
      await deleteTrainingData(motionId, schoolId);

      // 로컬에서도 삭제
      for (const label of Object.keys(this.samples)) {
        if (label.startsWith(`${motionId}_`)) {
          delete this.samples[label];
        }
      }

      return true;
    } catch (e) {
      console.error("Failed to delete from Supabase:", e);
      return false;
    }
  }

  // 특정 동작의 샘플 수 조회
  getMotionSampleCounts(motionId) {
    const counts = {};
    for (const [label, arr] of Object.entries(this.samples)) {
      if (label.startsWith(`${motionId}_`)) {
        const stepIndex = parseInt(label.split("_").pop());
        counts[stepIndex] = arr.length;
      }
    }
    return counts;
  }
}
