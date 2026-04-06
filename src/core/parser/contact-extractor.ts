/**
 * 이력서에서 연락처 정보(이름, 이메일, 전화번호) 추출
 */

export function extractContact(text: string): {
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  const email = text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
  const phone = text.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/)?.[0] || null;

  let name: string | null = null;
  const nameMatch = text.match(/(?:이름\s*[:：]\s*)([^\r\n]+)/);
  if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    const firstLines = text.split('\n').slice(0, 5);
    for (const line of firstLines) {
      const m = line.trim().match(/^([가-힣]{2,4})$/);
      if (m) { name = m[1]; break; }
      // "홍길동 | 백엔드 개발자" 패턴
      const m2 = line.trim().match(/^([가-힣]{2,4})\s*[|·/]/);
      if (m2) { name = m2[1]; break; }
      // "홍길동 경력" / "홍길동 사원" 패턴
      const m3 = line.trim().match(/^([가-힣]{2,4})\s+(?:경력|사원|대리|과장|차장|부장|이사|팀장|개발자|엔지니어)/);
      if (m3) { name = m3[1]; break; }
    }
  }

  return { name, email, phone };
}
