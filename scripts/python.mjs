import { pythonCommand, supervise } from "./runtime.mjs";

try {
  if (!process.argv[2])
    throw new Error("Specifica gli argomenti Python dopo --.");
  supervise([pythonCommand(process.argv.slice(2))]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
