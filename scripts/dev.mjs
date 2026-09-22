import { backendCommand, npmCommand, supervise } from "./runtime.mjs";

try {
  supervise([
    backendCommand({ reload: true }),
    npmCommand(["--prefix", "frontend", "run", "dev"]),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
