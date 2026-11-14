import assert from "node:assert/strict";

const description = (html) =>
  html.match(/og:description" content="([^"]*)"/)[1].replace(/&amp;/g, "&");
const title = (html) => html.match(/og:title" content="([^"]*)"/)[1];

/**
 * A fake Facebook link preview: it keeps its own copy of every page and only
 * refreshes a copy when asked to scrape it. Pages come from the built site
 * or, for the licence server's addresses, from the Worker itself.
 */
export function fakeFacebook({ base, worker = null } = {}) {
  const live = {};
  const copies = {};
  const scraped = [];
  const ids = {};
  let nextId = 1;
  const publish = (built) => {
    for (const [file, html] of Object.entries(built.files)) {
      if (!file.endsWith(".html") || file === "index.html") continue;
      live[`${base}/${file.replace(/\.html$/, "")}`] = html;
    }
  };
  async function fetchPage(url) {
    if (live[url]) return live[url];
    if (worker && url.startsWith(`${base}/l/`)) {
      const response = await worker(url);
      return response.ok ? response.text() : null;
    }
    return null;
  }
  const reply = (json) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(json),
  });
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const pageUrl = parsed.searchParams.get("id");
    if (pageUrl) {
      if (parsed.searchParams.get("scrape") === "true") {
        assert.equal(init.method, "POST");
        scraped.push(pageUrl);
        const html = await fetchPage(pageUrl);
        if (html) {
          copies[pageUrl] = html;
          ids[pageUrl] ||= String(nextId++);
        }
      }
      return reply(
        ids[pageUrl] ? { og_object: { id: ids[pageUrl] } } : { id: pageUrl },
      );
    }
    const id = parsed.pathname.split("/").pop();
    const found = Object.keys(ids).find((key) => ids[key] === id);
    return reply({
      title: title(copies[found]),
      description: description(copies[found]),
    });
  };
  return { fetch, publish, scraped, copies, live };
}
