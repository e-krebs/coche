#!/usr/bin/env node
// PreToolUse hook (Edit|Write): nudges toward the convention skill(s) for the edited file's path.
// Hooks can't invoke a skill directly, so this only injects a reminder for the model to act on.

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  // file_path is absolute, so directory checks match anywhere in the path, not just at its start.
  let tool_input;
  try {
    tool_input = JSON.parse(input).tool_input;
  } catch {
    return done();
  }
  const path = tool_input?.file_path ?? "";

  if (path.endsWith("routeTree.gen.ts")) return done();

  const skills = [];
  if (/\.(ts|tsx)$/.test(path)) skills.push("code-style");
  if (/\/src\/client\/.*\.tsx$/.test(path)) skills.push("styling");
  if (/\.test\.tsx?$/.test(path) || /\/__tests__\//.test(path) || /\/e2e\//.test(path)) {
    skills.push("testing");
  }
  if (/\/docs\//.test(path)) skills.push("diataxis-docs");

  if (skills.length === 0) return done();

  const list = skills.map((s) => `\`${s}\``).join(", ");
  done(`Editing ${path} — follow the ${list} skill(s) for this repo's conventions.`);
});

function done(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      ...(additionalContext && { additionalContext }),
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
