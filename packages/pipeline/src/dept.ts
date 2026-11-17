import { inArray, isNull, sql } from "drizzle-orm";
import { leads } from "@solver/db";
import { deriveDept } from "@solver/hira";
import type { PipelineContext } from "./context";

/**
 * 대표 진료과(leads.dept) 채우기. 기본은 비어 있는 리드만 — 사람이 정한 값은 건드리지 않는다.
 * force면 전부 다시 계산한다(분류 규칙을 바꿨을 때).
 */
export async function backfillDept(ctx: PipelineContext, opts: { force?: boolean } = {}): Promise<{ scanned: number; assigned: number; unclassified: number; byDept: Record<string, number> }> {
  const rows = await ctx.db
    .select({ id: leads.id, name: leads.name, deptTags: leads.deptTags, dept: leads.dept })
    .from(leads)
    .where(opts.force ? sql`true` : isNull(leads.dept));
  const groups = new Map<string, string[]>();
  const cleared: string[] = [];
  let unclassified = 0;
  for (const r of rows) {
    const dept = deriveDept(r.name, r.deptTags);
    if (!dept) {
      unclassified += 1;
      if (r.dept) cleared.push(r.id);
      continue;
    }
    if (dept === r.dept) continue;
    groups.set(dept, [...(groups.get(dept) ?? []), r.id]);
  }
  const byDept: Record<string, number> = {};
  let assigned = 0;
  for (const [dept, ids] of groups) {
    byDept[dept] = ids.length;
    assigned += ids.length;
    for (let i = 0; i < ids.length; i += 1000) await ctx.db.update(leads).set({ dept }).where(inArray(leads.id, ids.slice(i, i + 1000)));
  }
  for (let i = 0; i < cleared.length; i += 1000) await ctx.db.update(leads).set({ dept: null }).where(inArray(leads.id, cleared.slice(i, i + 1000)));
  ctx.log(null, `대표 진료과 분류: ${rows.length}곳 확인 · ${assigned}곳 지정 · ${unclassified}곳 미분류`);
  return { scanned: rows.length, assigned, unclassified, byDept };
}
