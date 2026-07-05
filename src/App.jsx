import React, { useState, useEffect, useRef } from "react";
import { Plus, Camera, MapPin, Calendar, X, Trash2, Search, PawPrint } from "lucide-react";
import { identifyAnimal } from "./identify.js";
import {
  getFamilyCode,
  setFamilyCode,
  subscribeSpots,
  saveSpot,
  deleteSpot,
} from "./storage.js";

const APP_TITLE = "Siems Dierenlogboek";

// Taxonomie: elke diergroep krijgt een eigen kleur + emoji.
// Zo leert hij dieren indelen zoals een bioloog dat doet.
const GROUPS = [
  { id: "zoogdier", label: "Zoogdier", emoji: "🦊", color: "#B5651D" },
  { id: "vogel",    label: "Vogel",    emoji: "🐦", color: "#3B82C4" },
  { id: "reptiel",  label: "Reptiel",  emoji: "🦎", color: "#4C956C" },
  { id: "amfibie",  label: "Amfibie",  emoji: "🐸", color: "#2A9D8F" },
  { id: "vis",      label: "Vis",      emoji: "🐟", color: "#1D6FB8" },
  { id: "insect",   label: "Insect",   emoji: "🐛", color: "#E8952F" },
  { id: "spin",     label: "Spin",     emoji: "🕷️", color: "#7C5CBF" },
  { id: "weekdier", label: "Weekdier", emoji: "🐌", color: "#C94B7B" },
  { id: "anders",   label: "Anders",   emoji: "🐾", color: "#6B7280" },
];
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const PLACES = ["Tuin", "Bos", "Water", "Dierentuin", "Vakantie", "Strand"];

const C = {
  paper: "#F7F4EC",
  card: "#FFFFFF",
  ink: "#22312B",
  soft: "#6B7B72",
  forest: "#2D6A4F",
  sun: "#F2A93B",
  line: "#E6E0D2",
};

