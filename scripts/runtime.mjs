import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

export function pythonPath(platform = process.platform, directory = root) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  return paths.join(
    directory,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python",
  );
}

export function pythonCandidates(
  platform = process.platform,
  override = process.env.AUTOJEV_PYTHON,
) {
  if (override) return [{ command: override, args: [] }];
  return platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
}

export function findPython({
  candidates = pythonCandidates(),
  probe = spawnSync,
} = {}) {
  for (const candidate of candidates) {
    const result = probe(
      candidate.command,
      [
        ...candidate.args,
        "-c",
        "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)",
      ],
      {
        cwd: root,
        stdio: "ignore",
        timeout: 15000,
        windowsHide: true,
        shell: false,
      },
    );
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error(
    "Python 3.11+ non trovato. Installa Python oppure imposta AUTOJEV_PYTHON al percorso di python.exe.",
  );
}

export function pythonEnv(env = process.env) {
  return {
    ...env,
    PYTHONUTF8: "1",
    PYTHONPATH: [path.join(root, "backend"), env.PYTHONPATH]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

export function pythonCommand(args) {
  const command = pythonPath();
  if (!existsSync(command))
    throw new Error(
      "Ambiente Python mancante. Esegui prima npm run setup su questo computer.",
    );
  return { command, args };
}

export function npmCommand(
  args,
  npmCli = process.env.npm_execpath,
  node = process.execPath,
) {
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error(
      "Avvia questo comando tramite npm, per esempio npm run setup.",
    );
  }
  // Run npm's JavaScript entrypoint: .cmd files are not native executables on Windows.
  return { command: node, args: [npmCli, ...args] };
}

export function backendCommand({ reload = false, port = 8000 } = {}) {
  return pythonCommand([
    "-m",
    "uvicorn",
    "autojav.main:app",
    "--app-dir",
    "backend",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--loop",
    "autojav.event_loop:create_loop",
    ...(reload ? ["--reload"] : []),
  ]);
}

export function runCommand(spec, { launch = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = launch(spec.command, spec.args, {
      cwd: root,
      env: pythonEnv(),
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Comando non riuscito (${signal || code}): ${path.basename(spec.command)}`,
          ),
        );
    });
  });
}

export function windowsStopCommand(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("PID del processo non valido.");
  return { command: "taskkill.exe", args: ["/PID", String(pid), "/T", "/F"] };
}

export function supervise(specs) {
  const children = [];
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null)
        continue;
      if (process.platform === "win32") {
        const task = windowsStopCommand(child.pid);
        const result = spawnSync(task.command, task.args, {
          stdio: "ignore",
          windowsHide: true,
          timeout: 10000,
        });
        if (result.error || result.status !== 0) child.kill();
      } else {
        child.kill("SIGTERM");
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
        }, 10000);
        timer.unref();
      }
    }
  };
  process.once("SIGINT", () => stop());
  process.once("SIGTERM", () => stop());
  for (const spec of specs) {
    const child = spawn(spec.command, spec.args, {
      cwd: root,
      env: pythonEnv(),
      stdio: "inherit",
      shell: false,
    });
    children.push(child);
    child.once("error", (error) => {
      console.error(error.message);
      stop(1);
    });
    child.once("exit", (code, signal) => stop(code ?? (signal ? 1 : 0)));
  }
}
