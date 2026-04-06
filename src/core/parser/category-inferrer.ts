/**
 * 스킬/텍스트에서 직무 카테고리(백엔드, 프론트엔드 등) 추론
 */

export function inferJobCategory(skills: string[], text: string): string {
  const lower = text.toLowerCase();
  const skillSet = new Set(skills.map(s => s.toLowerCase()));

  const scores: Record<string, number> = {
    backend: 0, frontend: 0, fullstack: 0, mobile: 0,
    data: 0, devops: 0, ai_ml: 0, other: 0,
  };

  const techMap: Record<string, string[]> = {
    backend: ['spring', 'spring boot', 'django', 'fastapi', 'express', 'nestjs', 'jpa', 'mybatis', 'node.js'],
    frontend: ['react', 'vue.js', 'angular', 'next.js', 'svelte'],
    mobile: ['android', 'ios', 'react native', 'flutter', 'swift', 'kotlin'],
    data: ['spark', 'hadoop', 'airflow', 'tableau', 'bigquery'],
    devops: ['kubernetes', 'terraform', 'ansible', 'jenkins', 'argocd'],
    ai_ml: ['pytorch', 'tensorflow', 'langchain', 'hugging face'],
  };

  for (const [cat, techs] of Object.entries(techMap)) {
    for (const tech of techs) {
      if (skillSet.has(tech)) scores[cat] += 2;
    }
  }

  if (/백엔드|back-?end|서버\s*개발/i.test(lower)) scores.backend += 3;
  if (/프론트엔드|front-?end|웹\s*개발/i.test(lower)) scores.frontend += 3;
  if (/풀스택|full-?stack/i.test(lower)) scores.fullstack += 3;
  if (/안드로이드|ios|모바일|앱\s*개발/i.test(lower)) scores.mobile += 3;
  if (/데이터\s*엔지니어|데이터\s*분석/i.test(lower)) scores.data += 3;
  if (/devops|인프라\s*엔지니어|SRE/i.test(lower)) scores.devops += 3;
  if (/ai|ml|머신러닝|딥러닝/i.test(lower)) scores.ai_ml += 3;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : 'other';
}
