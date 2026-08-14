import assert from "node:assert/strict";

const base = new URL(process.env.PUBLIC_URL ?? "https://subtext.media");
const articlePath = process.env.TEST_ARTICLE_PATH;
const oldPath = process.env.TEST_OLD_ARTICLE_PATH;
const searchQuery = process.env.TEST_SEARCH_QUERY ?? "subtext validation";
const expectAbsent = process.argv.includes("--expect-absent");

if (!articlePath?.startsWith("/") || !oldPath?.startsWith("/")) {
  console.error(
    "Set non-secret TEST_ARTICLE_PATH and TEST_OLD_ARTICLE_PATH before running production validation.",
  );
  process.exit(2);
}

const results = [];
async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...options,
  });
  const body = await response.text();
  results.push({
    path,
    status: response.status,
    milliseconds: Math.round(performance.now() - started),
  });
  return { response, body };
}
function contains(body, value, label) {
  assert.ok(body.includes(value), label);
}
function excludes(body, value, label) {
  assert.equal(body.includes(value), false, label);
}

const home = await request("/");
assert.equal(home.response.status, 200);
contains(home.body, "Subtext Media", "Homepage brand missing");
contains(home.body, "Everything has", "Homepage editorial masthead missing");
contains(home.body, 'href="/history"', "Primary navigation missing");

for (const pillar of ["history", "business", "psychology", "society"]) {
  const page = await request(`/${pillar}`);
  assert.equal(page.response.status, 200, `${pillar} page failed`);
}
const unknown = await request(`/definitely-not-a-subtext-route-${Date.now()}`);
assert.equal(unknown.response.status, 404);

const article = await request(articlePath);
const old = await request(oldPath);
const search = await request(`/search?q=${encodeURIComponent(searchQuery)}`);
const sitemap = await request("/sitemap.xml");
const rss = await request("/feed.xml");
const robots = await request("/robots.txt");
assert.equal(search.response.status, 200);
assert.equal(sitemap.response.status, 200);
assert.equal(rss.response.status, 200);
assert.equal(robots.response.status, 200);
contains(robots.body, "Sitemap:", "Robots sitemap declaration missing");

if (expectAbsent) {
  assert.equal(article.response.status, 404, "Unpublished article remains accessible");
  excludes(search.body, articlePath, "Unpublished article remains in search");
  excludes(sitemap.body, articlePath, "Unpublished article remains in sitemap");
  excludes(rss.body, articlePath, "Unpublished article remains in RSS");
} else {
  assert.equal(article.response.status, 200, "Canonical article is not public");
  assert.equal(old.response.status, 301, "Old slug is not a 301 redirect");
  assert.equal(new URL(old.response.headers.get("location"), base).pathname, articlePath);
  contains(
    article.body,
    `rel="canonical" href="${new URL(articlePath, base).toString()}"`,
    "Canonical metadata mismatch",
  );
  for (const marker of [
    "og:title",
    "og:description",
    "twitter:card",
    '"@type":"Article"',
    '"@type":"BreadcrumbList"',
  ])
    contains(article.body, marker, `SEO marker missing: ${marker}`);
  contains(search.body, articlePath, "Article missing from search");
  contains(sitemap.body, articlePath, "Article missing from sitemap");
  contains(rss.body, articlePath, "Article missing from RSS");
}

const mobile = await request(articlePath, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  },
});
assert.equal(mobile.response.status, expectAbsent ? 404 : 200);
if (!expectAbsent) contains(mobile.body, 'name="viewport"', "Responsive viewport metadata missing");

console.table(results);
const slow = results.filter((result) => result.milliseconds > 4000);
if (slow.length)
  console.warn(
    `Performance warning: ${slow.map((item) => item.path).join(", ")} exceeded 4 seconds.`,
  );
console.log(
  `Production black-box validation passed (${expectAbsent ? "unpublished" : "published"} mode).`,
);
