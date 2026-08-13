console.log("line1");
const fs = require("fs");
console.log("fs ok");
const path = require("path");
console.log("path ok");
const root = path.join(__dirname, "..");
console.log("root:", root);
const standalone = path.join(root, ".next", "standalone");
console.log("exists:", fs.existsSync(path.join(standalone, "server.js")));
