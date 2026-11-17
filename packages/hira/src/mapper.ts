import { parseYmd } from "@solver/shared";
import type { HospBasisItem } from "./client";
import { CL_CODES, SIDO_ALIASES, SIDO_CODES } from "./codes";

/** 심평원 응답 → leads insert 형태 */
export function mapHospitalToLead(h: HospBasisItem) {
  const est = parseYmd(h.estbDd ?? undefined);
  return {
    ykiho: h.ykiho,
    name: h.yadmNm.trim(),
    clCd: h.clCd,
    clName: h.clCdNm ?? (h.clCd ? CL_CODES[h.clCd] ?? null : null),
    sido: normalizeSido(h.sidoCdNm),
    sggu: h.sgguCdNm,
    emd: h.emdongNm,
    address: h.addr,
    lat: h.YPos,
    lng: h.XPos,
    estDate: est ? est.toISOString().slice(0, 10) : null,
    doctorCnt: h.drTotCnt,
    homepage: normalizeUrl(h.hospUrl),
    phone: h.telno,
    hiraRaw: h as unknown as Record<string, unknown>,
  };
}

function normalizeSido(s: string | null): string | null {
  if (!s) return null;
  // 심평원은 "서울"·"부산" 같은 약칭으로 준다 → 전국 공통으로 정식 명칭으로 맞춘다
  const t = s.trim();
  if (SIDO_CODES[t]) return t;
  // "세종시"처럼 약칭에 행정 단위가 붙어 오는 경우도 있다
  return SIDO_ALIASES[t] ?? SIDO_ALIASES[t.replace(/(특별자치시|특별자치도|광역시|특별시|시|도)$/, "")] ?? t;
}

export function normalizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let s = u.trim();
  if (!s || s === "-") return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}
