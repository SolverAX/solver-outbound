import { and, eq, inArray, sql } from "drizzle-orm";
import { contacts, leads } from "@solver/db";
import { HiraClient, DGSBJT_BY_NAME, DGSBJT_CODES, assignTier, estimateStaff, mapHospitalToLead, resolveSido, type HospBasisItem } from "@solver/hira";
import type { PipelineContext } from "./context";
import { backfillDept } from "./dept";

export interface ListInput {
  sido: string; // "서울" | "서울특별시" ...
  sgguCd?: string;
  sgguName?: string; // 이름으로 필터 (API sggu 코드가 없을 때)
  dept?: string; // 기본 정형외과
  clCds?: string[]; // 기본 설정값 ["21","31"]
  limit?: number;
}

export interface ListResult {
  fetched: number;
  inserted: number;
  updated: number;
  excluded: number;
  byTier: Record<string, number>;
}

/** PRD 4절: 심평원 API로 후보를 뽑고 Tier를 매겨 leads에 병합(ykiho 기준) */
export async function runList(ctx: PipelineContext, input: ListInput): Promise<ListResult> {
  const sido = resolveSido(input.sido);
  if (!sido) throw new Error(`알 수 없는 시도: ${input.sido}`);
  const dept = input.dept ?? "정형외과";
  if (dept === ALL_DEPTS) return runListAllDepts(ctx, input);
  const dgsbjtCd = DGSBJT_BY_NAME[dept];
  if (!dgsbjtCd) throw new Error(`알 수 없는 진료과: ${dept}`);
  const clCds = input.clCds ?? [...ctx.settings.tier.includeClCd];
  const hira = new HiraClient({ dryRun: ctx.dryRun });

  const started = Date.now();
  let items: HospBasisItem[] = [];
  for (const clCd of clCds) {
    const rows = await hira.listHospitals({ sidoCd: sido.code, sgguCd: input.sgguCd, clCd, dgsbjtCd }, (p, total) => ctx.log(null, `HIRA ${clCd} page ${p} / total ${total}`));
    items.push(...rows);
  }
  if (input.sgguName) items = items.filter((h) => (h.sgguCdNm ?? "").replace(/\s/g, "").includes(input.sgguName!.replace(/\s/g, "")));
  if (input.limit) items = items.slice(0, input.limit);

  const result: ListResult = { fetched: items.length, inserted: 0, updated: 0, excluded: 0, byTier: {} };

  for (const h of items) {
    const mapped = mapHospitalToLead(h);
    // 전문의 수 우선 (PRD: 전문과목별 전문의 수가 있으면 우선)
    let doctorCnt = mapped.doctorCnt;
    let deptTags = [dept];
    let detailOk = false;
    try {
      const depts = await hira.getDepartments(h.ykiho);
      const own = depts.find((d) => d.dgsbjtCd === dgsbjtCd);
      if (own?.dgsbjtPrSdrCnt) doctorCnt = own.dgsbjtPrSdrCnt;
      deptTags = depts.map((d) => d.dgsbjtCdNm).filter((n): n is string => !!n);
      if (!deptTags.includes(dept)) deptTags.unshift(dept);
      detailOk = true;
    } catch (e) {
      ctx.log(null, `상세정보 조회 실패 ${h.ykiho}: ${(e as Error).message}`);
    }
    const staffEst = estimateStaff(doctorCnt);
    const tier = assignTier({ clCd: mapped.clCd, sggu: mapped.sggu, estDate: mapped.estDate, doctorCnt, staffEst, hasHomepage: !!mapped.homepage }, ctx.settings.tier);
    result.byTier[tier.tier] = (result.byTier[tier.tier] ?? 0) + 1;
    if (tier.tier === "EXCLUDED") result.excluded += 1;

    const { phone, ...leadValues } = mapped;
    const [row] = await ctx.db
      .insert(leads)
      .values({ ...leadValues, doctorCnt, staffEst, deptTags, tier: tier.tier, excludedReason: tier.tier === "EXCLUDED" ? tier.reason : null })
      .onConflictDoUpdate({
        target: leads.ykiho,
        set: {
          name: leadValues.name,
          address: leadValues.address,
          homepage: sql`coalesce(${leads.homepage}, ${leadValues.homepage})`,
          // 상세 조회가 실패한 재실행에서 기존 전문의 수·진료과·Tier를 추정값으로 덮어쓰지 않는다
          ...(detailOk
            ? { doctorCnt, staffEst, deptTags, tier: sql`case when ${leads.tier} = 'EXCLUDED' then 'EXCLUDED'::tier else ${tier.tier}::tier end` }
            : { deptTags: sql`case when ${dept} = any(${leads.deptTags}) then ${leads.deptTags} else array_append(${leads.deptTags}, ${dept}) end` }),
          hiraRaw: leadValues.hiraRaw,
        },
      })
      .returning({ id: leads.id, createdAt: leads.createdAt, updatedAt: leads.updatedAt });
    if (!row) continue;
    if (row.createdAt.getTime() === row.updatedAt.getTime()) result.inserted += 1;
    else result.updated += 1;

    if (phone) {
      await ctx.db
        .insert(contacts)
        .values({ leadId: row.id, type: "phone", value: phone, source: "hira", confidence: 1, isPrimary: true })
        .onConflictDoNothing();
    }
  }
  await backfillDept(ctx);
  ctx.log(null, `리스트업 완료 ${result.fetched}곳 (${((Date.now() - started) / 1000).toFixed(1)}s)`, { ...result });
  return result;
}

