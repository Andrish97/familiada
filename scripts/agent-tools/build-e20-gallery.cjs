const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../tests/test-results/e20-gallery");
const profiles = ["macbook", "ipad-portrait", "ipad-landscape", "iphone-portrait", "iphone-landscape"];
const entries = profiles.flatMap((profile) => {
  const file = path.join(root, `manifest-${profile}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
});
if (!entries.length) throw new Error(`Brak manifestów galerii w ${root}`);

const htmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const groups = profiles.map((profile) => {
  const rows = entries.filter((entry) => entry.profile === profile);
  if (!rows.length) return "";
  return `<section class="profile ${profile}" id="${profile}"><h2>${htmlEscape(rows[0].label)} <small>${rows[0].viewportWidth} CSS px</small></h2><div class="grid">${rows.map((entry) => {
    const guard = entry.guard ? `<b class="guard">${htmlEscape(entry.guard)}</b>` : "";
    const overflow = entry.scrollWidth > entry.viewportWidth ? `<b class="overflow">scroll ${entry.scrollWidth}px</b>` : "";
    return `<article><h3>${htmlEscape(entry.id)} ${guard} ${overflow}</h3><a class="frame ${profile}" href="${htmlEscape(entry.file)}"><img loading="lazy" src="${htmlEscape(entry.file)}" alt="${htmlEscape(entry.id)} ${htmlEscape(entry.label)}"><i aria-hidden="true"></i></a><p>${htmlEscape(entry.url)}</p></article>`;
  }).join("")}</div></section>`;
}).join("");

const output = `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E20 · galeria stron</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#f5f7fb;font:14px/1.45 system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:14px 20px;background:#101828;border-bottom:1px solid #ffffff24}h1{font-size:20px;margin:0 0 10px}nav{display:flex;gap:8px;flex-wrap:wrap}nav a{color:#ffeaa6;text-decoration:none;padding:5px 9px;border:1px solid #ffffff25;border-radius:8px}.profile{padding:22px 20px;border-bottom:1px solid #ffffff20}.profile>h2{margin:0 0 16px;text-transform:capitalize}.profile small{opacity:.6;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:22px;align-items:start}article{min-width:0}h3{font-size:13px;margin:0 0 8px;overflow-wrap:anywhere}.guard,.overflow{display:inline-block;border:1px solid #ffffff25;border-radius:6px;padding:1px 5px;margin-left:5px;font-size:10px;color:#ffeaa6}.overflow{color:#ffacac}.frame{position:relative;display:block;width:fit-content;max-width:100%;background:#030407;border:8px solid #030407;box-shadow:0 9px 30px #0009;overflow:hidden}.frame img{display:block;width:auto;max-width:min(100%,390px);height:auto;max-height:72vh;object-fit:contain;background:#0b1020}.frame.iphone-portrait,.frame.iphone-landscape{border-radius:38px}.frame.iphone-portrait i{position:absolute;top:0;left:50%;transform:translateX(-50%);width:112px;height:25px;border-radius:0 0 17px 17px;background:#030407}.frame.iphone-landscape i{position:absolute;top:50%;left:0;transform:translateY(-50%);width:25px;height:112px;border-radius:0 17px 17px 0;background:#030407}.frame.ipad-portrait,.frame.ipad-landscape{border-radius:26px}.frame.ipad-portrait i,.frame.ipad-landscape i{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);width:36px;height:4px;border-radius:4px;background:#ffffff80}.frame.macbook{border-radius:8px}.frame.macbook img{max-width:100%;max-height:65vh}article p{max-width:390px;color:#9ba6b9;font-size:11px;overflow-wrap:anywhere;margin:7px 0 0}@media(max-width:640px){header{padding:12px}.profile{padding:16px 12px}.grid{grid-template-columns:1fr}.frame img{max-height:74vh}}
</style><header><h1>E20 · zrzuty z prawdziwych stron i bazy</h1><nav>${profiles.filter((p)=>entries.some((entry)=>entry.profile===p)).map((p)=>`<a href="#${p}">${p}</a>`).join("")}</nav></header><main>${groups}</main></html>`;
fs.writeFileSync(path.join(root, "index.html"), output);
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), count: entries.length, profiles, pages: [...new Set(entries.map((entry) => entry.id))], entries }, null, 2));
console.log(`Wygenerowano galerię: ${entries.length} zrzutów, ${new Set(entries.map((entry) => entry.id)).size} stron.`);
