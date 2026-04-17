/**
 * 기술 사전 — 기술스택 정규화 및 매칭에 사용
 * 동의어, 카테고리, 관련 기술 매핑
 */

export interface TechEntry {
  canonical: string;        // 정식 명칭
  aliases: string[];        // 동의어/약어
  category: TechCategory;
  related?: string[];       // 관련 기술
}

export type TechCategory =
  | 'language'
  | 'framework'
  | 'database'
  | 'infrastructure'
  | 'devops'
  | 'messaging'
  | 'frontend'
  | 'mobile'
  | 'ai_ml'
  | 'testing'
  | 'tool'
  | 'concept';

const TECH_ENTRIES: TechEntry[] = [
  // Languages
  { canonical: 'Java', aliases: ['java', 'JAVA', '자바'], category: 'language', related: ['Spring', 'Kotlin'] },
  { canonical: 'Kotlin', aliases: ['kotlin', '코틀린', 'kt'], category: 'language', related: ['Java', 'Spring'] },
  { canonical: 'Python', aliases: ['python', '파이썬', 'py'], category: 'language', related: ['Django', 'FastAPI', 'Flask'] },
  { canonical: 'JavaScript', aliases: ['javascript', 'js', 'JS', '자바스크립트'], category: 'language', related: ['TypeScript', 'Node.js', 'React'] },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts', 'TS', '타입스크립트'], category: 'language', related: ['JavaScript', 'Node.js'] },
  { canonical: 'Go', aliases: ['go', 'golang', 'Golang'], category: 'language' },
  { canonical: 'Rust', aliases: ['rust', '러스트'], category: 'language' },
  { canonical: 'C++', aliases: ['c++', 'cpp', 'CPP', 'C/C++'], category: 'language' },
  { canonical: 'C#', aliases: ['c#', 'csharp', 'C Sharp', '씨샵'], category: 'language', related: ['.NET'] },
  { canonical: 'Swift', aliases: ['swift', '스위프트'], category: 'language', related: ['iOS'] },
  { canonical: 'Dart', aliases: ['dart', '다트'], category: 'language', related: ['Flutter'] },
  { canonical: 'Scala', aliases: ['scala', '스칼라'], category: 'language', related: ['Java', 'Spark'] },

  // Backend Frameworks
  { canonical: 'Spring', aliases: ['spring', '스프링', 'Spring Framework'], category: 'framework', related: ['Java', 'Spring Boot'] },
  { canonical: 'Spring Boot', aliases: ['spring boot', 'springboot', 'SpringBoot', '스프링부트', '스프링 부트'], category: 'framework', related: ['Java', 'Spring'] },
  { canonical: 'Spring MVC', aliases: ['spring mvc', 'SpringMVC'], category: 'framework', related: ['Spring'] },
  { canonical: 'Spring Batch', aliases: ['spring batch', 'SpringBatch', '스프링배치'], category: 'framework', related: ['Spring'] },
  { canonical: 'JPA', aliases: ['jpa', 'JPA', 'Java Persistence API', 'Spring Data JPA'], category: 'framework', related: ['Hibernate', 'Spring'] },
  { canonical: 'Hibernate', aliases: ['hibernate', '하이버네이트'], category: 'framework', related: ['JPA'] },
  { canonical: 'MyBatis', aliases: ['mybatis', 'MyBatis', '마이바티스', 'iBatis'], category: 'framework', related: ['Java'] },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs', 'NodeJS', 'node', '노드'], category: 'framework', related: ['JavaScript', 'Express', 'NestJS'] },
  { canonical: 'Express', aliases: ['express', 'express.js', 'expressjs'], category: 'framework', related: ['Node.js'] },
  { canonical: 'NestJS', aliases: ['nestjs', 'NestJS', 'nest.js', '네스트'], category: 'framework', related: ['Node.js', 'TypeScript'] },
  { canonical: 'Django', aliases: ['django', '장고'], category: 'framework', related: ['Python'] },
  { canonical: 'FastAPI', aliases: ['fastapi', 'fast-api', '패스트API'], category: 'framework', related: ['Python'] },
  { canonical: 'Flask', aliases: ['flask', '플라스크'], category: 'framework', related: ['Python'] },
  { canonical: '.NET', aliases: ['.net', 'dotnet', 'ASP.NET', '닷넷'], category: 'framework', related: ['C#'] },

  // Frontend
  { canonical: 'React', aliases: ['react', 'reactjs', 'React.js', '리액트'], category: 'frontend', related: ['JavaScript', 'TypeScript', 'Next.js'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs', 'NextJS', '넥스트'], category: 'frontend', related: ['React'] },
  { canonical: 'Vue.js', aliases: ['vue', 'vue.js', 'vuejs', 'Vue', '뷰'], category: 'frontend', related: ['Nuxt.js'] },
  { canonical: 'Angular', aliases: ['angular', '앵귤러', 'AngularJS'], category: 'frontend' },
  { canonical: 'Svelte', aliases: ['svelte', '스벨트'], category: 'frontend' },

  // Mobile
  { canonical: 'Android', aliases: ['android', '안드로이드', 'AOS'], category: 'mobile', related: ['Kotlin', 'Java'] },
  { canonical: 'iOS', aliases: ['ios', 'iOS', '아이오에스'], category: 'mobile', related: ['Swift'] },
  { canonical: 'React Native', aliases: ['react native', 'react-native', 'RN', '리액트네이티브'], category: 'mobile', related: ['React'] },
  { canonical: 'Flutter', aliases: ['flutter', '플러터'], category: 'mobile', related: ['Dart'] },

  // Databases
  { canonical: 'MySQL', aliases: ['mysql', 'MYSQL'], category: 'database' },
  { canonical: 'MariaDB', aliases: ['mariadb', 'MariaDB'], category: 'database' },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres', 'Postgres', 'pg', '포스트그레스'], category: 'database' },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongo', '몽고DB', '몽고디비'], category: 'database' },
  { canonical: 'Redis', aliases: ['redis', '레디스'], category: 'database' },
  { canonical: 'Elasticsearch', aliases: ['elasticsearch', 'elastic', '엘라스틱서치', 'ELK'], category: 'database' },
  { canonical: 'Oracle', aliases: ['oracle', 'Oracle DB', '오라클'], category: 'database' },
  { canonical: 'DynamoDB', aliases: ['dynamodb', 'DynamoDB', '다이나모'], category: 'database', related: ['AWS'] },
  { canonical: 'Cassandra', aliases: ['cassandra', '카산드라'], category: 'database' },

  // Infrastructure & Cloud
  { canonical: 'AWS', aliases: ['aws', 'Amazon Web Services', '아마존 웹 서비스'], category: 'infrastructure' },
  { canonical: 'GCP', aliases: ['gcp', 'Google Cloud', 'Google Cloud Platform', '구글 클라우드'], category: 'infrastructure' },
  { canonical: 'Azure', aliases: ['azure', 'Microsoft Azure', '애저'], category: 'infrastructure' },
  { canonical: 'Docker', aliases: ['docker', '도커'], category: 'infrastructure', related: ['Kubernetes'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s', 'K8s', '쿠버네티스', '쿠베'], category: 'infrastructure', related: ['Docker'] },
  { canonical: 'Terraform', aliases: ['terraform', '테라폼'], category: 'infrastructure' },
  { canonical: 'Nginx', aliases: ['nginx', 'NGINX', '엔진엑스'], category: 'infrastructure' },
  { canonical: 'Linux', aliases: ['linux', '리눅스', 'Ubuntu', 'CentOS'], category: 'infrastructure' },

  // DevOps / CI/CD
  { canonical: 'Jenkins', aliases: ['jenkins', '젠킨스'], category: 'devops' },
  { canonical: 'GitHub Actions', aliases: ['github actions', 'GHA', '깃허브 액션'], category: 'devops' },
  { canonical: 'ArgoCD', aliases: ['argocd', 'Argo CD', '아르고'], category: 'devops' },
  { canonical: 'GitLab CI', aliases: ['gitlab ci', 'gitlab-ci'], category: 'devops' },

  // Messaging / Streaming
  { canonical: 'Kafka', aliases: ['kafka', 'Apache Kafka', '카프카'], category: 'messaging' },
  { canonical: 'RabbitMQ', aliases: ['rabbitmq', 'RabbitMQ', '래빗MQ'], category: 'messaging' },
  { canonical: 'gRPC', aliases: ['grpc', 'gRPC', 'GRPC'], category: 'messaging' },

  // AI/ML
  { canonical: 'PyTorch', aliases: ['pytorch', '파이토치'], category: 'ai_ml' },
  { canonical: 'TensorFlow', aliases: ['tensorflow', '텐서플로우', '텐서플로'], category: 'ai_ml' },
  { canonical: 'LangChain', aliases: ['langchain', '랭체인'], category: 'ai_ml', related: ['RAG', 'LLM'] },
  { canonical: 'RAG', aliases: ['rag', 'Retrieval Augmented Generation'], category: 'ai_ml' },
  { canonical: 'LLM', aliases: ['llm', 'Large Language Model', '대규모 언어 모델'], category: 'ai_ml' },
  { canonical: 'Hugging Face', aliases: ['huggingface', 'hugging face', '허깅페이스'], category: 'ai_ml' },

  // Testing
  { canonical: 'JUnit', aliases: ['junit', 'JUnit5'], category: 'testing', related: ['Java'] },
  { canonical: 'Jest', aliases: ['jest'], category: 'testing', related: ['JavaScript'] },
  { canonical: 'pytest', aliases: ['pytest', 'py.test'], category: 'testing', related: ['Python'] },

  // Concepts
  { canonical: 'MSA', aliases: ['msa', 'microservice', 'microservices', '마이크로서비스', 'Microservice Architecture'], category: 'concept' },
  { canonical: 'REST API', aliases: ['rest', 'rest api', 'RESTful', 'restful', 'REST'], category: 'concept' },
  { canonical: 'GraphQL', aliases: ['graphql', '그래프큐엘'], category: 'concept' },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'cicd', 'CI CD', '지속적 통합/배포'], category: 'concept' },
  { canonical: 'TDD', aliases: ['tdd', 'Test Driven Development', '테스트 주도 개발'], category: 'concept' },
  { canonical: 'DDD', aliases: ['ddd', 'Domain Driven Design', '도메인 주도 설계'], category: 'concept' },
  { canonical: 'Event Sourcing', aliases: ['event sourcing', '이벤트 소싱'], category: 'concept' },
  { canonical: 'CQRS', aliases: ['cqrs'], category: 'concept' },
  { canonical: 'Agile', aliases: ['agile', '애자일', 'Scrum', 'scrum', '스크럼'], category: 'concept' },
];

