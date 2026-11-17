import { describe, it, expect } from "vitest";
import { extractAddress, matchKeys, suppressionDomain } from "../src/inboundMatch";

describe("extractAddress", () => {
  it("이름이 붙은 From에서 주소만 소문자로", () => {
    expect(extractAddress("김원장 <Dr.Kim@Hospital.co.kr>")).toBe("dr.kim@hospital.co.kr");
  });
  it("주소가 없으면 null", () => {
    expect(extractAddress("undisclosed-recipients")).toBeNull();
  });
});

describe("matchKeys — 스레드 매칭 실패 시", () => {
  it("병원 자체 도메인은 주소 일치 후 도메인 추정까지 허용", () => {
    expect(matchKeys({ from: "원무과 <desk@hospital.co.kr>" }, null)).toEqual({ exactEmail: "desk@hospital.co.kr", guessDomain: "hospital.co.kr" });
  });
  it("공용 메일 도메인은 도메인 추정 금지 (뉴스레터가 naver 리드에 붙지 않는다)", () => {
    for (const from of ["news@naver.com", "Someone <x@gmail.com>", "a@daum.net", "b@hanmail.net", "c@kakao.com"]) {
      expect(matchKeys({ from }, null).guessDomain).toBeNull();
    }
    expect(matchKeys({ from: "news@NAVER.com" }, null)).toEqual({ exactEmail: "news@naver.com", guessDomain: null });
  });
  it("바운스는 반송된 수신자 주소로만 찾고 메일 서버 도메인으로 추정하지 않는다", () => {
    expect(matchKeys({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", isBounce: true }, "Noone@hospital.co.kr")).toEqual({ exactEmail: "noone@hospital.co.kr", guessDomain: null });
    expect(matchKeys({ from: "postmaster@hospital.co.kr", isBounce: true }, null)).toEqual({ exactEmail: null, guessDomain: null });
  });
  it("주소를 못 읽으면 매칭 키 없음 → 처리 대상 아님", () => {
    expect(matchKeys({ from: "no address here" }, null)).toEqual({ exactEmail: null, guessDomain: null });
  });
});

describe("suppressionDomain — 수신거부·하드 바운스 시 도메인 억제 범위", () => {
  it("병원 자체 도메인은 도메인까지 억제", () => {
    expect(suppressionDomain("info@Hospital.co.kr", false)).toBe("hospital.co.kr");
  });
  it("공용 메일 도메인은 도메인 억제 금지 (naver.com 전체가 막히지 않는다)", () => {
    expect(suppressionDomain("doc@naver.com", false)).toBeNull();
    expect(suppressionDomain("doc@gmail.com", false)).toBeNull();
  });
  it("개인 추정 연락처는 도메인 억제 금지", () => {
    expect(suppressionDomain("owner@hospital.co.kr", true)).toBeNull();
  });
});
