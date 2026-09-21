import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = `${root}.venv/${process.platform === "win32" ? "Scripts/python.exe" : "bin/python"}`;
if (!existsSync(python)) {
  console.error("Ambiente Python mancante. Esegui prima npm run setup.");
  process.exit(1);
}
const children = [
  spawn(
    python,
    [
      "-m",
      "uvicorn",
      "autojav.main:app",
      "--app-dir",
      "backend",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
      "--reload",
    ],
    { cwd: root, stdio: "inherit" },
  ),
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["--prefix", "frontend", "run", "dev"],
    { cwd: root, stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
});
