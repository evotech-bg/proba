import type { TestCase, Step } from "./mock/types";

const escapeStr = (s: string) => s.replace(/"/g, '\\"');

function locatorToPlaywright(s: Step): string {
  const t = s.target;
  if (!t) return "page";
  switch (t.strategy) {
    case "role":
      return `page.getByRole("${t.value}"${t.name ? `, { name: "${escapeStr(t.name)}" }` : ""})`;
    case "text": return `page.getByText("${escapeStr(t.value)}")`;
    case "label": return `page.getByLabel("${escapeStr(t.value)}")`;
    case "placeholder": return `page.getByPlaceholder("${escapeStr(t.value)}")`;
    case "testId": return `page.getByTestId("${escapeStr(t.value)}")`;
    case "css": return `page.locator("${escapeStr(t.value)}")`;
  }
}

function stepGherkin(s: Step, i: number): string {
  const prefix = s.description?.match(/^(Given|When|Then|And|But)\b/)
    ? s.description
    : `${i === 0 ? "Given" : i === 1 ? "When" : "Then"} ${s.description || `${s.action} ${s.target?.value ?? ""}`}`;
  return `  ${prefix.trim()}`;
}

function stepPlaywright(s: Step): string[] {
  const out: string[] = [];
  const loc = locatorToPlaywright(s);
  switch (s.action) {
    case "navigate":
      out.push(`  await page.goto("${escapeStr(s.params?.url ?? "/")}");`); break;
    case "fill":
      out.push(`  await ${loc}.fill("${escapeStr(s.params?.value ?? "")}");`); break;
    case "click":
      out.push(`  await ${loc}.click();`); break;
    case "expect.visible":
      out.push(`  await expect(${loc}).toBeVisible();`); break;
    case "expect.text":
      out.push(`  await expect(${loc}).toContainText("");`); break;
    case "expect.response":
      out.push(`  const res = await page.waitForResponse("${escapeStr(s.params?.path ?? "")}");`); break;
    case "expect.calls":
      out.push(`  // assert request rate on ${s.params?.path}`); break;
    case "query":
      out.push(`  const rows = await db.query(\`${s.params?.sql ?? ""}\`);`); break;
    default:
      out.push(`  // ${s.action}`);
  }
  for (const a of s.assertions) out.push(`  // assert(${a.type}): ${a.spec}`);
  return out;
}

export function toGherkin(tc: TestCase): string {
  const tag = `@${tc.technique} @${tc.polarity}`;
  const lines = [
    `# Auto-generated from canonical step list. Edits here update JSON + Playwright.`,
    `Feature: ${tc.title}`,
    tc.intent ? `  ${tc.intent}` : "",
    "",
    `  ${tag}`,
    `  Scenario: ${tc.title}`,
    ...tc.steps.map(stepGherkin),
  ].filter(Boolean);
  return lines.join("\n");
}

export function toCanonical(tc: TestCase): string {
  return JSON.stringify(
    {
      id: tc.id, title: tc.title, polarity: tc.polarity, technique: tc.technique,
      lifecycle: tc.lifecycle, tags: tc.tags,
      steps: tc.steps.map((s) => ({
        ordinal: s.ordinal, kind: s.kind, action: s.action,
        description: s.description, target: s.target, params: s.params,
        assertions: s.assertions.map((a) => ({ type: a.type, spec: a.spec })),
      })),
    },
    null, 2
  );
}

export function toPlaywright(tc: TestCase): string {
  const lines = [
    `import { test, expect } from "@playwright/test";`,
    ``,
    `// ${tc.technique.toUpperCase()} · ${tc.polarity}`,
    `test("${escapeStr(tc.title)}", async ({ page }) => {`,
    ...tc.steps.flatMap(stepPlaywright),
    `});`,
    ``,
  ];
  return lines.join("\n");
}
