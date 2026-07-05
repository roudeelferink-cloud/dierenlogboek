// Kopieert config.example.js naar config.js als die nog niet bestaat, zodat
// een verse checkout altijd kan bouwen (zonder echte credentials draait de
// app in lokaal-modus).
import { existsSync, copyFileSync } from "node:fs";

const example = new URL("../src/config.example.js", import.meta.url);
const real = new URL("../src/config.js", import.meta.url);

if (!existsSync(real)) {
  copyFileSync(example, real);
  console.log("src/config.js aangemaakt vanuit config.example.js — vul je echte Firebase-config en Worker-URL in.");
}
