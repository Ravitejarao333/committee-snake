/**
 * Per-page JS budgets from Vite's build manifest (ADR 0008). A page's JS is its entry chunk
 * plus every chunk it imports, statically or dynamically, transitively. A chunk shared by two
 * pages counts toward both.
 */

/** The fields of a Vite manifest entry this check reads. */
interface ManifestChunk {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
}

export type Manifest = Readonly<Record<string, ManifestChunk>>;

interface PageSize {
  /** The HTML entry, e.g. `snake.html`. */
  page: string;
  /** JS files the page loads, relative to dist. */
  files: string[];
  raw: number;
  gzip: number;
  budget: number;
}

interface Report {
  pages: PageSize[];
  errors: string[];
}

/** Every JS file reachable from manifest key `entry`, entry first; [] if `entry` is missing. */
export function pageFiles(manifest: Manifest, entry: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  const visit = (key: string): void => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    if (chunk.file.endsWith(".js")) files.push(chunk.file);
    for (const k of chunk.imports ?? []) visit(k);
    for (const k of chunk.dynamicImports ?? []) visit(k);
  };
  visit(entry);
  return files;
}

/**
 * Size every budgeted page. Errors for a page over budget, a budgeted page missing from the
 * manifest, an HTML entry with no budget, and JS in `allJs` that no page loads.
 */
export function checkPages(
  manifest: Manifest,
  budgets: Readonly<Record<string, number>>,
  allJs: readonly string[],
  size: (file: string) => { raw: number; gzip: number },
): Report {
  const pages: PageSize[] = [];
  const errors: string[] = [];
  const reached = new Set<string>();
  for (const [page, budget] of Object.entries(budgets)) {
    if (!manifest[page]) {
      errors.push(`${page}: not in the build manifest`);
      continue;
    }
    const files = pageFiles(manifest, page);
    let raw = 0;
    let gzip = 0;
    for (const f of files) {
      const s = size(f);
      raw += s.raw;
      gzip += s.gzip;
      reached.add(f);
    }
    pages.push({ page, files, raw, gzip, budget });
    if (raw > budget) errors.push(`${page}: ${raw} bytes is over its ${budget} budget`);
  }
  for (const key of Object.keys(manifest)) {
    if (key.endsWith(".html") && !(key in budgets)) errors.push(`${key}: no budget set`);
  }
  for (const f of allJs) {
    if (!reached.has(f)) errors.push(`${f}: not loaded by any budgeted page`);
  }
  return { pages, errors };
}
