ALTER TABLE "leads" ADD COLUMN "dept" text;--> statement-breakpoint
CREATE INDEX "leads_dept_idx" ON "leads" USING btree ("dept");