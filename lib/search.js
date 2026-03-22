export async function searchWeb(query) {
  // Strategy: Try Google Custom Search first (if configured), fall back to DuckDuckGo
  const googleResults = await searchGoogle(query);
  if (googleResults.length > 0) return googleResults;

  // Fallback: DuckDuckGo HTML scrape — free, no API key, no billing
  return searchDuckDuckGo(query);
}

// ── DuckDuckGo HTML Scrape (FREE, no key needed) ───────
async function searchDuckDuckGo(query) {
  const engineeringQuery = `${query} software architecture best practices`;

  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(engineeringQuery)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ArchitectAI/1.0)',
        },
      }
    );

    if (!res.ok) {
      console.error('DuckDuckGo search error:', res.status);
      return [];
    }

    const html = await res.text();

    // Parse results from DuckDuckGo HTML response
    const results = [];
    const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;

    while ((match = resultRegex.exec(html)) !== null && results.length < 6) {
      const rawUrl = match[1];
      const title = match[2].replace(/<\/?[^>]+(>|$)/g, '').trim();
      const snippet = match[3].replace(/<\/?[^>]+(>|$)/g, '').trim();

      // DuckDuckGo wraps URLs in a redirect — extract the real URL
      let link = rawUrl;
      try {
        const urlObj = new URL(rawUrl, 'https://duckduckgo.com');
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) link = decodeURIComponent(uddg);
      } catch {
        // keep rawUrl
      }

      if (title && snippet && link) {
        results.push({
          title,
          link,
          snippet,
          source: extractSource(link),
        });
      }
    }

    return results;
  } catch (err) {
    console.error('DuckDuckGo search failed:', err);
    return [];
  }
}

// ── Google Custom Search (requires billing) ─────────────
async function searchGoogle(query) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) return [];

  const engineeringQuery = `${query} software architecture design pattern site:stackoverflow.com OR site:medium.com OR site:dev.to OR site:martinfowler.com OR site:reddit.com/r/programming OR site:reddit.com/r/softwarearchitecture OR site:blog.pragmaticengineer.com`;

  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(engineeringQuery)}&num=6`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      console.error('Google Search API error:', res.status, '— falling back to DuckDuckGo');
      return [];
    }

    const data = await res.json();
    return (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      source: extractSource(item.link),
    }));
  } catch (err) {
    console.error('Google search failed:', err);
    return [];
  }
}

function extractSource(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const sourceMap = {
      'stackoverflow.com': 'Stack Overflow',
      'medium.com': 'Medium',
      'dev.to': 'DEV Community',
      'martinfowler.com': 'Martin Fowler',
      'reddit.com': 'Reddit',
      'blog.pragmaticengineer.com': 'The Pragmatic Engineer',
      'github.com': 'GitHub',
      'infoq.com': 'InfoQ',
      'dzone.com': 'DZone',
      'baeldung.com': 'Baeldung',
      'aws.amazon.com': 'AWS Blog',
      'cloud.google.com': 'Google Cloud Blog',
      'learn.microsoft.com': 'Microsoft Learn',
      'thoughtworks.com': 'ThoughtWorks',
    };
    return sourceMap[hostname] || hostname;
  } catch {
    return 'Web';
  }
}

export function formatSearchResultsForPrompt(results) {
  if (!results || results.length === 0) return '';

  // Limit to top 4 results, keep snippets short — saves ~300 tokens
  const top = results.slice(0, 4);

  const formatted = top
    .map(
      (r, i) =>
        `[${i + 1}] ${r.source}: "${r.title}"\n    ${r.snippet.slice(0, 180)}\n    ${r.link}`
    )
    .join('\n\n');

  return `\n---\n\n## WHAT THE COMMUNITY SAYS\n${formatted}\n`;
}
