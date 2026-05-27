import { describe, it, expect } from 'vitest';
import {
  semanticSkillSimilarity,
  bestSemanticMatch,
} from '../../src/core/skill-ontology.js';
import { skillMatchScore } from '../../src/core/tech-dictionary.js';

describe('skill-ontology', () => {
  describe('semanticSkillSimilarity', () => {
    it('동일 스킬은 1.0', () => {
      expect(semanticSkillSimilarity('FastAPI', 'FastAPI')).toBe(1.0);
    });

    it('similarTo 관계는 가중치 그대로 반환', () => {
      // FastAPI similarTo Flask, weight=0.8
      expect(semanticSkillSimilarity('FastAPI', 'Flask')).toBeCloseTo(0.8);
    });

    it('similarTo는 대칭 (역방향도 동일 점수)', () => {
      expect(semanticSkillSimilarity('Flask', 'FastAPI')).toBeCloseTo(0.8);
    });

    it('같은 부모(isA)만 공유하면 0.5', () => {
      // NestJS와 Spring Boot — similarTo는 없지만 둘 다 isA WebFramework
      expect(semanticSkillSimilarity('NestJS', 'Spring Boot')).toBe(0.5);
    });

    it('similarTo가 직접 정의돼 있으면 부모 공유보다 우선', () => {
      // FastAPI ↔ Django: similarTo 0.7 (둘 다 WebFramework이기도 함)
      expect(semanticSkillSimilarity('FastAPI', 'Django')).toBeCloseTo(0.7);
    });

    it('관계 없는 노드끼리는 0', () => {
      expect(semanticSkillSimilarity('Python', 'Kubernetes')).toBe(0);
    });

    it('온톨로지에 없는 스킬은 0', () => {
      expect(semanticSkillSimilarity('UnknownTech', 'FastAPI')).toBe(0);
    });
  });

  describe('bestSemanticMatch', () => {
    it('사용자 스킬 중 가장 유사한 것의 점수를 채택', () => {
      const score = bestSemanticMatch(['Python', 'FastAPI'], 'Django');
      // Python ↔ Django: 0 (직접 관계 없음)
      // FastAPI ↔ Django: 0.7 (similarTo)
      expect(score).toBeCloseTo(0.7);
    });

    it('정확 일치하는 스킬이 있으면 1.0', () => {
      const score = bestSemanticMatch(['Python', 'FastAPI'], 'FastAPI');
      expect(score).toBe(1.0);
    });
  });

  describe('skillMatchScore 통합 — 온톨로지 부분 점수', () => {
    it('FastAPI 보유 → Django 요구 공고에서 0점이 아님', () => {
      const score = skillMatchScore(['FastAPI'], ['Django']);
      // FastAPI ↔ Django similarTo=0.7 → required 가중치 2 → 점수 1.4 / 총점 2 = 70%
      expect(score).toBe(70);
    });

    it('정확 일치는 100점 유지 (기존 동작 보존)', () => {
      const score = skillMatchScore(['Django'], ['Django']);
      expect(score).toBe(100);
    });

    it('의미 매칭과 정확 매칭이 섞인 경우', () => {
      // 사용자: FastAPI, Python / 공고 required: Django, Python
      // Python: 정확 일치 → 2/2
      // Django: FastAPI와 similarTo 0.7 → 1.4/2
      // 총 3.4 / 4 = 85%
      const score = skillMatchScore(['FastAPI', 'Python'], ['Django', 'Python']);
      expect(score).toBe(85);
    });
  });
});