// --- 검색/매칭 함수 ---

const aliasMap = new Map<string, string>();
for (const entry of TECH_ENTRIES) {
  aliasMap.set(entry.canonical.toLowerCase(), entry.canonical);
  for (const alias of entry.aliases) {
    aliasMap.set(alias.toLowerCase(), entry.canonical);
  }
}

/** 텍스트에서 기술 키워드를 추출하여 정규화된 이름 목록 반환 */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const entry of TECH_ENTRIES) {
    // 정식 명칭 체크
    if (lowerText.includes(entry.canonical.toLowerCase())) {
      found.add(entry.canonical);
      continue;
    }
    // 동의어 체크
    for (const alias of entry.aliases) {
      if (lowerText.includes(alias.toLowerCase())) {
        found.add(entry.canonical);
        break;
      }
    }
  }

  return Array.from(found);
}

/** 기술 이름을 정규화 (동의어 → 정식 명칭) */
export function normalizeSkill(name: string): string {
  return aliasMap.get(name.toLowerCase()) || name;
}

/** 두 기술 목록의 매칭 점수 (0~100) */
export function skillMatchScore(userSkills: string[], requiredSkills: string[], preferredSkills: string[] = []): number {
  if (requiredSkills.length === 0 && preferredSkills.length === 0) return 50;

  const normalizedUser = new Set(userSkills.map(s => normalizeSkill(s)));

  let score = 0;
  let total = 0;

  // Required: 가중치 2
  for (const skill of requiredSkills) {
    const norm = normalizeSkill(skill);
    total += 2;
    if (normalizedUser.has(norm)) {
      score += 2;
    }
  }

  // Preferred: 가중치 1
  for (const skill of preferredSkills) {
    const norm = normalizeSkill(skill);
    total += 1;
    if (normalizedUser.has(norm)) {
      score += 1;
    }
  }

  return total === 0 ? 50 : Math.round((score / total) * 100);
}

/** 기술 정보 조회 */
export function getTechEntry(name: string): TechEntry | undefined {
  const canonical = normalizeSkill(name);
  return TECH_ENTRIES.find(e => e.canonical === canonical);
}

/** 전체 기술 사전 반환 */
export function getAllTechEntries(): TechEntry[] {
  return [...TECH_ENTRIES];
}
