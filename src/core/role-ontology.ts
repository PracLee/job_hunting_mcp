/**
 * 직무 위계 온톨로지 — 공고 검색에서 직무 키워드의 의미적 매칭을 담당.
 *
 * 책임 분리:
 * - tech-dictionary: 스킬(영문 canonical) 정규화
 * - skill-ontology: 스킬 사이의 의미 거리
 * - role-ontology(이 파일): 직무 표현(한/영, 변형) 정규화 + 직무 사이 의미 거리 + 키워드 확장
 *
 * 스킬과 달리 직무는 표기 변형이 매우 다양해 노드에 aliases를 내장한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type RoleRelation = 'isA' | 'similarTo';

interface RoleNode {
  id: string;
  type: 'Role';
  abstract?: boolean;
  aliases: string[];
}

interface RoleEdge {
  s: string;
  p: RoleRelation;
  o: string;
  weight?: number;
}

interface RoleOntologyFile {
  nodes: RoleNode[];
  edges: RoleEdge[];
}

interface AdjacencyEntry {
  predicate: RoleRelation;
  target: string;
  weight: number;
}

export interface ExpandedKeyword {
  /** 원본 또는 alias 한 개 (그대로 검색 키워드로 사용 가능) */
  keyword: string;
  /** 원본 키워드와의 의미 거리 (1.0 = 같음) */
  weight: number;
  /** 추적용 — 어떤 role 노드에서 파생되었는지 */
  fromRole: string;
}

class RoleOntology {
  private nodes = new Map<string, RoleNode>();
  private adjacency = new Map<string, AdjacencyEntry[]>();
  /** 소문자 alias → role id (자유 텍스트에서 role을 찾기 위한 역인덱스) */
  private aliasIndex = new Map<string, string>();

  constructor(data: RoleOntologyFile) {
    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
      // canonical id 자체도 alias로 등록
      this.registerAlias(node.id, node.id);
      for (const alias of node.aliases) {
        this.registerAlias(alias, node.id);
      }
    }
    for (const edge of data.edges) {
      const weight = edge.weight ?? 1.0;
      this.addEdge(edge.s, edge.p, edge.o, weight);
      if (edge.p === 'similarTo') {
        this.addEdge(edge.o, edge.p, edge.s, weight);
      }
    }
  }

  private registerAlias(alias: string, roleId: string): void {
    const key = alias.toLowerCase().trim();
    if (!key) return;
    // 가장 먼저 등록된 매핑을 우선 (구체적인 id가 먼저 들어오게 JSON 순서로 보장)
    if (!this.aliasIndex.has(key)) {
      this.aliasIndex.set(key, roleId);
    }
  }

  private addEdge(s: string, p: RoleRelation, o: string, weight: number): void {
    const list = this.adjacency.get(s) ?? [];
    list.push({ predicate: p, target: o, weight });
    this.adjacency.set(s, list);
  }

  /**
   * 자유 텍스트에서 role을 인식한다.
   * - 정확 alias 매칭이 있으면 그 role 반환
   * - 없으면 가장 긴 alias가 텍스트에 포함된 role 반환 ("backend developer 채용" → BackendEngineer)
   * - 그것도 없으면 null
   */
  resolveRole(text: string): string | null {
    const lower = text.toLowerCase().trim();
    if (!lower) return null;

    const exact = this.aliasIndex.get(lower);
    if (exact) return exact;

    let bestRole: string | null = null;
    let bestLen = 0;
    for (const [alias, roleId] of this.aliasIndex) {
      // 짧은 alias("ai")가 무관한 단어에 끼어드는 걸 피하기 위해 단어 경계 체크
      if (alias.length < 2) continue;
      if (!includesAsWord(lower, alias)) continue;
      if (alias.length > bestLen) {
        bestLen = alias.length;
        bestRole = roleId;
      }
    }
    return bestRole;
  }

  /** 두 role 사이 의미 거리 (0~1). 깊이 1 추론. */
  similarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!this.nodes.has(a) || !this.nodes.has(b)) return 0.0;

    for (const edge of this.adjacency.get(a) ?? []) {
      if (edge.predicate === 'similarTo' && edge.target === b) return edge.weight;
    }
    if (this.sharesIsAParent(a, b)) return 0.5;
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

  /**
   * 키워드 한 개를 의미적으로 가까운 키워드들로 확장.
   * - 키워드가 role로 인식되지 않으면 [원본 1.0] 만 반환 (확장 없음)
   * - role이면: 자기 자신 + similarTo 이웃의 대표 alias들을 weight와 함께 반환
   * - threshold 이하의 약한 매칭은 제외
   */
  expandKeyword(keyword: string, threshold: number = 0.6): ExpandedKeyword[] {
    const trimmed = keyword.trim();
    const role = this.resolveRole(trimmed);
    if (!role) {
      return [{ keyword: trimmed, weight: 1.0, fromRole: '__unknown__' }];
    }

    const results: ExpandedKeyword[] = [
      { keyword: trimmed, weight: 1.0, fromRole: role },
    ];

    const seen = new Set<string>([trimmed.toLowerCase()]);

    for (const edge of this.adjacency.get(role) ?? []) {
      if (edge.predicate !== 'similarTo') continue;
      if (edge.weight < threshold) continue;
      const targetNode = this.nodes.get(edge.target);
      if (!targetNode || targetNode.abstract) continue;

      // 대표 alias 하나만 사용 (가장 자주 쓰일 형식 — aliases[0])
      const repAlias = targetNode.aliases[0] ?? targetNode.id;
      const key = repAlias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        keyword: repAlias,
        weight: edge.weight,
        fromRole: edge.target,
      });
    }

    return results;
  }
}

function includesAsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (haystack === needle) return true;
  // 한글이 포함된 alias는 substring 매칭으로 충분 (한글은 단어 경계 개념이 약함)
  if (/[ㄱ-힝]/.test(needle)) {
    return haystack.includes(needle);
  }
  // 영문 alias는 단어 경계 체크 (앞뒤가 영숫자가 아님)
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : haystack[idx - 1];
  const after = idx + needle.length >= haystack.length ? '' : haystack[idx + needle.length];
  const isBoundary = (ch: string) => ch === '' || !/[a-z0-9]/.test(ch);
  return isBoundary(before) && isBoundary(after);
}

// --- 싱글톤 로더 ---

let cached: RoleOntology | null = null;

function defaultPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../data/role-ontology.json');
}

export function loadRoleOntology(path: string = defaultPath()): RoleOntology {
  if (cached) return cached;
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw) as RoleOntologyFile;
  cached = new RoleOntology(data);
  return cached;
}

export function resetRoleOntology(): void {
  cached = null;
}

/** 텍스트에서 role 인식 (없으면 null) */
export function resolveRole(text: string): string | null {
  return loadRoleOntology().resolveRole(text);
}

/** 두 텍스트의 role 사이 의미 점수 (0~1). 어느 한쪽이라도 role 미인식이면 0. */
export function roleSimilarity(textA: string, textB: string): number {
  const ontology = loadRoleOntology();
  const a = ontology.resolveRole(textA);
  const b = ontology.resolveRole(textB);
  if (!a || !b) return 0;
  return ontology.similarity(a, b);
}

/** 키워드 의미 확장 */
export function expandKeyword(keyword: string, threshold?: number): ExpandedKeyword[] {
  return loadRoleOntology().expandKeyword(keyword, threshold);
}
