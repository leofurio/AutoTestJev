import { constants, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  findPython,
  npmCommand,
  pythonPath,
  root,
  runCommand,
} from "./runtime.mjs";

try {
  const npm = npmCommand([
    "--prefix",
    "frontend",
    "ci",
    "--no-audit",
    "--no-fund",
  ]);
  if (!existsSync(pythonPath())) {
    const python = findPython();
    console.log("Creazione dell'ambiente Python…");
    await runCommand({
      command: python.command,
      args: [...python.args, "-m", "venv", path.join(root, ".venv")],
    });
  }
  await runCommand({
    command: pythonPath(),
    args: [
      "-c",
      "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)",
    ],
  });
  await runCommand({
    command: pythonPath(),
    args: ["-m", "pip", "install", "-r", "backend/requirements-lock.txt"],
  });
  await runCommand(npm);
  try {
    copyFileSync(
      path.join(root, ".env.example"),
      path.join(root, ".env"),
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await runCommand(npmCommand(["run", "build"]));
  console.log("Pronto. Usa npm start oppure npm run dev.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