export const ALL_DEPTS = "전체";

/**
 * 전 진료과 리스트업. 병원별 상세 조회(1곳당 1회) 대신 목록 API만 쓴다:
 *  1) 진료과 필터 없이 전체 목록 → 신규 리드 추가 (기존 리드의 전문의 수·진료과·Tier는 건드리지 않음)
 *  2) 진료과 코드별 목록 → 해당 병원에 진료과 태그 추가
 * 의사 수는 목록의 전체 의사 수(drTotCnt)를 쓴다. 진료과 태그는 codes.ts에 있는 과목만 붙는다.
 */
export async function runListAllDepts(ctx: PipelineContext, input: ListInput): Promise<ListResult> {
  const sido = resolveSido(input.sido);
  if (!sido) throw new Error(`알 수 없는 시도: ${input.sido}`);
  const clCds = input.clCds ?? [...ctx.settings.tier.includeClCd];
  const hira = new HiraClient({ dryRun: ctx.dryRun });
  const numOfRows = 1000;
  const started = Date.now();
  const keep = (h: HospBasisItem) => !input.sgguName || (h.sgguCdNm ?? "").replace(/\s/g, "").includes(input.sgguName.replace(/\s/g, ""));

  let items: HospBasisItem[] = [];
  for (const clCd of clCds) {
    const rows = await hira.listHospitals({ sidoCd: sido.code, sgguCd: input.sgguCd, clCd, numOfRows }, (p, total) => ctx.log(null, `HIRA ${sido.name} ${clCd} 전체 page ${p} / total ${total}`));
    items.push(...rows.filter(keep));
  }
  if (input.limit) items = items.slice(0, input.limit);
  const wanted = new Set(items.map((h) => h.ykiho));

  const result: ListResult = { fetched: items.length, inserted: 0, updated: 0, excluded: 0, byTier: {} };
  for (const h of items) {
    const { phone, ...leadValues } = mapHospitalToLead(h);
    const staffEst = estimateStaff(leadValues.doctorCnt);
    const tier = assignTier({ clCd: leadValues.clCd, sggu: leadValues.sggu, estDate: leadValues.estDate, doctorCnt: leadValues.doctorCnt, staffEst, hasHomepage: !!leadValues.homepage }, ctx.settings.tier);
    const [row] = await ctx.db
      .insert(leads)
      .values({ ...leadValues, staffEst, deptTags: [], tier: tier.tier, excludedReason: tier.tier === "EXCLUDED" ? tier.reason : null })
      .onConflictDoUpdate({
        target: leads.ykiho,
        set: { name: leadValues.name, address: leadValues.address, homepage: sql`coalesce(${leads.homepage}, ${leadValues.homepage})`, hiraRaw: leadValues.hiraRaw },
      })
      .returning({ id: leads.id, createdAt: leads.createdAt, updatedAt: leads.updatedAt });
    if (!row) continue;
    if (row.createdAt.getTime() === row.updatedAt.getTime()) {
      result.inserted += 1;
      result.byTier[tier.tier] = (result.byTier[tier.tier] ?? 0) + 1;
      if (tier.tier === "EXCLUDED") result.excluded += 1;
    } else result.updated += 1;
    if (phone) await ctx.db.insert(contacts).values({ leadId: row.id, type: "phone", value: phone, source: "hira", confidence: 1, isPrimary: true }).onConflictDoNothing();
  }

  for (const [dgsbjtCd, deptName] of Object.entries(DGSBJT_CODES)) {
    const ykihos: string[] = [];
    for (const clCd of clCds) {
      const rows = await hira.listHospitals({ sidoCd: sido.code, sgguCd: input.sgguCd, clCd, dgsbjtCd, numOfRows });
      ykihos.push(...rows.map((h) => h.ykiho).filter((y) => wanted.has(y)));
    }
    for (let i = 0; i < ykihos.length; i += 500) {
      const chunk = ykihos.slice(i, i + 500);
      await ctx.db
        .update(leads)
        .set({ deptTags: sql`array_append(${leads.deptTags}, ${deptName})` })
        .where(and(inArray(leads.ykiho, chunk), sql`not (${deptName} = any(${leads.deptTags}))`));
    }
    ctx.log(null, `HIRA ${sido.name} ${deptName} ${ykihos.length}곳 태그`);
  }
  await backfillDept(ctx);
  ctx.log(null, `전 진료과 리스트업 완료 ${sido.name} ${result.fetched}곳 (${((Date.now() - started) / 1000).toFixed(1)}s)`, { ...result });
  return result;
}

