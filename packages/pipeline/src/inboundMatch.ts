import { FREE_MAIL_DOMAINS } from "@solver/shared";

/**
 * 수신 메일 → 리드 매칭 규칙 (순수 함수).
 * 폴링 계정이 담당자 업무 메일함일 수 있으므로, 리드와 연결되지 않는 메일은 저장·분류하지 않는다.
 */

const ADDRESS_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** "이름 <a@b.kr>" → "a@b.kr" */
export function extractAddress(from: string): string | null {
  return from.match(ADDRESS_RE)?.[0]?.toLowerCase() ?? null;
}

export function domainOf(email: string): string | null {
  return email.split("@")[1]?.toLowerCase() || null;
}

/** 공용 메일(naver·gmail 등)은 도메인이 같다고 같은 병원이 아니다 */
export function isSharedMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

export interface MatchKeys {
  /** 연락처와 정확히 일치해야 하는 주소 (바운스면 반송된 수신자, 아니면 발신자) */
  exactEmail: string | null;
  /** 같은 병원 도메인으로 추정해도 되는 경우에만 값이 있다 */
  guessDomain: string | null;
}

/**
 * 스레드 매칭이 실패했을 때 쓸 키.
 * - 바운스: 발신자는 메일 서버이므로 반송된 수신자 주소로만 찾는다. 도메인 추정 없음.
 * - 일반 회신: 발신 주소 정확 일치 → 병원 자체 도메인이면 도메인 추정. 공용 메일 도메인은 추정하지 않는다.
 */
export function matchKeys(mail: { from: string; isBounce?: boolean }, bounceAddress: string | null): MatchKeys {
  if (mail.isBounce) return { exactEmail: bounceAddress?.toLowerCase() ?? null, guessDomain: null };
  const exactEmail = extractAddress(mail.from);
  const domain = exactEmail ? domainOf(exactEmail) : null;
  return { exactEmail, guessDomain: domain && !isSharedMailDomain(domain) ? domain : null };
}

/** 억제 목록에 도메인까지 올릴지. 개인 추정 주소와 공용 메일 도메인은 주소 단위로만 억제한다. */
export function suppressionDomain(email: string, contactIsPersonal: boolean): string | null {
  if (contactIsPersonal) return null;
  const domain = domainOf(email);
  return domain && !isSharedMailDomain(domain) ? domain : null;
}
