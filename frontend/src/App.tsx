import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Square,
  Terminal,
  TriangleAlert,
  Unplug,
  Workflow,
  X,
  Zap,
} from "lucide-react";

type Health = {
  jev_configured: boolean;
  model: string;
  max_steps: number;
  min_confidence: number;
};
type Task = {
  url: string;
  instruction: string;
  values: Record<string, string>;
};
type Event = {
  id: number;
  time: string;
  kind: string;
  message: string;
  confidence?: number;
  operation?: string;
};
type Run = {
  id: string;
  status: string;
  mode: string;
  steps: number;
  confidence: number | null;
  elapsed: number;
  events: Event[];
  has_screenshot: boolean;
  page: { url: string; title: string; elements: number } | null;
};
const terminal = new Set(["completed", "blocked", "failed", "cancelled"]);
const statuses: Record<string, string> = {
  queued: "In coda",
  running: "In esecuzione",
  completed: "Completata",
  blocked: "Da verificare",
  failed: "Errore",
  cancelled: "Interrotta",
};
const defaultInstruction =
  "Cerca {{prodotto}}, seleziona la taglia {{taglia}} e premi Cerca per mostrare i risultati.";
const defaultValues = JSON.stringify(
  { prodotto: "scarpe da trekking", taglia: "42" },
  null,
  2,
);

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) {
    const detail = body.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d: { msg: string }) => d.msg.replace("Value error, ", ""))
              .join(" · ")
          : "Il server non ha completato la richiesta.",
    );
  }
  return body;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [rawValues, setRawValues] = useState(defaultValues);
  const [health, setHealth] = useState<Health | null>(null);
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [modal, setModal] = useState<"help" | "settings" | null>(null);
  const [view, setView] = useState<"browser" | "activity">("browser");
  const [copied, setCopied] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);
  const modalClose = useRef<HTMLButtonElement>(null);
  const active = !!run && !terminal.has(run.status);
  const disabled = busy || active;
  const keys = [
    ...new Set(
      [...instruction.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  let values: Record<string, string> = {};
  let jsonError = "";
  try {
    const parsed = JSON.parse(rawValues);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      throw new Error("Usa un oggetto JSON chiave-valore.");
    if (Object.values(parsed).some((value) => typeof value !== "string"))
      throw new Error("Ogni valore deve essere una stringa tra virgolette.");
    values = parsed;
  } catch (e) {
    jsonError =
      e instanceof SyntaxError
        ? "JSON non valido: controlla virgolette e virgole."
        : (e as Error).message;
  }
  const missing = keys.filter((key) => !Object.hasOwn(values, key));
  const unused = Object.keys(values).filter((key) => !keys.includes(key));
  const observationId =
    run?.events.filter((event) => event.kind === "observation").at(-1)?.id ?? 0;

  useEffect(() => {
    const load = () =>
      api<Health>("/api/health")
        .then(setHealth)
        .catch(() => setHealth(null));
    void load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!run || terminal.has(run.status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const updated = await api<Run>(`/api/runs/${run.id}`);
        if (!disposed) {
          setRun(updated);
          setPollError("");
        }
      } catch (e) {
        if (!disposed) setPollError((e as Error).message);
      }
      if (!disposed) timer = setTimeout(poll, 750);
    };
    timer = setTimeout(poll, 500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [run?.id, run?.status]);

  useEffect(() => {
    timeline.current?.scrollTo({
      top: timeline.current.scrollHeight,
      behavior: "smooth",
    });
  }, [run?.events.length]);
  useEffect(() => {
    if (modal) modalClose.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [modal]);

  async function loadExample(name: "local" | "saucedemo" = "local") {
    if (disabled) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const example = await api<Task>(`/api/example?name=${name}`);
      setUrl(example.url);
      setInstruction(example.instruction);
      setRawValues(JSON.stringify(example.values, null, 2));
      setMode(name === "local" ? "demo" : "live");
      setRun(null);
      setNotice(
        name === "local"
          ? "Esempio locale caricato. Premi “Avvia demo” per provarlo."
          : "SauceDemo caricato: accesso, aggiunta del prodotto e verifica del carrello. Usa Jev live con la chiave OpenRouter configurata.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError("");
    setNotice("");
    if (jsonError) {
      setError(jsonError);
      return;
    }
    if (missing.length) {
      setError(`Valori mancanti: ${missing.join(", ")}`);
      return;
    }
    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
    } catch {
      setError("Inserisci un URL completo, per esempio https://example.com.");
      return;
    }
    setBusy(true);
    setStopping(false);
    try {
      const result = await api<Run>("/api/runs", {
        method: "POST",
        body: JSON.stringify({ task: { url, instruction, values }, mode }),
      });
      setRun(result);
      setView("browser");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!run) return;
    setStopping(true);
    try {
      setRun(await api<Run>(`/api/runs/${run.id}/cancel`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
      setStopping(false);
    }
  }

  function reset() {
    if (disabled) return;
    setRun(null);
    setError("");
    setNotice("");
    setUrl("");
    setInstruction("");
    setRawValues("{}");
    setMode("live");
  }

  function download() {
    if (!run) return;
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `autojev-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  const activity = (
    <div className="timeline" ref={timeline}>
      {run?.events.map((event) => (
        <div className={`event event-${event.kind}`} key={event.id}>
          <div className="event-icon">
            {event.kind === "decision" ? (
              <Zap size={13} />
            ) : event.kind === "action" ? (
              <MousePointer2 size={13} />
            ) : event.kind === "completed" ? (
              <Check size={13} />
            ) : ["warning", "blocked", "failed"].includes(event.kind) ? (
              <TriangleAlert size={13} />
            ) : (
              <span />
            )}
          </div>
          <div>
            <p>{event.message}</p>
            <div className="event-meta">
              {new Date(event.time).toLocaleTimeString("it-IT")}
              {event.confidence !== undefined && (
                <span>{Math.round(event.confidence * 100)}% confidenza</span>
              )}
            </div>
          </div>
        </div>
      ))}
      {!run && (
        <div className="empty-activity">
          <Radio size={18} />
          <span>Le azioni appariranno qui, in tempo reale.</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Zap size={21} fill="currentColor" />
          </span>
          auto<span>Jev</span>
          <span className="beta">BETA</span>
        </a>
        <div className="workspace-label">IL TUO WORKSPACE</div>
        <button className="nav-item selected" onClick={() => setModal(null)}>
          <Workflow size={18} /> Automazione <ChevronRight size={15} />
        </button>
        <button className="nav-item" onClick={() => setModal("settings")}>
          <Layers3 size={18} /> Connessioni
        </button>
        <button className="nav-item" onClick={() => setModal("help")}>
          <CircleHelp size={18} /> Come funziona
        </button>
        <div className="sidebar-note">
          <div className="tiny-orbit">
            <Zap size={18} />
          </div>
          <h3>
            Le tue parole.
            <br />
            Il prossimo passo.
          </h3>
          <p>Un obiettivo, decisioni mirate e un browser che agisce.</p>
          <span>
            POWERED BY JEV <ArrowUpRight size={12} />
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className={`status-dot ${health ? "green" : ""}`} />
          <div>
            Ambiente locale<small>Python + Node.js</small>
          </div>
          <button
            aria-label="Configurazione"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={13} />
            <span>Nuova automazione</span>
          </div>
          <div className="top-right">
            <span className="private-label">
              <ShieldCheck size={14} /> Esecuzione locale
            </span>
            <span className="avatar">AJ</span>
          </div>
        </header>
        <main>
          <div className="hero">
            <div>
              <div className="eyebrow">
                <span /> BROWSER AUTOMATION, REIMAGINED
              </div>
              <h1>
                Dalle parole, alle azioni<span>.</span>
              </h1>
              <p>
                Descrivi l’obiettivo. Collega i tuoi dati. Lascia a Jev il
                prossimo passo.
              </p>
            </div>
            <div className="example-actions">
              <button
                className="button secondary example-button"
                onClick={() => loadExample()}
                disabled={disabled}
              >
                <Play size={14} /> Prova un esempio <ArrowUpRight size={15} />
              </button>
              <button
                className="button secondary example-button"
                onClick={() => loadExample("saucedemo")}
                disabled={disabled}
              >
                <Globe2 size={14} /> Esempio SauceDemo
              </button>
            </div>
          </div>
          <div className="integration-bar">
            <div>
              <span className="integration-icon purple">
                <Zap size={14} />
              </span>
              <strong>Jev</strong>
              <span
                className={`status-dot ${health?.jev_configured ? "green" : "amber"}`}
              />
              <span>
                {health?.jev_configured
                  ? "Connesso via OpenRouter"
                  : "Chiave da configurare"}
              </span>
            </div>
            <span className="integration-divider" />
            <div>
              <span className="integration-icon green-bg">
                <Globe2 size={14} />
              </span>
              <strong>Selenium MCP</strong>
              <span className={`status-dot ${health ? "green" : "amber"}`} />
              <span>
                {health ? "Server incluso" : "Backend non raggiungibile"}
              </span>
            </div>
            <button onClick={() => setModal("settings")}>
              Configura <Settings2 size={13} />
            </button>
          </div>

          <div className="work-grid">
            <section className="card task-card">
              <div className="card-heading">
                <div>
                  <span className="section-icon">
                    <Workflow size={17} />
                  </span>
                  <h2>La tua automazione</h2>
                </div>
                <span className="muted-label">3 input. Un obiettivo.</span>
              </div>
              <div className="input-section">
                <label className="field-label" htmlFor="site-url">
                  <span className="number">01</span> Sito di partenza{" "}
                  <Globe2 size={15} />
                </label>
                <div className="url-input">
                  <Globe2 size={17} />
                  <input
                    id="site-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    disabled={disabled}
                    autoComplete="off"
                  />
                </div>
                <p className="field-hint">
                  Il browser inizierà da questo indirizzo.
                </p>
              </div>
              <div className="input-section">
                <label className="field-label" htmlFor="instruction">
                  <span className="number">02</span> Cosa vuoi fare?{" "}
                  <MessageSquareText size={15} />
                </label>
                <textarea
                  id="instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={disabled}
                  placeholder="Descrivi i passaggi e usa {{chiave}} per inserire i tuoi dati…"
                  rows={4}
                />
                <div className="placeholder-list">
                  {keys.length ? (
                    keys.map((key) => (
                      <span
                        className={`placeholder-chip ${missing.includes(key) ? "missing" : ""}`}
                        key={key}
                      >
                        {`{{${key}}}`}{" "}
                        {missing.includes(key) ? (
                          <TriangleAlert size={11} />
                        ) : (
                          <Check size={11} />
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="field-hint">
                      Usa <code>{"{{chiave}}"}</code> per collegare un valore.
                    </span>
                  )}
                </div>
              </div>
              <div className="input-section">
                <div className="field-label">
                  <label htmlFor="values">
                    <span className="number">03</span> I tuoi dati
                  </label>
                  <span className="code-tag">JSON</span>
                </div>
                <div className={`code-editor ${jsonError ? "invalid" : ""}`}>
                  <div className="line-numbers" aria-hidden="true">
                    {rawValues.split("\n").map((_, index) => (
                      <div key={index}>{index + 1}</div>
                    ))}
                  </div>
                  <textarea
                    id="values"
                    spellCheck={false}
                    value={rawValues}
                    onChange={(e) => setRawValues(e.target.value)}
                    disabled={disabled}
                    rows={6}
                    aria-describedby="json-status"
                  />
                </div>
                <div
                  className={`json-status ${jsonError || missing.length ? "bad" : ""}`}
                  id="json-status"
                >
                  {jsonError || missing.length ? (
                    <TriangleAlert size={12} />
                  ) : (
                    <CheckCircle2 size={12} />
                  )}
                  <span>
                    {jsonError ||
                      (missing.length
                        ? `Mancano: ${missing.join(", ")}`
                        : `${keys.length} segnaposto collegati${unused.length ? ` · ${unused.length} chiavi inutilizzate` : ""}`)}
                  </span>
                  {!jsonError && (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        setRawValues(JSON.stringify(values, null, 2))
                      }
                    >
                      Formatta
                    </button>
                  )}
                </div>
              </div>
              <div className="run-controls">
                <div className="mode-row">
                  <span>Modalità</span>
                  <div className="segmented">
                    <button
                      className={mode === "live" ? "on" : ""}
                      disabled={disabled}
                      onClick={() => {
                        setMode("live");
                        setNotice("");
                      }}
                    >
                      <Zap size={12} /> Jev live
                    </button>
                    <button
                      className={mode === "demo" ? "on" : ""}
                      disabled={disabled}
                      onClick={() => loadExample()}
                    >
                      Demo locale
                    </button>
                  </div>
                </div>
                {mode === "demo" && (
                  <p className="demo-note">
                    Browser reale, sequenza di prova predefinita. Nessuna
                    chiamata AI.
                  </p>
                )}
                {error && (
                  <div className="alert" role="alert">
                    <TriangleAlert size={16} />
                    <span>{error}</span>
                  </div>
                )}
                {notice && (
                  <div className="notice" role="status">
                    {notice}
                  </div>
                )}
                {active ? (
                  <button
                    className="button stop full"
                    disabled={stopping}
                    onClick={stop}
                  >
                    {stopping ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Square size={14} />
                    )}{" "}
                    {stopping ? "Arresto in corso…" : "Interrompi esecuzione"}
                  </button>
                ) : (
                  <button
                    className="button primary full"
                    onClick={start}
                    disabled={
                      busy || !!jsonError || !!missing.length || !health
                    }
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}{" "}
                    {busy
                      ? "Avvio…"
                      : mode === "demo"
                        ? "Avvia demo"
                        : "Avvia automazione"}{" "}
                    <ArrowRight size={17} />
                  </button>
                )}
                <p className="control-footnote">
                  <ShieldCheck size={12} /> Valori esatti. Azioni osservabili.
                  Controllo tuo.
                </p>
              </div>
            </section>

            <section className="execution-column">
              <div className="card browser-card">
                <div className="card-heading">
                  <div>
                    <span className="section-icon">
                      <Monitor size={17} />
                    </span>
                    <h2>Browser in azione</h2>
                  </div>
                  <span className={`run-status ${run?.status || "idle"}`}>
                    <span
                      className={`status-dot ${active ? "green pulse" : ""}`}
                    />
                    {run ? statuses[run.status] : "In attesa"}
                  </span>
                </div>
                <div className="browser-toolbar">
                  <div className="window-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="browser-address">
                    <Globe2 size={12} />
                    <span>
                      {run?.page?.url || "Il tuo browser apparirà qui"}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    title="Apri ultima schermata"
                    disabled={!run?.has_screenshot}
                    onClick={() =>
                      window.open(
                        `/api/runs/${run?.id}/screenshot`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
                <div className="browser-stage">
                  {run?.has_screenshot ? (
                    <img
                      src={`/api/runs/${run.id}/screenshot?v=${observationId}`}
                      alt={`Ultima osservazione del browser: ${run.page?.title || ""}`}
                    />
                  ) : (
                    <div className="browser-empty">
                      <div className="orbit-graphic">
                        <div className="orbit-line" />
                        <span className="orbit-node node-one">
                          <Globe2 size={18} />
                        </span>
                        <span className="orbit-node node-two">
                          <Code2 size={17} />
                        </span>
                        <span className="orbit-center">
                          <MousePointer2 size={29} />
                        </span>
                        <span className="orbit-spark">✦</span>
                      </div>
                      <h3>
                        {active
                          ? "Il browser si sta preparando"
                          : "Un obiettivo. Infinite possibilità."}
                      </h3>
                      <p>
                        {active
                          ? "Avvio di Chrome e connessione al server MCP…"
                          : "Avvia un’automazione per seguire qui\nogni passo, dalla prima pagina al risultato."}
                      </p>
                      <span className="preview-label">
                        {active ? (
                          <LoaderCircle size={12} className="spin" />
                        ) : (
                          <Monitor size={12} />
                        )}{" "}
                        {active
                          ? "CONNESSIONE IN CORSO"
                          : "ANTEPRIMA DEL BROWSER"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="browser-footer">
                  <span>
                    <span className={`status-dot ${active ? "green" : ""}`} />
                    {run?.page
                      ? `${run.page.elements} elementi osservati`
                      : "Sessione isolata"}
                  </span>
                  <span>
                    {run?.mode === "demo" ? "DEMO · senza AI" : "Selenium MCP"}{" "}
                    <ArrowUpRight size={12} />
                  </span>
                </div>
              </div>

              <div className="metrics">
                <div>
                  <span>Azioni eseguite</span>
                  <strong>
                    {run?.steps ?? "—"}
                    <small>/ {health?.max_steps ?? 24}</small>
                  </strong>
                </div>
                <div>
                  <span>Tempo trascorso</span>
                  <strong>
                    {run ? run.elapsed.toFixed(1) : "—"}
                    <small>sec</small>
                  </strong>
                </div>
                <div>
                  <span>
                    {run?.mode === "demo" ? "Decisioni" : "Ultima confidenza"}
                  </span>
                  <strong>
                    {run?.mode === "demo"
                      ? "Demo"
                      : run?.confidence != null
                        ? `${Math.round(run.confidence * 100)}%`
                        : "—"}
                    <small>{run?.mode === "demo" ? "script" : "Jev"}</small>
                  </strong>
                </div>
              </div>

              <div className="card activity-card">
                <div className="card-heading">
                  <div className="activity-tabs">
                    <button
                      className={view === "browser" ? "active" : ""}
                      onClick={() => setView("browser")}
                    >
                      <Radio size={15} /> Attività
                    </button>
                    <button
                      className={view === "activity" ? "active" : ""}
                      onClick={() => setView("activity")}
                    >
                      <Terminal size={14} /> Dettagli
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    title="Scarica registro JSON"
                    onClick={download}
                    disabled={!run}
                  >
                    <Download size={15} />
                  </button>
                </div>
                {pollError && (
                  <div className="alert" role="alert">
                    {pollError}
                  </div>
                )}
                {view === "browser" ? (
                  activity
                ) : (
                  <pre className="run-details">
                    {run
                      ? JSON.stringify(
                          {
                            id: run.id,
                            mode: run.mode,
                            status: run.status,
                            page: run.page,
                          },
                          null,
                          2,
                        )
                      : "// I dettagli saranno disponibili dopo l’avvio."}
                  </pre>
                )}
              </div>
            </section>
          </div>
          <footer className="page-footer">
            <span>
              <Zap size={12} /> Decisioni di Jev. Esecuzione di Selenium. Regia
              tua.
            </span>
            <button onClick={reset} disabled={disabled}>
              <Plus size={13} /> Nuova automazione
            </button>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={modalClose}
              className="modal-close icon-button"
              aria-label="Chiudi"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <span className="modal-symbol">
              {modal === "settings" ? (
                <Unplug size={25} />
              ) : (
                <Workflow size={25} />
              )}
            </span>
            <h2 id="modal-title">
              {modal === "settings"
                ? "Le tue connessioni"
                : "Tre input, un ciclo di azioni."}
            </h2>
            {modal === "settings" ? (
              <>
                <p>
                  La chiave OpenRouter rimane nel backend Python. Aggiungila al
                  file <code>.env</code> nella cartella del progetto e riavvia
                  il server.
                </p>
                <pre>
                  OPENROUTER_API_KEY=la_tua_chiave{"\n"}
                  JEV_MODEL=typesafe/jev-1.13
                </pre>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        "OPENROUTER_API_KEY=\nJEV_MODEL=typesafe/jev-1.13",
                      );
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                  {copied ? "Copiato" : "Copia configurazione"}
                </button>
                <div className="connection-list">
                  <div>
                    <span>
                      <Zap size={16} /> OpenRouter / Jev
                    </span>
                    <b>
                      {health?.jev_configured
                        ? "Configurato"
                        : "Chiave mancante"}
                    </b>
                  </div>
                  <div>
                    <span>
                      <Globe2 size={16} /> Selenium MCP
                    </span>
                    <b>{health ? "Incluso · stdio" : "Backend offline"}</b>
                  </div>
                  <div>
                    <span>Limite di azioni</span>
                    <b>{health?.max_steps ?? 24}</b>
                  </div>
                  <div>
                    <span>Soglia di confidenza</span>
                    <b>{Math.round((health?.min_confidence ?? 0.65) * 100)}%</b>
                  </div>
                </div>
                <p className="small-print">
                  Jev live invia a OpenRouter l’obiettivo, i dati referenziati e
                  lo stato testuale della pagina. La demo usa solo la pagina
                  locale e decisioni predefinite. Chrome deve essere installato.
                </p>
              </>
            ) : (
              <>
                <p>
                  Scrivi un obiettivo naturale, indica il sito iniziale e
                  collega i dati usando <code>{"{{chiave}}"}</code>.
                </p>
                <div className="how-step">
                  <Globe2 />
                  <div>
                    <h3>1. Osserva</h3>
                    <p>
                      Selenium raccoglie testo ed elementi visibili della
                      pagina.
                    </p>
                  </div>
                </div>
                <ArrowDown className="how-arrow" size={16} />
                <div className="how-step">
                  <Zap />
                  <div>
                    <h3>2. Decidi</h3>
                    <p>
                      Jev sceglie tra azioni candidate. I valori rimangono
                      associati ai loro segnaposto.
                    </p>
                  </div>
                </div>
                <ArrowDown className="how-arrow" size={16} />
                <div className="how-step">
                  <MousePointer2 />
                  <div>
                    <h3>3. Esegui e verifica</h3>
                    <p>
                      Python risolve i valori esatti e chiama Selenium via MCP.
                      Una nuova osservazione avvia il prossimo passo.
                    </p>
                  </div>
                </div>
                <p className="small-print">
                  Questa prima versione lavora sugli elementi visibili del
                  documento principale. Iframe, shadow DOM, upload e testo da
                  inventare non sono supportati. Jev può sbagliare: il risultato
                  rimane verificabile nella schermata finale.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
