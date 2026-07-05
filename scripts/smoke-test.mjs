// Rooktest voor de drie-lagen-familiecode (URL → IndexedDB → localStorage).
// Draait tegen de preview-server (npm run preview) met de lokale Edge.
// Gebruik: node scripts/smoke-test.mjs
import puppeteer from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4173/dierenlogboek/";
const CODE = "testfamilie";

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}

async function waitForText(page, text, timeout = 15000) {
  try {
    await page.waitForFunction(
      (t) => document.body && document.body.innerText.includes(t),
      { timeout },
      text
    );
    return true;
  } catch {
    return false;
  }
}

async function readLayers(page) {
  return page.evaluate(async () => {
    const ls = (() => {
      try {
        return localStorage.getItem("dierenlogboek:familiecode") || "";
      } catch {
        return "";
      }
    })();
    const idb = await new Promise((resolve) => {
      try {
        const req = indexedDB.open("dierenlogboek-kv", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => {
          try {
            const get = req.result
              .transaction("kv", "readonly")
              .objectStore("kv")
              .get("dierenlogboek:familiecode");
            get.onsuccess = () => resolve(get.result || "");
            get.onerror = () => resolve("");
          } catch {
            resolve("");
          }
        };
        req.onerror = () => resolve("");
      } catch {
        resolve("");
      }
    });
    return { ls, idb, url: new URL(location.href).searchParams.get("fam") || "" };
  });
}

const profile = mkdtempSync(join(tmpdir(), "dierenlogboek-smoke-"));
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  userDataDir: profile,
  args: ["--no-first-run", "--disable-gpu"],
});

try {
  const page = await browser.newPage();

  // Scenario 1: verse browser, geen code → codescherm, geen hoofd-UI
  await page.goto(BASE, { waitUntil: "networkidle2" });
  check("S1: codescherm verschijnt zonder code", await waitForText(page, "Vul de familiecode in"));
  check("S1: hoofd-UI (Nieuw beest) afwezig", !(await page.evaluate(() => document.body.innerText.includes("Nieuw beest"))));

  // Scenario 2: code via URL-parameter → hoofd-UI + lagen geheeld
  await page.goto(`${BASE}?fam=${CODE}`, { waitUntil: "networkidle2" });
  check("S2: hoofd-UI verschijnt met ?fam= in URL", await waitForText(page, "Nieuw beest"));
  const s2 = await readLayers(page);
  check(`S2: localStorage geheeld (${s2.ls})`, s2.ls === CODE);
  check(`S2: IndexedDB geheeld (${s2.idb})`, s2.idb === CODE);
  check(`S2: URL-parameter aanwezig (${s2.url})`, s2.url === CODE);
  check("S2: instellingen-knop aanwezig", (await page.$('[aria-label="Instellingen"]')) !== null);

  // Scenario 3: zelfde profiel, URL zónder parameter → lokale lagen leveren
  // de code en de URL wordt terug-geheeld (replaceState)
  await page.goto(BASE, { waitUntil: "networkidle2" });
  check("S3: hoofd-UI zonder URL-parameter (lokale lagen)", await waitForText(page, "Nieuw beest"));
  const s3 = await readLayers(page);
  check(`S3: URL terug-geheeld naar ?fam= (${s3.url})`, s3.url === CODE);

  // Scenario 4: iOS-wipe gesimuleerd — localStorage en IndexedDB leeg, alleen
  // de URL (beginscherm-snelkoppeling) heeft de code nog
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("dierenlogboek-kv");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });
  await page.goto(`${BASE}?fam=${CODE}`, { waitUntil: "networkidle2" });
  check("S4: hoofd-UI na gesimuleerde iOS-wipe via URL-laag", await waitForText(page, "Nieuw beest"));
  const s4 = await readLayers(page);
  check(`S4: localStorage opnieuw geheeld (${s4.ls})`, s4.ls === CODE);
  check(`S4: IndexedDB opnieuw geheeld (${s4.idb})`, s4.idb === CODE);

  // Scenario 5: code wijzigen via instellingen → URL-parameter volgt
  await page.click('[aria-label="Instellingen"]');
  await page.waitForSelector("input", { timeout: 10000 });
  const inputHandle = await page.evaluateHandle(() => {
    const inputs = [...document.querySelectorAll("input")];
    return inputs.find((i) => i.value === "testfamilie");
  });
  const inputEl = inputHandle.asElement();
  await inputEl.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await inputEl.type("nieuwe-code");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Opslaan");
    btn.click();
  });
  const changed = await page.waitForFunction(
    () => new URL(location.href).searchParams.get("fam") === "nieuwe-code",
    { timeout: 10000 }
  ).then(() => true).catch(() => false);
  check("S5: code wijzigen via instellingen werkt de URL bij", changed);
} finally {
  await browser.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}

console.log(failures === 0 ? "\nAlle scenario's geslaagd." : `\n${failures} check(s) gefaald.`);
process.exit(failures === 0 ? 0 : 1);
