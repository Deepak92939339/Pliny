import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const buttonPath = resolve(import.meta.dirname, "../src/components/ui/Button.tsx");
assert.equal(existsSync(buttonPath), true, "Button component must exist at src/components/ui/Button.tsx");

const buttonSource = readFileSync(buttonPath, "utf8");

// 1. Assert all required variants are defined in buttonVariants
const expectedVariants = ["primary", "secondary", "ghost", "destructive", "link"];
for (const variant of expectedVariants) {
  const variantRegex = new RegExp(`\\b${variant}\\s*:`);
  assert.equal(
    variantRegex.test(buttonSource),
    true,
    `Button component must support variant '${variant}'`,
  );
}

// 2. Assert backward compatibility aliases
assert.equal(
  /\bdefault\s*:/.test(buttonSource),
  true,
  "Button must retain 'default' variant alias",
);
assert.equal(
  /\boutline\s*:/.test(buttonSource),
  true,
  "Button must retain 'outline' variant alias",
);

// 3. Assert all required sizes are defined
const expectedSizes = ["sm", "md", "lg"];
for (const size of expectedSizes) {
  const sizeRegex = new RegExp(`\\b${size}\\s*:`);
  assert.equal(
    sizeRegex.test(buttonSource),
    true,
    `Button component must support size '${size}'`,
  );
}

// 4. Assert loading and disabled prop handling
assert.equal(
  /\bloading\s*\?:?\s*boolean/.test(buttonSource),
  true,
  "ButtonProps must declare loading?: boolean",
);
assert.equal(
  /animate-spin/.test(buttonSource),
  true,
  "Button component must render a spinning loader when loading is active",
);
assert.equal(
  /aria-busy=/.test(buttonSource),
  true,
  "Button component must announce aria-busy when loading",
);

// 5. Assert design token alignment (Apple HIG)
assert.equal(
  /var\(--ink-900\)/.test(buttonSource),
  true,
  "Primary button must use ink-900 background per Apple HIG / Pliny spec",
);
assert.equal(
  /rounded-md/.test(buttonSource),
  true,
  "Button component must use rounded-md (--radius-md: 8px)",
);

console.log("Button variants, sizes, and states unit tests passed.");
