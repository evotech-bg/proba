/**
 * One-time backfill: group the flat closr-web test cases into module suites.
 * Suite name = the title prefix before the em-dash, with a few normalizations.
 * Idempotent: re-running reuses existing suites and skips existing memberships.
 *
 * Run with Node 22: ~/.nvm/versions/node/v22.17.0/bin/node + tsx
 */
import { eq } from "drizzle-orm";
import { openStore, suiteCases, suites, testCases } from "@proba/store";

const APP = "closr-web";
const DB = process.env.PROBA_DB ?? "packages/mcp/.proba/proba.db";

function deriveSuite(title: string): string {
  // split on em-dash (—) or " - "
  let head = title.split("—")[0]?.trim() ?? title;
  if (head === title) head = title.split(" - ")[0]?.trim() ?? title;
  // normalizations: collapse the render-smoke + untouched batches
  if (/^LIGHT upgrade batch/i.test(head)) return "Render smoke";
  if (/^Untouched routes/i.test(head)) return "Render smoke";
  if (/^Settings AI-usage/i.test(head)) return "Settings";
  if (/^Social Listening/i.test(head)) return "Social";
  if (/^Sales Room/i.test(head)) return "Sales Rooms";
  if (/^Invoice detail/i.test(head)) return "Invoices";
  if (/^DBG/i.test(head)) return "Scratch";
  // cap length / fallback
  if (!head || head.length > 40) return head.slice(0, 40) || "Misc";
  return head;
}

function main() {
  const db = openStore(DB);
  const cases = db.select().from(testCases).where(eq(testCases.appKey, APP)).all();
  console.log(`closr-web cases: ${cases.length}`);

  const suiteByName = new Map<string, string>();
  for (const s of db.select().from(suites).where(eq(suites.appKey, APP)).all()) {
    suiteByName.set(s.name, s.id);
  }

  const counts: Record<string, number> = {};
  let assigned = 0;
  let skipped = 0;

  for (const tc of cases) {
    const name = deriveSuite(tc.title);
    let suiteId = suiteByName.get(name);
    if (!suiteId) {
      const [s] = db
        .insert(suites)
        .values({ appKey: APP, name, kind: "regression" })
        .returning()
        .all();
      suiteId = s!.id;
      suiteByName.set(name, suiteId);
    }
    db.update(testCases).set({ suiteId }).where(eq(testCases.id, tc.id)).run();
    const exists = db
      .select()
      .from(suiteCases)
      .where(eq(suiteCases.caseId, tc.id))
      .all()
      .some((m) => m.suiteId === suiteId);
    if (exists) {
      skipped++;
    } else {
      const ordinal = db.select().from(suiteCases).where(eq(suiteCases.suiteId, suiteId)).all().length;
      db.insert(suiteCases).values({ suiteId, caseId: tc.id, ordinal }).run();
      assigned++;
    }
    counts[name] = (counts[name] ?? 0) + 1;
  }

  console.log(`\nassigned ${assigned} new memberships, ${skipped} already present`);
  console.log(`\nsuites (${Object.keys(counts).length}):`);
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${name}`);
  }
}

main();
