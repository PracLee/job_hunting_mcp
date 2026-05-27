/**
 * 스킬 온톨로지 — 그래프 기반 의미적 유사도.
 *
 * tech-dictionary는 "동의어 정규화"만 담당하고, 여기서는 정규화된 이름들 사이의
 * "의미 거리"를 계산한다. 예: FastAPI ↔ Django는 동일 부모(WebFramework)이므로
 * 부분 점수를 부여한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type SkillNodeType =
  | 'Language' | 'Framework' | 'Library'
  | 'Paradigm' | 'Platform'  | 'Tool' | 'Concept';

export type RelationType =
  | 'isA' | 'partOf' | 'similarTo' | 'requires' | 'implementedIn';

interface OntologyNode {
  id: string;
  type: SkillNodeType;
  abstract?: boolean;
}

interface OntologyEdge {
  s: string;
  p: RelationType;
  o: string;
  weight?: number;
}

interface OntologyFile {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
}

interface AdjacencyEntry {
  predicate: RelationType;
  target: string;
  weight: number;
}

class SkillOntology {
  private nodes = new Map<string, OntologyNode>();
  /** s → [{predicate, target, weight}] (양방향 저장) */
  private adjacency = new Map<string, AdjacencyEntry[]>();

  constructor(data: OntologyFile) {
    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
    }
    for (const edge of data.edges) {
      const weight = edge.weight ?? 1.0;
      this.addEdge(edge.s, edge.p, edge.o, weight);
      // similarTo는 대칭 관계 — 역방향도 추가
      if (edge.p === 'similarTo') {
        this.addEdge(edge.o, edge.p, edge.s, weight);
      }
    }
  }

  private addEdge(s: string, p: RelationType, o: string, weight: number): void {
    const list = this.adjacency.get(s) ?? [];
    list.push({ predicate: p, target: o, weight });
    this.adjacency.set(s, list);
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * 두 스킬 사이의 의미 유사도 (0~1).
   * 깊이 1 추론만 사용한다.
   */
  similarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!this.hasNode(a) || !this.hasNode(b)) return 0.0;

    const aEdges = this.adjacency.get(a) ?? [];

    // 1) 직접 similarTo
    for (const edge of aEdges) {
      if (edge.predicate === 'similarTo' && edge.target === b) {
        return edge.weight;
      }
    }

    // 2) 같은 부모(isA)를 공유 → 0.5
    if (this.sharesIsAParent(a, b)) {
      return 0.5;
    }

    // 3) requires 관계 (양방향) → 0.6
    for (const edge of aEdges) {
      if (edge.predicate === 'requires' && edge.target === b) return 0.6;
    }
    const bEdges = this.adjacency.get(b) ?? [];
    for (const edge of bEdges) {
      if (edge.predicate === 'requires' && edge.target === a) return 0.6;
    }

    return 0.0;
  }

  private sharesIsAParent(a: string, b: string): boolean {
    const aParents = this.parentsOf(a);
    if (aParents.size === 0) return false;
    const bParents = this.parentsOf(b);
    for (const parent of aParents) {
      if (bParents.has(parent)) return true;
    }
    return false;
  }

  private parentsOf(id: string): Set<string> {
    const parents = new Set<string>();
    for (const edge of this.adjacency.get(id) ?? []) {
      if (edge.predicate === 'isA') parents.add(edge.target);
    }
    return parents;
  }
}

// --- 싱글톤 로더 ---

let cached: SkillOntology | null = null;

function defaultOntologyPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/core/skill-ontology.js → ../../data/skill-ontology.json
  // src/core/skill-ontology.ts (tsx 실행) → ../../data/skill-ontology.json
  return resolve(here, '../../data/skill-ontology.json');
}

export function loadOntology(path: string = defaultOntologyPath()): SkillOntology {
  if (cached) return cached;
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as OntologyFile;
  cached = new SkillOntology(data);
  return cached;
}

/** 테스트에서 다른 데이터로 교체할 때 사용 */
export function resetOntology(): void {
  cached = null;
}

/**
 * 두 스킬 사이의 의미 점수 (0~1). 입력은 이미 정규화된 canonical 이름이어야 한다.
 * (정규화 책임은 tech-dictionary에 두고 순환 의존을 피한다.)
 */
export function semanticSkillSimilarity(userSkill: string, jobSkill: string): number {
  return loadOntology().similarity(userSkill, jobSkill);
}

/**
 * 사용자 스킬 집합이 단일 공고 스킬을 얼마나 커버하는지 (0~1).
 * 가장 유사한 사용자 스킬 하나의 점수를 채택한다 (max).
 */
export function bestSemanticMatch(userSkills: string[], jobSkill: string): number {
  let best = 0;
  for (const userSkill of userSkills) {
    const score = semanticSkillSimilarity(userSkill, jobSkill);
    if (score > best) best = score;
    if (best === 1.0) break;
  }
  return best;
}
