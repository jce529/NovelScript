/**
 * Platty 0.1.x uses generation run IDs (for example, "gen:...") as folder
 * names. Colons are invalid inside Windows path segments. This preload keeps
 * the database ID intact while making only filesystem path segments safe.
 */
const path = require("node:path");
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");

function safeSegment(value) {
  return typeof value === "string" && !path.win32.isAbsolute(value) && value.includes(":")
    ? value.replaceAll(":", "_")
    : value;
}

const originalJoin = path.join.bind(path);
path.join = (...segments) => originalJoin(...segments.map(safeSegment));

const originalWin32Join = path.win32.join.bind(path.win32);
path.win32.join = (...segments) => originalWin32Join(...segments.map(safeSegment));

// Node's shell-free spawn does not resolve npm's `codex.cmd` shim on Windows.
// Launch the JS entry point with the current Node executable instead.
const codexEntry = "C:/Users/chang/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js";
const originalSpawn = childProcess.spawn.bind(childProcess);
childProcess.spawn = (command, args, options) =>
  command === "codex"
    ? originalSpawn(process.execPath, [codexEntry, ...(args ?? [])], options)
    : originalSpawn(command, args, options);

syncBuiltinESMExports();
