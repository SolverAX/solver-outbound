import { DEFAULT_SETTINGS } from "@solver/shared";
import { COMMON_QUESTION_TEMPLATES, DEPT_QUESTION_TEMPLATES } from "./deptQuestions";

export interface BuildQuestionsInput {
  sggu: string;
  emd?: string | null;
  dept?: string;
  templates?: readonly string[];
}

/** 진료과의 기본 템플릿: 정형외과는 설정값, 그 외는 공통 4개 + 과별 질문. 질문이 준비되지 않은 과는 빈 배열. */
export function templatesForDept(dept: string, orthoTemplates: readonly string[] = DEFAULT_SETTINGS.geo.questionTemplates): readonly string[] {
  if (dept === "정형외과") return orthoTemplates;
  const own = DEPT_QUESTION_TEMPLATES[dept];
  return own ? [...COMMON_QUESTION_TEMPLATES, ...own] : [];
}

/** 지역 × 진료과 × 의도 템플릿으로 병원당 질문 세트를 만든다. 동(emd)이 없으면 {동} 템플릿은 건너뛴다. */
export function buildQuestions({ sggu, emd, dept = "정형외과", templates = templatesForDept(dept) }: BuildQuestionsInput): string[] {
  const out: string[] = [];
  for (const t of templates) {
    if (t.includes("{동}") && !emd) continue;
    const q = t.replaceAll("{구}", sggu).replaceAll("{동}", emd ?? "").replaceAll("{진료과}", dept).replace(/\s+/g, " ").trim();
    if (!out.includes(q)) out.push(q);
  }
  return out;
}
