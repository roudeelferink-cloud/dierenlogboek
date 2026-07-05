# Deployen van Siems Dierenlogboek

De app is volledig gebouwd en lokaal getest. Alleen deze handmatige stappen
zijn nog nodig (er zijn geen credentials in de repo — alles gratis, geen
creditcard/Blaze nodig).

## 1. Firebase-project aanmaken (Spark, gratis)

1. Ga naar https://console.firebase.google.com → **Project toevoegen**
   (bijv. `siems-dierenlogboek`). Google Analytics mag uit.
2. Blijf op het **Spark-plan** (standaard, gratis). Nergens een creditcard invullen.
3. **Build → Firestore Database → Database maken** → locatie `europe-west`
   (bijv. `eur3` of `europe-west4`) → start in **productiemodus** (de regels
   uit stap 2 hieronder vervangen de standaardregels).
4. Projectinstellingen (tandwiel) → **Je apps** → **Web-app** (`</>`-icoon) →
   registreer een app (naam maakt niet uit, geen hosting nodig).
5. Kopieer het `firebaseConfig`-object.
6. Op deze laptop: kopieer `src/config.example.js` naar `src/config.js`
   (gebeurt ook automatisch bij `npm run build`) en plak de waarden erin.

## 2. Firestore security rules publiceren

1. Firebase Console → **Firestore Database → Regels**.
2. Vervang de inhoud door het volledige bestand `firestore.rules` uit deze repo.
3. Klik **Publiceren**.

De regels beperken lezen/schrijven tot paden onder een familiecode van
minstens 6 tekens en valideren de documentvorm — de database staat dus niet
open, en de code zelf is het geheim (niet op te sommen van buitenaf).

## 3. Cloudflare Worker deployen (fotoherkenning)

1. Gratis Cloudflare-account op https://dash.cloudflare.com (geen creditcard).
2. In `worker/wrangler.toml`: vervang `GEBRUIKERSNAAM` in `ALLOWED_ORIGINS`
   door je GitHub-gebruikersnaam.
3. In de map `worker/`:
   ```
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   Plak bij die laatste je Anthropic API-key (console.anthropic.com →
   API Keys). De key leeft alleen als secret in de Worker, nooit in de repo
   of frontend.
4. Noteer de Worker-URL uit de deploy-output (bijv.
   `https://dierenlogboek-herkenning.jouwnaam.workers.dev`) en zet die in
   `src/config.js` als `WORKER_URL`.

## 4. Naar GitHub pushen en Pages aanzetten

1. **Herbouw eerst** met de ingevulde config (de build bakt de config in):
   ```
   npm run build
   git add docs
   git commit -m "Build met productieconfig"
   ```
   (`src/config.js` zelf staat in `.gitignore` en gaat níet mee — alleen de
   gebouwde bundel in `docs/`. De Firebase web-config is publiek by design;
   de beveiliging zit in de Firestore-regels.)
2. Maak op GitHub een nieuwe repo met de naam **dierenlogboek** (de naam moet
   overeenkomen met het base-pad `/dierenlogboek/`).
3. ```
   git remote add origin https://github.com/GEBRUIKERSNAAM/dierenlogboek.git
   git push -u origin main
   ```
4. GitHub → repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch `main`, map `/docs` → Save.
5. Na ±1 minuut staat de app op
   `https://GEBRUIKERSNAAM.github.io/dierenlogboek/`.
6. Controleer: laadt de app, klopt het base-pad (geen 404's op assets in de
   browser-console), en werkt herkenning na een testfoto?

## 5. Op de iPad (en telefoons) zetten

1. Open in **Safari**: `https://GEBRUIKERSNAAM.github.io/dierenlogboek/`.
2. Deel-knop → **Zet op beginscherm**. De app opent dan fullscreen
   (standalone) met eigen icoon.
3. Vul op elk apparaat dezelfde **familiecode** in (minstens 6 tekens, bijv.
   `familie-oudeelferink`) — daarmee delen iPad en telefoon één logboek.

## Nieuwe versie uitrollen

```
npm run build
git add docs && git commit -m "..." && git push
```

De service worker heeft een versie-gebaseerde cache met skipWaiting +
clients.claim: apparaten halen de nieuwe versie automatisch op bij de
volgende opening (één automatische refresh) — geen vastgeplakte oude cache.

## Handig om te weten

- **Familiecode wisselen** op een apparaat: Safari-instellingen → website-
  gegevens voor github.io wissen (of in de browserconsole
  `localStorage.removeItem('dierenlogboek:familiecode')`).
- **Zonder internet** werkt alles gewoon: opslaan gaat naar de lokale
  Firestore-cache en synchroniseert vanzelf zodra er weer bereik is.
  Herkenning is dan tijdelijk niet beschikbaar ("Probeer opnieuw"-knop),
  maar opslaan blokkeert daar nooit op.
- **Kosten**: Firestore Spark (gratis limieten ruim voldoende voor
  familiegebruik), Cloudflare Workers gratis tier (100k requests/dag),
  GitHub Pages gratis. Alleen de Anthropic API kost per herkende foto een
  paar tienden van een cent.
