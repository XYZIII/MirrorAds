// Builds the two bookmarklets from local-loader.js. Every non-alphanumeric
// byte is percent-encoded so the lines survive any copy and paste.
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("./local-loader.js", import.meta.url), "utf8");
const enc = (code) =>
  "javascript:" +
  [...new TextEncoder().encode(code)]
    .map((b) =>
      /[A-Za-z0-9]/.test(String.fromCharCode(b))
        ? String.fromCharCode(b)
        : "%" + b.toString(16).toUpperCase().padStart(2, "0"),
    )
    .join("");
const launch = enc(src.replace("__FORCE__", "false"));
const update = enc(src.replace("__FORCE__", "true"));
for (const url of [launch, update]) new Function(decodeURIComponent(url.slice(11)));
const out = (name, text) => writeFileSync(new URL(`./${name}`, import.meta.url), text);
out("mirrorads-bookmark-launch.txt", launch);
out("mirrorads-bookmark-update.txt", update);
console.log(launch.length, update.length);
