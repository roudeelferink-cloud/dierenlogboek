// Fotoherkenning via de Cloudflare Worker (proxy naar de Anthropic-API).
// De API-key leeft uitsluitend als secret in de Worker — nooit hier.
// Herkenning is bonus: elke fout hier mag opslaan nooit blokkeren.
import { WORKER_URL } from "./config.js";

const VALID_GROUPS = [
  "zoogdier",
  "vogel",
  "reptiel",
  "amfibie",
  "vis",
  "insect",
  "spin",
  "weekdier",
  "anders",
];

/**
 * Stuurt de gecomprimeerde foto (dataURL) naar de Worker en krijgt
 * {naam, groep, weetjes} terug — zelfde contract als identifyAnimal
 * in de oorspronkelijke artifact.
 */
export async function identifyAnimal(dataUrl) {
  if (!WORKER_URL) throw new Error("Geen Worker-URL geconfigureerd");
  const base64 = dataUrl.split(",")[1];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Worker gaf status " + res.status);
    const data = await res.json();
    return {
      naam: (data.naam || "").toString().toLowerCase().trim(),
      groep: VALID_GROUPS.includes(data.groep) ? data.groep : "anders",
      weetjes: Array.isArray(data.weetjes) ? data.weetjes.slice(0, 4) : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
