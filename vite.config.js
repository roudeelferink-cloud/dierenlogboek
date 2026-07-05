import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const BASE = "/dierenlogboek/";
const OUT_DIR = "docs";

// Genereert na elke build een service worker met een unieke cache-versie en
// een volledige precache-lijst van de gebouwde bestanden. De versie in de
// cache-naam + skipWaiting/clients.claim voorkomt dat een oude versie blijft
// hangen (de stale-cache-valkuil uit de camper-app).
function generateServiceWorker() {
  return {
    name: "generate-service-worker",
    apply: "build",
    closeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(OUT_DIR, full).replace(/\\/g, "/"));
        }
      };
      walk(OUT_DIR);
      const precache = files
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
        .map((f) => BASE + f);
      // index.html ook onder het kale base-pad bereikbaar maken
      precache.push(BASE);

      const version = Date.now().toString(36);
      const template = readFileSync("scripts/sw-template.js", "utf8");
      const sw = template
        .replace("__VERSION__", version)
        .replace("__BASE__", BASE)
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));
      writeFileSync(join(OUT_DIR, "sw.js"), sw);
      console.log(`\nService worker geschreven (versie ${version}, ${precache.length} bestanden in precache)`);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), generateServiceWorker()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
  },
});