// Foto's gaan als base64 inline het Firestore-document in (Spark-plan, geen
// Storage). Max ~400 KB: we comprimeren steeds agressiever tot het past.
const MAX_PHOTO_BYTES = 400 * 1024;
const COMPRESS_STEPS = [
  [520, 0.62],
  [480, 0.55],
  [420, 0.48],
  [360, 0.42],
  [320, 0.36],
];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const img = await loadImage(file);
  let dataUrl = null;
  for (const [maxDim, quality] of COMPRESS_STEPS) {
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_PHOTO_BYTES) return dataUrl;
  }
  return dataUrl;
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function App() {
  const [familyCode, setFamilyCodeState] = useState(getFamilyCode());
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("alles");
  const [query, setQuery] = useState("");
  const [celebrate, setCelebrate] = useState(null);

  useEffect(() => {
    if (!familyCode) return;
    const unsub = subscribeSpots(
      familyCode,
      (list) => {
        setEntries(list);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    // Ook zonder (eerste) snapshot mag de app niet op "laden" blijven hangen.
    const failsafe = setTimeout(() => setLoaded(true), 4000);
    return () => {
      clearTimeout(failsafe);
      unsub();
    };
  }, [familyCode]);

  if (!familyCode) {
    return (
      <FamilyGate
        onSubmit={(code) => {
          setFamilyCode(code);
          setFamilyCodeState(code);
        }}
      />
    );
  }

  const speciesSet = new Set(entries.map((e) => e.name.trim().toLowerCase()));
  const speciesCount = speciesSet.size;

  const usedGroups = GROUPS.filter((g) => entries.some((e) => e.group === g.id));

  const visible = entries
    .filter((e) => filter === "alles" || e.group === filter)
    .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()) || (e.place || "").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));

  function addEntry(data, photoUrl) {
    const isNew = !speciesSet.has(data.name.trim().toLowerCase());
    const id = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const entry = { id, created: Date.now(), hasPhoto: !!photoUrl, photo: photoUrl || null, ...data };
    // Optimistisch tonen; de Firestore-snapshot (lokale cache) bevestigt direct
    // daarna. Opslaan gaat dus altijd door, ook zonder internet.
    setEntries((prev) => [entry, ...prev.filter((e) => e.id !== id)]);
    saveSpot(familyCode, entry);
    setAdding(false);
    if (isNew) {
      setCelebrate({ name: data.name, group: data.group });
      setTimeout(() => setCelebrate(null), 2600);
    }
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    deleteSpot(familyCode, id);
    setDetail(null);
  }

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: "'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
        .disp { font-family: 'Fredoka', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif; }
        *:focus-visible { outline: 3px solid ${C.forest}; outline-offset: 2px; border-radius: 6px; }
        @keyframes pop { 0%{transform:scale(.6);opacity:0} 55%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        @keyframes floatIn { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        .pop { animation: pop .45s cubic-bezier(.2,.9,.3,1.2) both; }
        .floatIn { animation: floatIn .3s ease both; }
        @media (prefers-reduced-motion: reduce){ .pop,.floatIn{animation:none} }
        .card-btn { transition: transform .12s ease; }
        .card-btn:active { transform: scale(.97); }
      `}</style>

      {/* Header */}
      <header style={{ background: C.forest, color: "#F4F7F2" }} className="px-5 pt-7 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-2 mb-4">
          <PawPrint size={22} strokeWidth={2.4} />
          <span className="disp" style={{ fontSize: 13, letterSpacing: 1.5, opacity: 0.85, textTransform: "uppercase" }}>Veldlogboek</span>
        </div>
        <h1 className="disp" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{APP_TITLE}</h1>
        <p style={{ opacity: 0.85, marginTop: 4, fontSize: 15 }}>Welk beest heb jij gespot?</p>

        <div className="flex gap-3 mt-5">
          <Stat big value={speciesCount} label={speciesCount === 1 ? "soort ontdekt" : "soorten ontdekt"} />
          <Stat value={entries.length} label={entries.length === 1 ? "keer gespot" : "keer gespot"} />
        </div>
      </header>

      <main className="px-4 pb-28 max-w-md mx-auto">
        {/* Zoek + filter */}
        {entries.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <Search size={18} color={C.soft} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek een beest of plek…"
                className="w-full bg-transparent"
                style={{ outline: "none", fontSize: 15 }}
              />
              {query && <button onClick={() => setQuery("")} aria-label="Wis zoeken"><X size={16} color={C.soft} /></button>}
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <Chip active={filter === "alles"} onClick={() => setFilter("alles")}>Alles</Chip>
              {usedGroups.map((g) => (
                <Chip key={g.id} active={filter === g.id} color={g.color} onClick={() => setFilter(g.id)}>
                  <span>{g.emoji}</span> {g.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Lijst / lege staat */}
        {!loaded ? (
          <p className="text-center mt-16" style={{ color: C.soft }}>Logboek laden…</p>
        ) : entries.length === 0 ? (
          <EmptyState onStart={() => setAdding(true)} />
        ) : visible.length === 0 ? (
          <p className="text-center mt-12" style={{ color: C.soft }}>Niets gevonden. Probeer een andere groep of zoekterm.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {visible.map((e) => (
              <SpotCard key={e.id} entry={e} photo={e.photo} onClick={() => setDetail(e)} />
            ))}
          </div>
        )}
      </main>

      {/* Zwevende knop */}
      <button
        onClick={() => setAdding(true)}
        aria-label="Nieuw beest toevoegen"
        className="disp card-btn"
        style={{
          position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 22,
          background: C.forest, color: "#fff", border: "none", padding: "14px 26px",
          borderRadius: 999, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 8px 22px rgba(45,106,79,.35)", cursor: "pointer",
        }}
      >
        <Plus size={22} strokeWidth={2.6} /> Nieuw beest
      </button>

      {adding && <AddSheet onClose={() => setAdding(false)} onSave={addEntry} />}
      {detail && <DetailSheet entry={detail} photo={detail.photo} onClose={() => setDetail(null)} onDelete={() => removeEntry(detail.id)} />}
      {celebrate && <Celebration data={celebrate} />}
    </div>
  );
}

// Familiecode-scherm: één gedeelde code koppelt Siems iPad en de telefoons
// aan hetzelfde logboek (zelfde patroon als de camper-app).
function FamilyGate({ onSubmit }) {
  const [code, setCode] = useState("");
  const clean = code.trim().toLowerCase().replace(/\s+/g, "-");
  const valid = clean.length >= 6;

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: "'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
        .disp { font-family: 'Fredoka', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif; }
        @keyframes floatIn { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        .floatIn { animation: floatIn .3s ease both; }
      `}</style>
      <header style={{ background: C.forest, color: "#F4F7F2" }} className="px-5 pt-7 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-2 mb-4">
          <PawPrint size={22} strokeWidth={2.4} />
          <span className="disp" style={{ fontSize: 13, letterSpacing: 1.5, opacity: 0.85, textTransform: "uppercase" }}>Veldlogboek</span>
        </div>
        <h1 className="disp" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{APP_TITLE}</h1>
        <p style={{ opacity: 0.85, marginTop: 4, fontSize: 15 }}>Welk beest heb jij gespot?</p>
      </header>
      <main className="px-5 max-w-md mx-auto w-full floatIn" style={{ marginTop: 40 }}>
        <div style={{ fontSize: 48, textAlign: "center" }}>🔑🦉</div>
        <h2 className="disp text-center" style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>Vul de familiecode in</h2>
        <p className="text-center" style={{ color: C.soft, marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
          Met dezelfde code op de iPad en op papa&apos;s telefoon delen jullie één logboek.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) onSubmit(clean); }}
          placeholder="bijv. familie-oudeelferink"
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            width: "100%", marginTop: 20, padding: "14px 16px", borderRadius: 16,
            border: `1.5px solid ${C.line}`, background: "#fff", fontSize: 16,
            color: C.ink, outline: "none", fontFamily: "inherit", textAlign: "center",
          }}
        />
        <button
          onClick={() => valid && onSubmit(clean)}
          disabled={!valid}
          className="disp card-btn"
          style={{
            width: "100%", marginTop: 14, padding: "15px", borderRadius: 16, border: "none",
            fontSize: 17, fontWeight: 600, cursor: valid ? "pointer" : "default",
            background: valid ? C.forest : C.line, color: valid ? "#fff" : C.soft,
          }}
        >
          Open het logboek
        </button>
        {!valid && code.length > 0 && (
          <p className="text-center" style={{ color: C.soft, fontSize: 13, marginTop: 10 }}>
            De code moet minstens 6 tekens lang zijn.
          </p>
        )}
      </main>
    </div>
  );
}

