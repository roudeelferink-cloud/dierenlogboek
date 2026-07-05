# Siems Dierenlogboek

Installeerbare PWA waarmee Siem gespotte dieren vastlegt: foto maken, Claude
herkent het dier en vertelt weetjes in Freek Vonk-stijl, en alles synct
tussen iPad en telefoon via een gedeelde familiecode.

Persoonlijk familieproject — volledig losstaand van andere infrastructuur.

## Architectuur

- **Frontend**: Vite + React, statische build in `docs/` voor GitHub Pages
  onder `/dierenlogboek/`. UI is een 1-op-1 port van `dierenlogboek.jsx`
  (het ontwerp-artifact in de root — bewaard als referentie).
- **Data + sync**: Firebase Firestore (gratis Spark-plan) met offline-
  persistence. Eén gedeelde familiecode = één logboek; documenten staan
  onder `families/{code}/spots/{id}`. Beveiligd via `firestore.rules`.
- **Foto's**: agressief gecomprimeerde base64 (max ~400 KB) inline in het
  Firestore-document — geen Firebase Storage, dus geen Blaze/creditcard.
- **Fotoherkenning**: Cloudflare Worker (`worker/`) als proxy naar de
  Anthropic-API. De API-key staat als secret in de Worker, nooit in de
  frontend. CORS beperkt tot de Pages-origin.
- **PWA**: manifest + icons + service worker met versie-gebaseerde cache,
  skipWaiting en clients.claim — updates blijven nooit hangen, en de app
  werkt offline in het veld. Opslaan slaagt altijd; herkenning is bonus.

## Ontwikkelen

```
npm install
npm run dev        # config.js wordt automatisch aangemaakt vanuit het voorbeeld
```

Zonder ingevulde `src/config.js` draait de app in lokaal-modus
(localStorage, geen sync, geen herkenning) — handig om de UI te testen.

## Deployen

Zie [DEPLOY.md](DEPLOY.md) voor de exacte stappen (Firebase, rules,
Worker, GitHub Pages, iPad).
