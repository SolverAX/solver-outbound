import { describe, it, expect } from "vitest";
import { buildQuestions, hasDeptQuestions, templatesForDept, DEPT_QUESTION_TEMPLATES } from "../src";

describe("buildQuestions", () => {
  it("substitutes 구/동 and dedupes", () => {
    const qs = buildQuestions({ sggu: "강남구", emd: "역삼동", templates: ["{구} 정형외과 추천해줘", "{동} 근처 {진료과}", "{구} 정형외과 추천해줘"] });
    expect(qs).toEqual(["강남구 정형외과 추천해줘", "역삼동 근처 정형외과"]);
  });
  it("skips {동} templates when emd is missing", () => {
    const qs = buildQuestions({ sggu: "서초구", emd: null, templates: ["{구} 도수치료", "{동} 근처 무릎"] });
    expect(qs).toEqual(["서초구 도수치료"]);
  });
  it("uses default 12 templates", () => {
    expect(buildQuestions({ sggu: "강남구", emd: "역삼동" })).toHaveLength(12);
  });
  it("정형외과 기본 질문은 그대로 (설정값)", () => {
    const qs = buildQuestions({ sggu: "강남구", emd: "역삼동", dept: "정형외과" });
    expect(qs[0]).toBe("강남구 정형외과 추천해줘");
  });
  it("다른 과는 공통 4개 + 과별 질문, 정형외과 문구가 섞이지 않는다", () => {
    for (const dept of Object.keys(DEPT_QUESTION_TEMPLATES)) {
      const qs = buildQuestions({ sggu: "해운대구", emd: "우동", dept });
      expect(qs.length).toBeGreaterThanOrEqual(8);
      expect(qs[0]).toBe(`해운대구 ${dept} 추천해줘`);
      expect(qs.join("\n")).not.toContain("정형외과");
      expect(qs.join("\n")).not.toMatch(/[{}]/);
    }
  });
  it("질문 세트가 없는 과·미분류는 진단 대상이 아니다", () => {
    expect(hasDeptQuestions("피부과")).toBe(true);
    expect(hasDeptQuestions("정형외과")).toBe(true);
    expect(hasDeptQuestions(null)).toBe(false);
    expect(hasDeptQuestions("한방내과")).toBe(false);
    expect(templatesForDept("한방내과")).toEqual([]);
  });
});
