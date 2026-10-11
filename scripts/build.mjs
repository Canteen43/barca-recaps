// Builds the static site into dist/: the app shell plus data/videos.json.
// --fixture  use test/fixtures/videos.json instead of data/videos.json (for e2e tests)
import { cp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const fixture = process.argv.includes("--fixture");
const out = "dist";

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "data"), { recursive: true });
await cp("app", out, { recursive: true });

const dataSrc = fixture ? "test/fixtures/videos.json" : "data/videos.json";
const data = existsSync(dataSrc)
  ? await readFile(dataSrc, "utf8")
  : JSON.stringify({ version: 1, videos: [] });
await writeFile(join(out, "data", "videos.json"), data);

// Version the service worker cache by the app shell's content so updates roll out.
const hash = createHash("sha256");
async function hashDir(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await hashDir(p);
    else hash.update(p).update(await readFile(p));
  }
}
await hashDir("app");
const version = hash.digest("hex").slice(0, 10);
const swPath = join(out, "sw.js");
await writeFile(swPath, (await readFile(swPath, "utf8")).replace("__VERSION__", version));
await writeFile(join(out, ".nojekyll"), "");

console.log(`Built ${out}/ (shell ${version}, data from ${dataSrc})`);
