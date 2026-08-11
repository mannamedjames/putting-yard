// Bundles the app and inlines everything into dist/index.html,
// so the app is one file with no network dependencies.
const esbuild = require("esbuild");
const fs = require("fs");

(async () => {
  await esbuild.build({
    entryPoints: ["src/main.jsx"],
    bundle: true,
    minify: true,
    format: "iife",
    jsx: "automatic",
    target: ["es2020", "safari15", "chrome90"],
    define: { "process.env.NODE_ENV": '"production"' },
    outfile: "build/app.js",
    loader: { ".css": "css" },
    logLevel: "info",
  });

  const js = fs.readFileSync("build/app.js", "utf8");
  const css = fs.readFileSync("build/app.css", "utf8");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Putting Yard</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="description" content="Disc golf putting ladder and 30-shot game tracker.">
<meta name="theme-color" content="#2E6B45">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Putting Yard">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" media="print" onload="this.media='all'"
  href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500;600&display=swap">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
  fs.writeFileSync("dist/index.html", html);
  const kb = (fs.statSync("dist/index.html").size / 1024).toFixed(0);
  console.log(`\ndist/index.html — ${kb} kb, self-contained`);
})();
