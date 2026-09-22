import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  backendCommand,
  findPython,
  npmCommand,
  pythonCandidates,
  pythonPath,
  runCommand,
  windowsStopCommand,
} from "./runtime.mjs";

test("Windows venv resolves correctly inside a path with spaces", () => {
  assert.equal(
    pythonPath("win32", "C:\\Users\\Test User\\AutoTestJav"),
    "C:\\Users\\Test User\\AutoTestJav\\.venv\\Scripts\\python.exe",
  );
  assert.equal(
    pythonPath("darwin", "/Users/Test User/AutoTestJav"),
    "/Users/Test User/AutoTestJav/.venv/bin/python",
  );
});

test("Python discovery falls back after an unavailable launcher or an old interpreter", () => {
  const commands = [];
  const result = findPython({
    candidates: pythonCandidates("win32", ""),
    probe(command, args, options) {
      commands.push(command);
      assert.equal(options.shell, false);
      assert.ok(args.includes("-c"));
      if (command === "py") return { error: new Error("ENOENT") };
      return { status: command === "python3" ? 0 : 1 };
    },
  });
  assert.deepEqual(commands, ["py", "python", "python3"]);
  assert.equal(result.command, "python3");
});

test("Python discovery fails clearly if no supported version exists", () => {
  assert.throws(
    () =>
      findPython({
        candidates: [{ command: "python", args: [] }],
        probe: () => ({ status: 1 }),
      }),
    /Python 3.11/,
  );
});

test("explicit Python path is a single executable argument", () => {
  assert.deepEqual(
    pythonCandidates("win32", "C:\\Program Files\\Python\\python.exe"),
    [{ command: "C:\\Program Files\\Python\\python.exe", args: [] }],
  );
});

test("npm is invoked through Node rather than npm.cmd", () => {
  const cli = process.env.npm_execpath;
  const spec = npmCommand(["--prefix", "frontend", "run", "dev"], cli);
  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args, [cli, "--prefix", "frontend", "run", "dev"]);
});

test("backend reload keeps the custom subprocess-compatible loop", () => {
  const spec = backendCommand({ reload: true, port: 8012 });
  assert.ok(spec.args.includes("--reload"));
  assert.equal(
    spec.args[spec.args.indexOf("--loop") + 1],
    "autojav.event_loop:create_loop",
  );
  assert.equal(spec.args[spec.args.indexOf("--port") + 1], "8012");
});

test("a failed child command rejects instead of continuing setup", async () => {
  await assert.rejects(
    runCommand(
      { command: "python", args: [] },
      {
        launch() {
          const child = new EventEmitter();
          queueMicrotask(() => child.emit("close", 7, null));
          return child;
        },
      },
    ),
    /7/,
  );
});

test("Windows shutdown targets only a known positive process ID and its descendants", () => {
  assert.deepEqual(windowsStopCommand(123), {
    command: "taskkill.exe",
    args: ["/PID", "123", "/T", "/F"],
  });
  assert.throws(() => windowsStopCommand(0));
  assert.throws(() => windowsStopCommand(-1));
});

test("real child process preserves spaces and shell metacharacters in paths and arguments", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "autojev runtime "));
  try {
    const script = path.join(directory, "child script.mjs");
    const output = path.join(directory, "output value.txt");
    const value = 'dato con spazi & $(nessun_comando) "virgolette"';
    writeFileSync(
      script,
      'import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2], process.argv[3]);',
    );
    await runCommand({
      command: process.execPath,
      args: [script, output, value],
    });
    assert.equal(readFileSync(output, "utf8"), value);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