function Stat({ value, label, big }) {
  return (
    <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 18, padding: "12px 16px", flex: big ? 1.2 : 1 }}>
      <div className="disp" style={{ fontSize: big ? 34 : 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, opacity: 0.88, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Chip({ children, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="card-btn"
      style={{
        whiteSpace: "nowrap", flexShrink: 0, padding: "7px 14px", borderRadius: 999, fontSize: 14, fontWeight: 700,
        cursor: "pointer", border: `1.5px solid ${active ? (color || C.forest) : C.line}`,
        background: active ? (color || C.forest) : C.card, color: active ? "#fff" : C.ink,
      }}
    >
      {children}
    </button>
  );
}

function SpotCard({ entry, photo, onClick }) {
  const g = GROUP[entry.group] || GROUP.anders;
  return (
    <button onClick={onClick} className="card-btn text-left" style={{ background: C.card, borderRadius: 20, overflow: "hidden", border: `1px solid ${C.line}`, cursor: "pointer" }}>
      <div style={{ aspectRatio: "1", background: `${g.color}1a`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {photo ? (
          <img src={photo} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 46 }}>{g.emoji}</span>
        )}
        <span className="disp" style={{ position: "absolute", top: 8, left: 8, background: g.color, color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999 }}>
          {g.label}
        </span>
      </div>
      <div className="p-3">
        <div className="disp" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.15, textTransform: "capitalize" }}>{entry.name}</div>
        <div className="flex items-center gap-1 mt-1" style={{ color: C.soft, fontSize: 12.5 }}>
          {entry.place && <><MapPin size={12} /> <span className="truncate">{entry.place}</span></>}
        </div>
        <div style={{ color: C.soft, fontSize: 12, marginTop: 2 }}>{fmtDate(entry.date)}</div>
      </div>
    </button>
  );
}