/** CSV 가져오기: ykiho 기준 병합 (구글시트 → DB). 컬럼: ykiho,name,referral_possible,referrer,owner,place_rank,review_cnt,email,homepage */
export async function importCsvRows(ctx: PipelineContext, rows: Record<string, string>[]): Promise<{ merged: number; skipped: number }> {
  let merged = 0,
    skipped = 0;
  for (const r of rows) {
    const ykiho = r.ykiho?.trim();
    if (!ykiho) {
      skipped++;
      continue;
    }
    const [lead] = await ctx.db.select({ id: leads.id }).from(leads).where(eq(leads.ykiho, ykiho)).limit(1);
    if (!lead) {
      skipped++;
      continue;
    }
    const set: Partial<typeof leads.$inferInsert> = {};
    if (r.referral_possible) set.referralPossible = /^(y|yes|true|1|o|가능)$/i.test(r.referral_possible.trim());
    if (r.referrer) set.referrer = r.referrer.trim();
    if (r.owner) set.owner = r.owner.trim();
    if (r.place_rank) set.placeRank = Number(r.place_rank) || null;
    if (r.review_cnt) set.reviewCnt = Number(r.review_cnt) || null;
    if (r.homepage) set.homepage = r.homepage.trim();
    if (r.tier_override && ["T1", "T2", "T3"].includes(r.tier_override.trim())) set.tierOverride = r.tier_override.trim() as "T1" | "T2" | "T3";
    if (Object.keys(set).length) await ctx.db.update(leads).set(set).where(eq(leads.id, lead.id));
    if (r.email?.trim()) {
      await ctx.db
        .insert(contacts)
        .values({ leadId: lead.id, type: "email", value: r.email.trim().toLowerCase(), source: "manual", confidence: 1, role: "general", verifiedAt: new Date() })
        .onConflictDoNothing();
    }
    merged++;
  }
  return { merged, skipped };
}
