import { DGSBJT_CODES } from "./codes";

/** 병원명에 흔히 쓰이는 옛 명칭·줄임 표기 → 표준 진료과명 */
const NAME_SYNONYMS: [string, string][] = [
  ["소아청소년과", "소아청소년과"],
  ["소아과", "소아청소년과"],
  ["정신건강의학과", "정신건강의학과"],
  ["신경정신과", "정신건강의학과"],
  ["정신과", "정신건강의학과"],
  ["마취통증의학과", "마취통증의학과"],
  ["통증의학과", "마취통증의학과"],
  ["심장혈관흉부외과", "심장혈관흉부외과"],
  ["흉부외과", "심장혈관흉부외과"],
  ["비뇨의학과", "비뇨의학과"],
  ["비뇨기과", "비뇨의학과"],
  ["영상의학과", "영상의학과"],
  ["재활의학과", "재활의학과"],
  ["가정의학과", "가정의학과"],
  ["이비인후과", "이비인후과"],
  ["산부인과", "산부인과"],
  ["정형외과", "정형외과"],
  ["신경외과", "신경외과"],
  ["성형외과", "성형외과"],
  ["피부과", "피부과"],
  ["신경과", "신경과"],
  ["내과", "내과"],
  ["안과", "안과"],
  ["외과", "외과"],
];

export const DEPT_NAMES: readonly string[] = Object.values(DGSBJT_CODES);

/** 병원명에 들어 있는 진료과를 등장 순서대로. 긴 명칭이 짧은 명칭을 가린다("정형외과" 안의 "외과"는 세지 않음). */
export function deptsInName(name: string): string[] {
  const flat = name.replace(/\s+/g, "");
  const taken: boolean[] = new Array(flat.length).fill(false);
  const hits: { at: number; dept: string }[] = [];
  for (const [word, dept] of NAME_SYNONYMS) {
    let from = 0;
    while (true) {
      const at = flat.indexOf(word, from);
      if (at < 0) break;
      from = at + word.length;
      let free = true;
      for (let i = at; i < at + word.length; i++) if (taken[i]) free = false;
      if (!free) continue;
      for (let i = at; i < at + word.length; i++) taken[i] = true;
      hits.push({ at, dept });
    }
  }
  const out: string[] = [];
  for (const h of hits.sort((a, b) => a.at - b.at)) if (!out.includes(h.dept)) out.push(h.dept);
  return out;
}

/**
 * 리드의 대표 진료과 1개. 진단 질문·메일 문구가 이 값으로 갈린다.
 *  1) 병원명에 진료과가 있으면 그중 첫 번째 ("○○피부과의원" → 피부과)
 *  2) 이름에 없고 심평원 진료과 태그가 하나뿐이면 그 과목
 *  3) 그 외(이름에 과목이 없고 여러 과목을 보는 의원)는 null — 사람이 정하기 전에는 진단·발송하지 않는다
 */
export function deriveDept(name: string, deptTags: readonly string[] = []): string | null {
  const inName = deptsInName(name);
  if (inName.length) return inName[0]!;
  const known = deptTags.filter((t) => DEPT_NAMES.includes(t));
  return known.length === 1 ? known[0]! : null;
}
