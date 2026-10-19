// Merge conflict resolver helper. Usage:
//   node scripts/merge-resolve.mjs list <file>
//   node scripts/merge-resolve.mjs take <ours|theirs|both> <file...>
//   node scripts/merge-resolve.mjs apply <file> <spec.json>
// The spec.json is an array of "ours" | "theirs" | "both" in conflict order.
import { readFileSync, writeFileSync } from "node:fs";

const MARKER = /^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n?/gm;

function read(path) {
  return readFileSync(path, "utf8");
}

function parse(src) {
  const conflicts = [];
  let last = 0;
  let out = "";
  MARKER.lastIndex = 0;
  let m;
  while ((m = MARKER.exec(src))) {
    out += src.slice(last, m.index);
    conflicts.push({ ours: m[1], theirs: m[2], start: out.length, raw: m[0] });
    out += m[0];
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  return { conflicts, full: src };
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "list") {
  const file = args[0];
  const { conflicts } = parse(read(file));
  console.log(`${file}: ${conflicts.length} conflict(s)`);
  conflicts.forEach((c, i) => {
    const o = c.ours.trim().split("\n").length;
    const t = c.theirs.trim().split("\n").length;
    console.log(`--- #${i} ours=${o} lines theirs=${t} lines`);
    console.log(
      "OURS>",
      c.ours
        .split("\n")
        .slice(0, 6)
        .map((l) => l.trim())
        .join(" | ")
        .slice(0, 240),
    );
    console.log(
      "THEIRS>",
      c.theirs
        .split("\n")
        .slice(0, 6)
        .map((l) => l.trim())
        .join(" | ")
        .slice(0, 240),
    );
  });
} else if (cmd === "take") {
  const strategy = args[0];
  for (const file of args.slice(1)) {
    const src = read(file);
    const { conflicts } = parse(src);
    if (!conflicts.length) {
      console.log(`skip (no conflicts): ${file}`);
      continue;
    }
    const replacement = (c) =>
      strategy === "ours" ? c.ours : strategy === "theirs" ? c.theirs : c.ours + c.theirs;
    let result = "";
    let last = 0;
    MARKER.lastIndex = 0;
    let m;
    while ((m = MARKER.exec(src))) {
      result += src.slice(last, m.index);
      result += replacement({ ours: m[1], theirs: m[2] });
      last = m.index + m[0].length;
    }
    result += src.slice(last);
    writeFileSync(file, result);
    console.log(`resolved(${strategy}) ${file}: ${conflicts.length}`);
  }
} else if (cmd === "apply") {
  const file = args[0];
  const choices = JSON.parse(read(args[1]));
  const src = read(file);
  const { conflicts } = parse(src);
  if (choices.length !== conflicts.length) {
    console.error(
      `mismatch: ${file} has ${conflicts.length} conflicts, spec has ${choices.length}`,
    );
    process.exit(1);
  }
  let result = "";
  let last = 0;
  MARKER.lastIndex = 0;
  let m;
  let i = 0;
  while ((m = MARKER.exec(src))) {
    result += src.slice(last, m.index);
    const c = choices[i++];
    result += c === "ours" ? m[1] : c === "theirs" ? m[2] : m[1] + m[2];
    last = m.index + m[0].length;
  }
  result += src.slice(last);
  writeFileSync(file, result);
  console.log(`applied ${file}: ${conflicts.length}`);
} else {
  console.error("unknown command");
  process.exit(1);
}
