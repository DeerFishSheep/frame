import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppliedFilters } from "../components/applied-filters";
import { DEFAULT_FILTERS, type CatalogFilters } from "../lib/types";
import { parseFilters } from "../lib/query";
import { serializeFilters } from "../lib/ui";

const filters: CatalogFilters = { ...DEFAULT_FILTERS, chart: "discover", media: "movie", genres: ["28", "35"],
  dateFrom: "2020-01-01", dateTo: "2024-12-31", scoreMin: "6", scoreMax: "9", votesMin: "100",
  region: "US", language: "en", runtimeMin: "80", runtimeMax: "180", sort: "vote_count.desc", page: 4 };
type Button = { "aria-label"?: string; onClick: () => void; children?: ReactNode };
function render(value: CatalogFilters, onChange: (next: CatalogFilters) => void, onClear = () => {}) {
  return AppliedFilters({ filters: value, today: "2026-10-12", onChange, onClear });
}
function buttons(element: ReturnType<typeof render>) {
  return Children.toArray(element?.props.children).filter(isValidElement<Button>);
}

test("each chip removes only its own condition and returns pagination to page one", () => {
  const cases: [string, Partial<CatalogFilters>][] = [
    ["移除类型筛选：动作", { genres: ["35"] }],
    ["移除日期筛选，恢复默认日期范围", { dateFrom: "", dateTo: "" }],
    ["移除评分范围筛选", { scoreMin: "", scoreMax: "" }],
    ["移除评分数量筛选", { votesMin: "" }],
    ["移除地区筛选：美国", { region: "" }],
    ["移除语言筛选", { language: "" }],
    ["移除时长筛选", { runtimeMin: "", runtimeMax: "" }],
    ["移除排序条件，恢复热度优先", { sort: "popularity.desc" }],
  ];
  for (const [action, reset] of cases) {
    let changed: CatalogFilters | undefined;
    const chip = buttons(render(filters, next => { changed = next; })).find(button => button.props["aria-label"] === action);
    assert.ok(chip, action);
    chip.props.onClick();
    assert.deepEqual(changed, { ...filters, ...reset, page: 1 }, action);
    const restored = parseFilters(serializeFilters(changed!));
    assert.deepEqual(restored, { ...changed, dateTo: changed!.dateTo || "today" }, `${action}: URL restore`);
  }
  assert.equal(filters.page, 4);
  assert.equal(filters.region, "US");
});

test("all visible conditions render buttons with close icons; defaults do not leave ineffective chips", () => {
  const element = render(filters, () => {});
  const markup = renderToStaticMarkup(element);
  assert.equal((markup.match(/<button/g) || []).length, 10);
  assert.equal((markup.match(/<svg/g) || []).length, 10);
  assert.equal(buttons(element).every(button => typeof button.props.onClick === "function"), true);
  assert.equal(render({ ...DEFAULT_FILTERS, chart: "discover", dateTo: "today" }, () => {}), null);
  let changed: CatalogFilters | undefined;
  const sorted = render({ ...DEFAULT_FILTERS, chart: "discover", dateTo: "today", sort: "vote_count.desc" }, next => { changed = next; });
  buttons(sorted)[0].props.onClick();
  assert.equal(render(changed!, () => {}), null);
});

test("removing a saved-collection search retains the other local filters and clear-all remains separate", () => {
  let changed: CatalogFilters | undefined;
  let cleared = 0;
  const favorite = { ...filters, chart: "favorites" as const, query: "测试片名" };
  const chips = buttons(render(favorite, next => { changed = next; }, () => { cleared++; }));
  chips.find(chip => chip.props["aria-label"] === "移除搜索条件")!.props.onClick();
  assert.deepEqual(changed, { ...favorite, query: "", page: 1 });
  assert.equal(cleared, 0);
  chips.at(-1)!.props.onClick();
  assert.equal(cleared, 1);
});
