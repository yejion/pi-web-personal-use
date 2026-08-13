const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const from = path.join(root, ".next", "static");
const to = path.join(root, ".next", "standalone", ".next", "static");
console.log("copying", from, "->", to);
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log("done");
