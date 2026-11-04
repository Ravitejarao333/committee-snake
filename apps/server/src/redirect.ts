/** The site's Worker name; the old host's first label is swapped for it. */
const SITE = "cheap-thrills";

/** Where a request to the old host goes: the same path and query on the site's host. */
export function movedTo(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname.replace(/^[^.]+/, SITE);
  u.protocol = "https:";
  u.port = "";
  return u.href;
}

/** The old committee-snake Worker (wrangler.redirect.jsonc): a permanent redirect, nothing else. */
export default {
  fetch(request: Request): Response {
    return Response.redirect(movedTo(request.url), 301);
  },
} satisfies ExportedHandler;
