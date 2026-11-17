import { describe, it, expect } from "vitest";
import { deriveDept, deptsInName } from "../src";

describe("deptsInName", () => {
  it("긴 명칭이 짧은 명칭을 가린다", () => {
    expect(deptsInName("강남바른정형외과의원")).toEqual(["정형외과"]);
    expect(deptsInName("서울신경외과의원")).toEqual(["신경외과"]);
    expect(deptsInName("연세성형외과")).toEqual(["성형외과"]);
    expect(deptsInName("김외과의원")).toEqual(["외과"]);
  });
  it("옛 명칭·줄임 표기를 표준 과목으로", () => {
    expect(deptsInName("튼튼소아과의원")).toEqual(["소아청소년과"]);
    expect(deptsInName("맑은비뇨기과의원")).toEqual(["비뇨의학과"]);
    expect(deptsInName("편한통증의학과의원")).toEqual(["마취통증의학과"]);
    expect(deptsInName("마음신경정신과의원")).toEqual(["정신건강의학과"]);
  });
  it("여러 과목은 이름에 나온 순서대로", () => {
    expect(deptsInName("굿본정형외과재활의학과의원")).toEqual(["정형외과", "재활의학과"]);
    expect(deptsInName("강동중앙내과외과의원")).toEqual(["내과", "외과"]);
  });
  it("과목이 없으면 빈 배열", () => {
    expect(deptsInName("톡스앤필의원")).toEqual([]);
  });
});

describe("deriveDept", () => {
  it("병원명이 진료과 태그보다 우선", () => {
    expect(deriveDept("세종속편한내과의원", ["산부인과", "소아청소년과", "정형외과", "내과"])).toBe("내과");
  });
  it("이름에 과목이 없고 태그가 하나면 그 과목", () => {
    expect(deriveDept("미리의원", ["피부과"])).toBe("피부과");
  });
  it("이름에 과목이 없고 여러 과를 보면 미분류 — 임의로 고르지 않는다", () => {
    expect(deriveDept("도봉제일의원", ["내과", "정형외과", "피부과"])).toBeNull();
    expect(deriveDept("서울노보스병원", [])).toBeNull();
  });
});
