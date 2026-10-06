// Checks on the popup, settings and privacy pages that don't need a browser:
// only local files, no inline scripts, every element the scripts look up is
// really there, and every control has a label.

const test = require("node:test");
const assert = require("node:assert/strict");
const { read, exists, attrs } = require("./helpers");

const PAGES = {
  "popup.html": ["popup.js"],
  "options.html": ["activitylog.js", "options.js"],
  "privacy.html": []
};

const isRemote = (ref) => /^(https?:)?\/\//i.test(ref) || /^data:/i.test(ref);

for (const [page, scripts] of Object.entries(PAGES)) {
  const html = read(page);

  test(page + " loads scripts, styles and images from the extension only", () => {
    const refs = [
      ...attrs(html, "script", "src"),
      ...attrs(html, "link", "href"),
      ...attrs(html, "img", "src"),
      ...attrs(html, "source", "src"),
      ...attrs(html, "iframe", "src")
    ];
    for (const ref of refs) {
      assert.ok(!isRemote(ref), page + " loads a remote file: " + ref);
      assert.ok(exists(ref), page + " points to a missing file: " + ref);
    }
    assert.deepEqual(attrs(html, "script", "src"), scripts);
    assert.doesNotMatch(html, /@import/i);
    assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|cdn\./i);
  });

  test(page + " has no inline scripts or inline event handlers", () => {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[1], /\bsrc="/, "inline script found");
      assert.equal(m[2].trim(), "");
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i);
    assert.doesNotMatch(html, /javascript:/i);
  });

  test(page + " has the basics: language, title, viewport, shared theme", () => {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
    assert.ok(attrs(html, "link", "href").includes("theme.css"));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
  });

  test(page + " has unique ids", () => {
    const ids = attrs(html, "[a-z0-9]+", "id");
    assert.deepEqual(ids.slice().sort(), [...new Set(ids)].sort());
  });

  test(page + " external links open safely", () => {
    for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
      const tag = m[0];
      if (/target="_blank"/.test(tag)) {
        assert.match(tag, /rel="[^"]*noopener/, tag);
      }
      const href = (tag.match(/href="([^"]*)"/) || [])[1] || "";
      if (isRemote(href)) {
        assert.match(href, /^https:\/\/(app|help)\.sparkreceipt\.com\//, "unexpected outside link " + href);
        assert.match(tag, /rel="noopener noreferrer"/, tag);
      }
    }
  });
}

