import { describe, it, expect } from "vitest";
import { assignTier, estimateStaff, mapHospitalToLead, DRY_RUN_HOSPITALS, resolveSido } from "../src";

const now = new Date("2026-09-22T00:00:00+09:00");

describe("assignTier", () => {
  it("T2 for 2~7년차 · 의사 2~5 · 직원 10+", () => {
    expect(assignTier({ clCd: "31", sggu: "강남구", estDate: "2021-03-15", doctorCnt: 3, staffEst: 12 }, undefined, now).tier).toBe("T2");
  });
  it("EXCLUDED for 종합병원 / 1년 미만 / 강릉", () => {
    expect(assignTier({ clCd: "11", sggu: "강남구", estDate: "2000-01-01", doctorCnt: 50, staffEst: 200 }, undefined, now).tier).toBe("EXCLUDED");
    expect(assignTier({ clCd: "31", sggu: "강남구", estDate: "2026-04-01", doctorCnt: 2, staffEst: 12 }, undefined, now).tier).toBe("EXCLUDED");
    expect(assignTier({ clCd: "31", sggu: "강릉시", estDate: "2020-01-01", doctorCnt: 2, staffEst: 12 }, undefined, now).tier).toBe("EXCLUDED");
  });
  it("T1 when referral possible (and not excluded)", () => {
    expect(assignTier({ clCd: "31", sggu: "서초구", estDate: "2015-01-01", doctorCnt: 1, staffEst: 3, referralPossible: true }, undefined, now).tier).toBe("T1");
  });
  it("T3 with weak place signals", () => {
    const r = assignTier({ clCd: "31", sggu: "서초구", estDate: "2019-11-01", doctorCnt: 2, staffEst: 9, placeRank: 14, reviewCnt: 21, hasHomepage: false }, undefined, now);
    expect(r.tier).toBe("T3");
    expect(r.reason).toContain("홈페이지 없음");
  });
});

describe("helpers", () => {
  it("estimateStaff adds PT/ops", () => {
    expect(estimateStaff(3, ["도수치료"])).toBe(14);
    expect(estimateStaff(null)).toBeNull();
  });
  it("maps HIRA item to lead", () => {
    const l = mapHospitalToLead(DRY_RUN_HOSPITALS[0]!);
    expect(l.ykiho).toBe("DRY000001");
    expect(l.estDate).toBe("2021-03-14".slice(0, 4) + l.estDate!.slice(4)); // date parsed in KST
    expect(l.sido).toBe("서울특별시");
    expect(l.homepage).toBe("https://example.com/");
  });
  it("수도권 밖 시도 약칭도 정식 명칭으로 저장한다", () => {
    const base = DRY_RUN_HOSPITALS[0]!;
    expect(mapHospitalToLead({ ...base, sidoCdNm: "부산" }).sido).toBe("부산광역시");
    expect(mapHospitalToLead({ ...base, sidoCdNm: "제주" }).sido).toBe("제주특별자치도");
    expect(mapHospitalToLead({ ...base, sidoCdNm: "세종시" }).sido).toBe("세종특별자치시");
    expect(mapHospitalToLead({ ...base, sidoCdNm: "경기도" }).sido).toBe("경기도");
    // 심평원이 주는 통합 명칭처럼 표에 없는 값은 그대로 둔다
    expect(mapHospitalToLead({ ...base, sidoCdNm: "전남광주" }).sido).toBe("전남광주");
  });
  it("resolves sido aliases", () => {
    expect(resolveSido("서울")?.code).toBe("110000");
    expect(resolveSido("경기도")?.code).toBe("310000");
  });
});
