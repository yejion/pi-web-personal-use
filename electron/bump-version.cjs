const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

// Get latest release version from GitHub; fall back to package.json version.
let latest = pkg.version.split("-")[0];
try {
  const out = execSync(
    'gh release list --limit 1 --json tagName --jq ".[0].tagName"',
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
  if (out) {
    latest = out.replace(/^v/, "").split("-")[0];
  }
} catch {
  // gh not available or no releases yet — use package.json version.
}

const parts = latest.split(".").map(Number);
parts[2]++;
const newVersion = parts.join(".");

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + os.EOL, "utf8");
console.log(newVersion);
