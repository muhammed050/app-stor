import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicPages, origin, pageSchema } from '../shared/seo.mjs';
const output = resolve('node_modules/.cache/eldevo-public.mjs');
await build({entryPoints:['src/public-pages.jsx'],outfile:output,bundle:true,platform:'node',format:'esm',external:['react','react-dom/server','lucide-react'],logLevel:'error'});
const {PublicPage} = await import(pathToFileURL(output));
const template = await readFile('dist/index.html','utf8');
await writeFile('dist/app.html', template);
const escape = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for (const [path,page] of Object.entries(publicPages)) {
  const content = renderToStaticMarkup(createElement(PublicPage,{path}));
  const tags = `<link rel="canonical" href="${origin+path}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="Dorucenie"/><meta property="og:locale" content="ar_AR"/><meta property="og:title" content="${escape(page.title)}"/><meta property="og:description" content="${escape(page.description)}"/><meta property="og:url" content="${origin+path}"/><meta property="og:image" content="${origin}/brand/dorucenie-logo.png"/><meta property="og:image:alt" content="شعار Dorucenie"/><meta name="twitter:card" content="summary"/><script id="site-schema" type="application/ld+json">${JSON.stringify(pageSchema(path)).replaceAll('<','\\u003c')}</script>`;
  const html = template.replace(/<title>.*?<\/title>/s,`<title>${escape(page.title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/,`<meta name="description" content="${escape(page.description)}"/>`).replace('noindex, nofollow','index, follow, max-image-preview:large').replace('</head>',tags+'</head>').replace('<div id="root"></div>',`<div id="root">${content}</div>`);
  const dir=path==='/'?'dist':'dist'+path;
  await mkdir(dir,{recursive:true});
  await writeFile(dir+'/index.html',html);
}
const urls = Object.keys(publicPages).map(path=>`<url><loc>${origin+path}</loc>${path==='/'?`<image:image><image:loc>${origin}/brand/dorucenie-logo.png</image:loc><image:title>شعار Dorucenie — Dorucenie</image:title></image:image>`:''}</url>`).join('\n');
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`);
await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile('dist/404.html',template.replace('<title>Dorucenie — مساحة العمل</title>','<title>الصفحة غير موجودة | Dorucenie</title>').replace('<div id="root"></div>','<div id="root"><main class="fatal"><img src="/brand/dorucenie-mark.webp" alt="Dorucenie" width="64" height="64"/><h1>الصفحة غير موجودة</h1><a href="/" class="button primary">العودة للرئيسية</a></main></div>'));
console.log(`Rendered ${Object.keys(publicPages).length} public pages, sitemap, robots, private shell and 404.`);
