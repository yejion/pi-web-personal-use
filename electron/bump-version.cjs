const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

// Get the highest version from all GitHub releases; fall back to package.json.
let baseVersion = pkg.version.split("-")[0];
try {
  const out = execSync('gh release list --limit 50 --json tagName --jq ".[].tagName"', {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const tags = out.trim().split("\n").filter(Boolean).map((t) => t.replace(/^v/, "").split("-")[0]);
  let max = baseVersion.split(".").map(Number);
  for (const t of tags) {
    const parts = t.split(".").map(Number);
    if (parts.length === 3) {
      // compare: patch > minor > major
      if (
        parts[0] > max[0] ||
        (parts[0] === max[0] && parts[1] > max[1]) ||
        (parts[0] === max[0] && parts[1] === max[1] && parts[2] > max[2])
      ) {
        max = parts;
      }
    }
  }
  max[2]++;
  baseVersion = max.join(".");
} catch {
  // fallback: just bump package.json version
  const p = baseVersion.split(".").map(Number);
  p[2]++;
  baseVersion = p.join(".");
}

pkg.version = baseVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + os.EOL, "utf8");
console.log(baseVersion);
