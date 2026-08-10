const fs = require("fs");
const path = require("path");
const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const parts = pkg.version.split("-")[0].split(".").map(Number);
parts[2]++;
pkg.version = parts.join(".");
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "
");
console.log(pkg.version);
