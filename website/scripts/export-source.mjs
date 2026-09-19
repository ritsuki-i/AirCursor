import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  ".gitignore", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs",
  "loaders/mediapipe.cjs", "src/app/layout.tsx", "src/app/page.tsx", "src/app/globals.css", "src/app/hero.css", "src/app/icon.svg",
  "src/components/icons.tsx", "src/components/site-header.tsx", "src/components/air-cursor-provider.tsx",
  "src/components/hand-tracking-hero.tsx", "src/components/gravity-field.tsx", "src/lib/gravity.ts",
  "src/lib/particle-field.ts", "src/lib/field-renderer.ts", "src/lib/light-shaders.ts", "src/lib/canvas-field-renderer.ts",
  "src/components/interaction-lab.tsx", "src/components/install-section.tsx",
  "tests/gravity.test.ts", "tests/particle-field.test.ts", "playwright.config.ts", "tests/browser/site.spec.ts",
  "scripts/export-source.mjs", "scripts/capture-reference.mjs",
];
const languages = { ".json": "json", ".ts": "typescript", ".tsx": "tsx", ".mjs": "javascript", ".cjs": "javascript", ".css": "css", ".svg": "xml" };
const sections = await Promise.all(files.map(async file => {
  const source = await readFile(path.join(root, file), "utf8");
  return `## ${file}\n\n\`\`\`${languages[path.extname(file)] || "text"}\n${source.trimEnd()}\n\`\`\`\n`;
}));
await writeFile(path.join(root, "SOURCE.md"), "# AirCursor Website — 全実装コード\n\n実際のファイルをファイル別に収録しています。設計・起動方法は [README.md](./README.md) を参照してください。`package-lock.json` はリポジトリに別途同梱。Next.js が生成する `next-env.d.ts` とビルド出力は収録対象外です。\n\n" + sections.join("\n"), "utf8");
console.log(`SOURCE.md: ${files.length} complete source files exported.`);