function EmptyState({ onStart }) {
  return (
    <div className="text-center mt-16 floatIn px-6">
      <div style={{ fontSize: 60 }}>🔍🦔</div>
      <h2 className="disp" style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>Je logboek is nog leeg</h2>
      <p style={{ color: C.soft, marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
        Ga naar buiten, kijk goed om je heen en zet het eerste beest dat je spot in je logboek. Een vogel in de tuin telt ook!
      </p>
      <button onClick={onStart} className="disp card-btn" style={{ marginTop: 18, background: C.forest, color: "#fff", border: "none", padding: "12px 24px", borderRadius: 999, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
        Spot je eerste beest
      </button>
    </div>
  );
}

function Sheet({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,40,35,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 40 }}>
      <div onClick={(e) => e.stopPropagation()} className="floatIn" style={{ background: C.paper, width: "100%", maxWidth: 448, maxHeight: "92vh", overflowY: "auto", borderRadius: "24px 24px 0 0", padding: 20, paddingBottom: 32 }}>
        {children}
      </div>
    </div>
  );
}

function AddSheet({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [idError, setIdError] = useState(false);
  const [facts, setFacts] = useState([]);
  const fileRef = useRef();

  async function pickPhoto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setIdError(false);
    try {
      const url = await compressImage(f);
      setPhoto(url);
      setBusy(false);
      runIdentify(url);
    } catch { setBusy(false); }
  }

  // Vult soort, groep en weetjes automatisch in. Wat Siem al zelf typte blijft staan.
  async function runIdentify(url) {
    setIdentifying(true); setIdError(false);
    try {
      const r = await identifyAnimal(url);
      setName((prev) => (prev.trim() ? prev : r.naam));
      setGroup((prev) => (prev ? prev : r.groep));
      if (r.weetjes.length) setFacts(r.weetjes);
    } catch {
      setIdError(true);
    }
    setIdentifying(false);
  }

  const canSave = name.trim() && group;

  function save() {
    if (!canSave) return;
    onSave({ name: name.trim(), group, place: place.trim(), date, note: note.trim(), facts }, photo);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="disp" style={{ fontSize: 22, fontWeight: 700 }}>Nieuw beest spotten</h2>
        <button onClick={onClose} aria-label="Sluiten"><X size={24} color={C.soft} /></button>
      </div>

      <Field label="Maak een foto — Claude herkent het dier vanzelf">
        {photo ? (
          <div style={{ position: "relative" }}>
            <img src={photo} alt="voorbeeld" style={{ width: "100%", borderRadius: 16, maxHeight: 220, objectFit: "cover" }} />
            <button onClick={() => { setPhoto(null); setFacts([]); setIdError(false); }} aria-label="Foto verwijderen" style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.55)", color: "#fff", border: "none", borderRadius: 999, width: 32, height: 32, cursor: "pointer" }}><X size={18} /></button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="card-btn" style={{ width: "100%", padding: "22px", borderRadius: 16, border: `2px dashed ${C.forest}`, background: `${C.forest}0d`, color: C.forest, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontSize: 15, fontWeight: 700 }}>
            <Camera size={20} /> {busy ? "Bezig…" : "Foto kiezen of maken"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{ display: "none" }} />
      </Field>

      {(identifying || idError || facts.length > 0) && (
        <div className="floatIn" style={{ marginBottom: 16, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: 14 }}>
          {identifying ? (
            <div style={{ color: C.forest, fontWeight: 700, fontSize: 15 }}>🔬 Claude kijkt goed naar de foto…</div>
          ) : idError ? (
            <div>
              <div style={{ color: C.soft, fontSize: 14.5 }}>Kon het dier niet herkennen. Vul 'm zelf in, of probeer opnieuw.</div>
              {photo && <button onClick={() => runIdentify(photo)} className="card-btn" style={{ marginTop: 8, padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${C.forest}`, background: "#fff", color: C.forest, fontWeight: 700, cursor: "pointer" }}>Probeer opnieuw</button>}
            </div>
          ) : (
            <>
              <div className="disp" style={{ fontSize: 15, fontWeight: 700, color: C.forest, marginBottom: 6 }}>Weetjes 🔬</div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {facts.map((f, i) => <li key={i} style={{ fontSize: 14.5, lineHeight: 1.45, paddingLeft: 16, position: "relative" }}><span style={{ position: "absolute", left: 0 }}>•</span>{f}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      <Field label="Welk dier?">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="bijv. egel, buizerd, kikker" style={inp} />
      </Field>

      <Field label="Wat voor soort?">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <button key={g.id} onClick={() => setGroup(g.id)} className="card-btn" style={{
              padding: "8px 12px", borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${group === g.id ? g.color : C.line}`,
              background: group === g.id ? g.color : C.card, color: group === g.id ? "#fff" : C.ink,
            }}>{g.emoji} {g.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Waar?">
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="bijv. tuin, bos bij De Lutte" style={inp} />
        <div className="flex flex-wrap gap-2 mt-2">
          {PLACES.map((p) => (
            <button key={p} onClick={() => setPlace(p)} className="card-btn" style={{ padding: "5px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1px solid ${C.line}`, background: C.card, color: C.soft, cursor: "pointer" }}>{p}</button>
          ))}
        </div>
      </Field>

      <Field label="Wanneer?">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      </Field>

      <Field label="Notitie (leuk voor later!)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wat deed het beest? Hoe zag het eruit? Hoe groot was het?" rows={3} style={{ ...inp, resize: "none" }} />
      </Field>

      <button onClick={save} disabled={!canSave} className="disp card-btn" style={{
        width: "100%", marginTop: 8, padding: "15px", borderRadius: 16, border: "none", fontSize: 17, fontWeight: 600,
        background: canSave ? C.forest : C.line, color: canSave ? "#fff" : C.soft, cursor: canSave ? "pointer" : "default",
      }}>
        Zet in mijn logboek
      </button>
      {!canSave && <p style={{ textAlign: "center", color: C.soft, fontSize: 13, marginTop: 8 }}>Vul een naam in en kies een soort.</p>}
    </Sheet>
  );
}

function DetailSheet({ entry, photo, onClose, onDelete }) {
  const g = GROUP[entry.group] || GROUP.anders;
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <div className="flex justify-end mb-2"><button onClick={onClose} aria-label="Sluiten"><X size={24} color={C.soft} /></button></div>
      <div style={{ borderRadius: 20, overflow: "hidden", background: `${g.color}1a`, aspectRatio: photo ? "auto" : "16/10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {photo ? <img src={photo} alt={entry.name} style={{ width: "100%" }} /> : <span style={{ fontSize: 72 }}>{g.emoji}</span>}
      </div>
      <span className="disp" style={{ display: "inline-block", marginTop: 14, background: g.color, color: "#fff", fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 999 }}>{g.emoji} {g.label}</span>
      <h2 className="disp" style={{ fontSize: 26, fontWeight: 700, marginTop: 8, textTransform: "capitalize" }}>{entry.name}</h2>
      <div className="flex gap-4 mt-3" style={{ color: C.soft, fontSize: 15 }}>
        {entry.place && <span className="flex items-center gap-1"><MapPin size={16} /> {entry.place}</span>}
        <span className="flex items-center gap-1"><Calendar size={16} /> {fmtDate(entry.date)}</span>
      </div>
      {entry.note && <p style={{ marginTop: 14, fontSize: 15.5, lineHeight: 1.55, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14 }}>{entry.note}</p>}

      {entry.facts && entry.facts.length > 0 && (
        <div style={{ marginTop: 14, background: `${g.color}12`, border: `1px solid ${g.color}55`, borderRadius: 16, padding: 14 }}>
          <div className="disp" style={{ fontSize: 15, fontWeight: 700, color: g.color, marginBottom: 6 }}>Weetjes 🔬</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {entry.facts.map((f, i) => <li key={i} style={{ fontSize: 15, lineHeight: 1.45, paddingLeft: 18, position: "relative" }}><span style={{ position: "absolute", left: 0 }}>•</span>{f}</li>)}
          </ul>
        </div>
      )}

      {confirm ? (
        <div className="flex gap-2 mt-6">
          <button onClick={onDelete} className="card-btn" style={{ flex: 1, padding: 13, borderRadius: 14, border: "none", background: "#C0392B", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Ja, verwijder</button>
          <button onClick={() => setConfirm(false)} className="card-btn" style={{ flex: 1, padding: 13, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.ink, fontWeight: 700, cursor: "pointer" }}>Nee, laat maar</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} className="card-btn" style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 8, color: C.soft, background: "none", border: "none", fontSize: 14, cursor: "pointer" }}>
          <Trash2 size={16} /> Verwijder uit logboek
        </button>
      )}
    </Sheet>
  );
}

function Celebration({ data }) {
  const g = GROUP[data.group] || GROUP.anders;
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
      <div className="pop" style={{ background: "#fff", borderRadius: 24, padding: "26px 30px", textAlign: "center", boxShadow: "0 18px 50px rgba(0,0,0,.25)", border: `3px solid ${g.color}` }}>
        <div style={{ fontSize: 54 }}>{g.emoji}✨</div>
        <div className="disp" style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: g.color }}>Nieuwe soort!</div>
        <div style={{ fontSize: 15, color: C.soft, marginTop: 4, textTransform: "capitalize" }}>{data.name} toegevoegd aan je logboek</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="disp" style={{ display: "block", fontSize: 14.5, fontWeight: 600, marginBottom: 7, color: C.ink }}>{label}</label>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.line}`,
  background: "#fff", fontSize: 15.5, color: C.ink, outline: "none", fontFamily: "inherit",
};
