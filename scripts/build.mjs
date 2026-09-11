import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);
const client = new URL("../dist/client/", import.meta.url);
const server = new URL("../dist/server/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".html")) {
    await cp(new URL(entry.name, root), new URL(entry.name, client));
  }
}

for (const directory of ["assets", "media"]) {
  await cp(new URL(directory + "/", root), new URL(directory + "/", client), { recursive: true });
}

const worker = `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};\n`;
await writeFile(join(server.pathname, "index.js"), worker);
