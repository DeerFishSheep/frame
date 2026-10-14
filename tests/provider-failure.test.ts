import assert from "node:assert/strict";
import test from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderCatalogResults } from "../components/provider-catalog";
import { FrameProvider } from "../components/providers";
import type { CatalogView } from "../lib/catalog-view";
import { normalizeMedia } from "../lib/tmdb/normalize";

const empty: CatalogView = {
  results: [], page: 1, totalPages: 1, totalResults: 250, totalResultsExact: true,
  source: "douban", stale: false, retrievedAt: "2026-10-15T00:00:00Z", notice: "旧缓存说明",
  context: { title: "旧榜单", featuredLabel: "旧榜单", ranked: true, startPage: 1, feature: false },
};
const populated: CatalogView = { ...empty, results: [normalizeMedia({ id: 1, title: "保留作品", vote_average: 8 }, "movie")] };
const props = { source: "douban" as const, loading: false, layout: "grid" as const, page: 1, countLabel: "原榜", retry() {}, onReset() {} };
const render = (state: Partial<Parameters<typeof ProviderCatalogResults>[0]>) => renderToStaticMarkup(createElement(FrameProvider, {
  configured: true, children: createElement(ProviderCatalogResults, { ...props, ...state }),
}));

function retryButton(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) return node.map(retryButton).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
  if (node.type === "button" && node.props.children === "重试") return node.props.onClick;
  return retryButton(node.props.children);
}

test("failure after an empty cached response shows one failure, no empty-results claim or stale count, and retries", () => {
  const html = render({ current: empty, error: "上游请求失败" });
  assert.match(html, /暂时无法加载 豆瓣/);
  assert.equal((html.match(/role="alert"/g) || []).length, 1);
  assert.doesNotMatch(html, /当前条件没有影视作品|已保留上次内容|原榜共|旧缓存说明|重置条件/);
  let retries = 0, resets = 0;
  const action = retryButton(ProviderCatalogResults({ ...props, current: empty, error: "上游请求失败", retry: () => retries++, onReset: () => resets++ }));
  assert.ok(action);
  action();
  assert.equal(retries, 1);
  assert.equal(resets, 0);
});

test("failure with real retained items keeps their cards and exposes retry feedback", () => {
  const html = render({ current: populated, error: "上游请求失败" });
  assert.match(html, /保留作品/);
  assert.match(html, /resource-feedback--error/);
  assert.match(html, /原榜共 250 项/);
  assert.match(html, /重试/);
  assert.doesNotMatch(html, /当前条件没有影视作品|暂时无法加载/);
});

test("retrying empty data shows skeletons while updating actual cards keeps their mounted skeleton surfaces", () => {
  const blank = render({ current: empty, loading: true, error: "之前失败" });
  assert.match(blank, /skeleton-card/);
  assert.doesNotMatch(blank, /role="alert"|当前条件没有影视作品|原榜共|旧缓存说明/);
  const retained = render({ current: populated, loading: true, error: "之前失败" });
  assert.match(retained, /data-loading="true"/);
  assert.match(retained, /保留作品/);
  assert.doesNotMatch(retained, /skeleton-card|role="alert"/);
});

test("a successful empty response still shows the genuine empty state", () => {
  const html = render({ current: { ...empty, totalResults: 0, notice: undefined } });
  assert.match(html, /当前条件没有影视作品/);
  assert.match(html, /原榜共 0 项/);
  assert.match(html, /重置条件/);
  assert.doesNotMatch(html, /暂时无法加载|role="alert"/);
});
