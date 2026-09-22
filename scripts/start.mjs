import { existsSync } from "node:fs";
import path from "node:path";
import { backendCommand, root, supervise } from "./runtime.mjs";

try {
  if (!existsSync(path.join(root, "frontend", "dist", "index.html"))) {
    throw new Error(
      "Frontend non compilato. Esegui npm run setup oppure npm run build.",
    );
  }
  supervise([backendCommand()]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