test("every element the popup script looks up exists in popup.html", () => {
  const html = read("popup.html");
  const ids = new Set(attrs(html, "[a-z0-9]+", "id"));
  const wanted = [...read("popup.js").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(wanted.length >= 9);
  for (const id of wanted) assert.ok(ids.has(id), "popup.html is missing #" + id);
});

test("every element the settings script looks up exists in options.html", () => {
  const html = read("options.html");
  const ids = new Set(attrs(html, "[a-z0-9]+", "id"));
  const wanted = [...read("options.js").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(wanted.length >= 12);
  for (const id of wanted) assert.ok(ids.has(id), "options.html is missing #" + id);
});

test("the settings page offers every choice the extension understands", () => {
  const html = read("options.html");
  const values = (name) =>
    [...html.matchAll(new RegExp('<input type="radio" name="' + name + '" value="([^"]+)"', "g"))].map((m) => m[1]);
  assert.deepEqual(values("service"), ["sparkreceipt", "expensify"]);
  assert.deepEqual(values("destination"), ["autodrop", "serviceweb", "gmail", "mailto", "none"]);
  assert.deepEqual(values("format"), ["full", "visible"]);
  for (const id of ["reveal", "closeTab", "deleteLocal", "silent"]) {
    assert.match(html, new RegExp('<input type="checkbox" id="' + id + '"'));
  }
});

test("the popup offers both services and the four SparkReceipt types", () => {
  const html = read("popup.html");
  assert.deepEqual(attrs(html, "option", "value"), ["sparkreceipt", "expensify", "expense", "income", "statement", "other"]);
  // The same four keys the SparkReceipt script knows how to pick
  const spark = read("sparkdrop.js");
  for (const key of ["expense", "income", "statement", "other"]) {
    assert.match(spark, new RegExp("\\b" + key + ": /"));
  }
});

test("every input and select has a real label", () => {
  for (const page of ["popup.html", "options.html"]) {
    const html = read(page);
    const labelBlocks = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((m) => m[0]);
    const labelFor = new Set(attrs(html, "label", "for"));
    const controls = [...html.matchAll(/<(input|select)\b[^>]*>/gi)].map((m) => m[0]);
    assert.ok(controls.length >= 2);
    for (const tag of controls) {
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      const wrapped = labelBlocks.some((block) => block.includes(tag));
      assert.ok(wrapped || (id && labelFor.has(id)), page + ": no label for " + tag);
    }
    // Groups of radio buttons and checkboxes are named with a legend
    const fieldsets = (html.match(/<fieldset\b/g) || []).length;
    const legends = (html.match(/<legend\b/g) || []).length;
    assert.equal(fieldsets, legends);
  }
});

test("status messages are announced to screen readers", () => {
  assert.match(read("popup.html"), /id="status" role="status" aria-live="polite"/);
  assert.match(read("popup.html"), /id="plan" aria-live="polite"/);
  assert.match(read("options.html"), /id="status" role="status" aria-live="polite"/);
  assert.match(read("options.html"), /id="logCount" role="status" aria-live="polite"/);
});

test("decorative images are hidden from screen readers and none are stretched", () => {
  for (const page of Object.keys(PAGES)) {
    for (const m of read(page).matchAll(/<img\b[^>]*>/gi)) {
      assert.match(m[0], /\balt="/, m[0]);
      const w = (m[0].match(/width="(\d+)"/) || [])[1];
      const h = (m[0].match(/height="(\d+)"/) || [])[1];
      assert.ok(w && h && w === h, "icon should keep its square shape: " + m[0]);
    }
  }
});

test("empty states are friendly, not blank", () => {
  assert.match(read("popup.html"), /<p id="empty"><strong>No Grabs Yet<\/strong>/);
  assert.match(read("options.html"), /<p id="logEmpty"><strong>Nothing Logged Yet<\/strong>/);
});

test("settings and privacy pages carry the footer credit", () => {
  for (const page of Object.keys(PAGES)) {
    assert.match(read(page), /Built by Harrison Ward Technology/, page);
  }
});

test("the theme follows the device: dark mode, reduced motion, system font, visible focus", () => {
  const css = read("theme.css");
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /color-scheme: light dark/);
  assert.match(css, /--font: system-ui, -apple-system, "Segoe UI"/);
  assert.match(css, /:focus-visible \{\s*outline: 2px solid var\(--focus\)/);
  assert.doesNotMatch(css, /outline:\s*(none|0)\b/);
  assert.doesNotMatch(css, /https?:/);
  for (const page of Object.keys(PAGES)) {
    assert.doesNotMatch(read(page), /outline:\s*(none|0)\b/, page);
  }
});

test("no text is smaller than 11px and main buttons are at least 44px tall", () => {
  for (const file of ["theme.css", ...Object.keys(PAGES)]) {
    for (const m of read(file).matchAll(/font-size:\s*([\d.]+)px/g)) {
      assert.ok(Number(m[1]) >= 11, file + " has " + m[0]);
    }
  }
  assert.match(read("theme.css"), /\.btn \{[^}]*min-height: 44px;/);
  assert.match(read("theme.css"), /\.field,\s*select\.field \{[^}]*min-height: 44px;/);
  assert.match(read("options.html"), /\.choice \{[^}]*min-height: 44px;/);
});

test("page scripts never build HTML from strings", () => {
  for (const file of ["popup.js", "options.js", "sparkdrop.js", "expensifydrop.js", "background.js", "activitylog.js"]) {
    const src = read(file);
    for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function("]) {
      assert.ok(!src.includes(banned), file + " uses " + banned);
    }
  }
});
