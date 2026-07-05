// Cloudflare Worker: veilige proxy tussen de PWA en de Anthropic-API.
// De API-key leeft hier als secret (ANTHROPIC_API_KEY) en komt nooit in de
// frontend terecht. Contract met de app: POST {image: <base64 jpeg>} →
// {naam, groep, weetjes} — exact zoals identifyAnimal in de artifact werkte.

const GROUPS = ["zoogdier", "vogel", "reptiel", "amfibie", "vis", "insect", "spin", "weekdier", "anders"];

const PROMPT = `Je bent een enthousiaste bioloog die kinderen helpt, in de stijl van Freek Vonk. Kijk goed naar de foto. Welk dier is dit?
Antwoord ALLEEN met geldige JSON, zonder uitleg en zonder codeblokken:
{"naam":"Nederlandse naam van het dier, kleine letters","groep":"zoogdier|vogel|reptiel|amfibie|vis|insect|spin|weekdier|anders","weetjes":["weetje 1","weetje 2","weetje 3"]}
Regels: schrijf de weetjes in het Nederlands, kort en enthousiast, maximaal 1 zin per weetje, geschikt voor een kind van 8 tot 12 jaar. Eén emoji per weetje mag. Twijfel je? Geef dan je beste gok. Staat er geen dier op de foto, gebruik dan naam "", groep "anders" en weetjes ["Ik zie hier geen dier — maak een foto van het beestje zelf! 🔍"].`;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "Alleen POST" }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Ongeldige JSON" }, 400, cors);
    }

    const image = body && body.image;
    if (!image || typeof image !== "string") {
      return json({ error: "Veld 'image' (base64) ontbreekt" }, 400, cors);
    }
    // De app comprimeert tot ~400 KB; alles ver daarboven is verdacht.
    if (image.length > 1_500_000) {
      return json({ error: "Afbeelding te groot" }, 413, cors);
    }

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
                { type: "text", text: PROMPT },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        console.error("Anthropic-API fout:", res.status, detail);
        return json({ error: "Herkenning tijdelijk niet beschikbaar" }, 502, cors);
      }

      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      return json(
        {
          naam: (parsed.naam || "").toString().toLowerCase().trim(),
          groep: GROUPS.includes(parsed.groep) ? parsed.groep : "anders",
          weetjes: Array.isArray(parsed.weetjes) ? parsed.weetjes.slice(0, 4) : [],
        },
        200,
        cors
      );
    } catch (e) {
      console.error("Worker-fout:", e);
      return json({ error: "Herkenning mislukt" }, 502, cors);
    }
  },
};
