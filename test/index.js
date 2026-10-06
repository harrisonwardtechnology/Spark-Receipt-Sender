// Lets `node --test test/` work. Node 22 treats a folder argument as a module
// to load, so this file loads every *.test.js next to it.
// One test file on its own still works: node --test test/manifest.test.js

const fs = require("node:fs");
const path = require("node:path");

fs.readdirSync(__dirname)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .forEach((name) => require(path.join(__dirname, name)));
