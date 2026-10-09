const { test, expect } = require("./helpers/production-test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const L = require("./helpers/logo-editor");

const ORIGIN = "https://www.familiada.online";
test.use({ serviceWorkers: "block" });
test.setTimeout(300_000);

const auditPage = `<!doctype html><meta charset="utf-8"><title>Porównanie Fabric / Host SVG</title>
<style>body{margin:0;padding:16px;background:#11141b;color:#eee;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{min-width:0;background:#1b1e26;border:1px solid #383d49;border-radius:9px;padding:9px}.title{font-weight:800;margin-bottom:4px}.stats{font:11px ui-monospace,monospace;color:#b9c0cc;margin-bottom:6px}.pair{position:relative;aspect-ratio:26/11;background:#050609;overflow:hidden}.pair img,.pair canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.pair .host{opacity:.5}.diff{display:block;width:100%;aspect-ratio:26/11;background:#050609;margin-top:4px}.legend{color:#b9c0cc;margin:0 0 12px}.legend b{color:#fc0}</style>
<p class="legend"><b>Nałożenie:</b> raster z Fabric i wynik SVG Hosta nałożone z przezroczystością 50%. <b>Magenta:</b> różnice w masce przezroczystości.</p><div class="grid" id="grid"></div>
<iframe id="host" title="Host" src="/control/host/?preview=1" style="position:fixed;left:-200vw;width:1280px;height:720px"></iframe>
<script>window.ready=false;window.items=[];addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='familiada:host-preview-ready')window.ready=true});window.setLogo=async logo=>{const frame=document.getElementById('host'),previous=frame.contentDocument?.querySelector('#cover2Logo img')?.src;const row={top_card:'rounds',step:'r_intro',phase:null,control_team:null,sound_cue_key:null,sound_cue_seq:0,detail:{teams:{teamA:'Drużyna A',teamB:'Drużyna B'},rounds:{roundNo:1,bankPts:0,xA:0,xB:0,totals:{A:0,B:0}},final:{runtime:{}},display:{mode:'GAME',colors:{A:'#c4002f',B:'#2a62ff',DOT:'#d7ff3d'},theme:'modern',logoId:'svg-audit-'+logo.name,hostLogoMode:'source',logoPreview:logo},host:{covered:true},locks:{gameEnded:false}}};frame.contentWindow.postMessage({type:'familiada:preview-row',row},location.origin);for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));const image=frame.contentDocument?.querySelector('#cover2Logo img');if(image?.complete&&image.naturalWidth&&image.src!==previous)return image.src}throw new Error('Host nie wyrenderował nowego logo DRAW')} ;window.addItems=async items=>{const grid=document.getElementById('grid');for(const item of items){const hostSrc=await window.setLogo(item.logo);if(!hostSrc.startsWith('data:image/svg+xml'))throw new Error('Host nie użył przezroczystego SVG dla logo bez PNG');const card=document.createElement('article');card.className='card';const title=document.createElement('div');title.className='title';title.textContent=item.name;const stats=document.createElement('div');stats.className='stats';const pair=document.createElement('div');pair.className='pair';const ref=new Image();ref.src=item.reference;await ref.decode();const host=new Image();host.className='host';host.src=hostSrc;await host.decode();pair.append(ref,host);const diff=document.createElement('canvas');diff.className='diff';diff.width=1280;diff.height=541;const ctx=diff.getContext('2d',{willReadFrequently:true});ctx.drawImage(ref,0,0,1280,541);const a=ctx.getImageData(0,0,1280,541).data;ctx.clearRect(0,0,1280,541);ctx.drawImage(host,0,0,1280,541);const b=ctx.getImageData(0,0,1280,541).data;const out=ctx.createImageData(1280,541);let changed=0,alphaFabric=0,alphaHost=0;for(let i=0;i<a.length;i+=4){alphaFabric+=a[i+3];alphaHost+=b[i+3];const delta=Math.abs(a[i+3]-b[i+3]);if(delta>32){changed++;out.data[i]=255;out.data[i+1]=0;out.data[i+2]=180;out.data[i+3]=Math.min(255,delta*2)}}ctx.putImageData(out,0,0);stats.textContent='Różne piksele alpha > 32: '+changed+' ('+(changed/(1280*541)*100).toFixed(2)+'%) · suma alpha SVG/Fabric: '+(alphaHost/Math.max(alphaFabric,1)).toFixed(3);card.append(title,stats,pair,diff);grid.append(card)}};</script>`;

function makeShapeSource(canvasInfo) {
  const source = `async ({width,height})=>{const canvas=window.__drawFabric,f=window.fabric;if(!canvas||!f)throw new Error('Brak canvasa edytora DRAW');const {SHAPES,buildShapePath}=await import('/logo/js/draw/shapes.js');const extra=['strokeUniform','strokeDashArray','strokeLineCap','strokeLineJoin','_line'];const x1=width*.18,y1=height*.24,x2=width*.82,y2=height*.76,w=x2-x1,h=y2-y1;const cases=[];const fabricPng=async json=>{const el=document.createElement('canvas');el.width=width;el.height=height;const staticCanvas=new f.StaticCanvas(el,{width,height,renderOnAddRemove:false,enableRetinaScaling:false});await new Promise((resolve,reject)=>{try{staticCanvas.loadFromJSON(json,resolve)}catch(error){reject(error)}});staticCanvas.renderAll();const url=el.toDataURL('image/png');staticCanvas.dispose();return url};const remove=()=>{canvas.getObjects().slice().forEach(o=>canvas.remove(o));canvas.discardActiveObject();canvas.backgroundColor='#000'};const addShape=(id,stroke,filled)=>{const shape=SHAPES.find(s=>s.id===id);const common={stroke:'#fff',strokeWidth:stroke,strokeUniform:true,strokeLineCap:'round',strokeLineJoin:'round',fill:'transparent',objectCaching:false};if(id==='line'||id.startsWith('arrow')){const path=buildShapePath(id,x1,y1,x2,y2,stroke);return new f.Path(path,{...common,fill:filled?'#fff':'transparent'})}if(id==='rect')return new f.Rect({...common,left:x1,top:y1,width:w,height:h,fill:filled?'#fff':'transparent'});if(id==='roundRect')return new f.Rect({...common,left:x1,top:y1,width:w,height:h,rx:Math.min(20,w/2,h/2),ry:Math.min(20,w/2,h/2),fill:filled?'#fff':'transparent'});if(id==='ellipse')return new f.Ellipse({...common,left:x1,top:y1,rx:w/2,ry:h/2,fill:filled?'#fff':'transparent'});let path=buildShapePath(id,x1,y1,x2,y2,stroke);if(id==='polygon')path='M '+x1+' '+y1+' L '+(x1+w*.75)+' '+(y1+h*.12)+' L '+x2+' '+(y1+h*.76)+' L '+(x1+w*.30)+' '+y2+' Z';return new f.Path(path,{...common,fill:filled?'#fff':'transparent'})};const save=async(name,objects)=>{remove();for(const object of objects)canvas.add(object);canvas.requestRenderAll();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const fabricData=canvas.toJSON(extra);const reference=await fabricPng(fabricData);cases.push({name,logo:{name,type:'PIX_150x70',payload:{w:150,h:70,format:'BITPACK_MSB_FIRST_ROW_MAJOR',bits_b64:'AA==',source:{mode:'DRAW',bg:'BLACK',world:{w:width,h:height},fabricData}}},reference})};for(const shape of SHAPES){for(const stroke of [6,20]){await save(shape.id+' / kontur '+stroke,[addShape(shape.id,stroke,false)]);if(shape.hasFill)await save(shape.id+' / wypełnienie '+stroke,[addShape(shape.id,stroke,true)])}}const brush=new f.Path('M '+(width*.12)+' '+(height*.45)+' Q '+(width*.24)+' '+(height*.1)+' '+(width*.38)+' '+(height*.48)+' T '+(width*.86)+' '+(height*.58),{fill:'',stroke:'#fff',strokeWidth:34,strokeUniform:true,strokeLineCap:'round',strokeLineJoin:'round'});await save('PĘDZEL / ślad odręczny', [brush]);const text=new f.IText('FAMILIADA 123',{left:width*.12,top:height*.28,fontFamily:'Arial',fontSize:100,fontWeight:700,fill:'#fff',stroke:'#fff',strokeWidth:0});await save('TEKST / IText', [text]);const imageCanvas=document.createElement('canvas');imageCanvas.width=180;imageCanvas.height=130;const imageContext=imageCanvas.getContext('2d');imageContext.fillStyle='#fff';imageContext.fillRect(0,0,180,130);imageContext.fillStyle='#000';imageContext.fillRect(55,35,70,60);imageContext.fillStyle='#fff';imageContext.beginPath();imageContext.arc(90,65,22,0,Math.PI*2);imageContext.fill();const image=new f.Image(imageCanvas,{left:width*.32,top:height*.22,scaleX:2.1,scaleY:1.4,angle:13,imageSmoothing:true});await save('OBRAZ / obrót, skala, przezroczystość', [image]);const layers=[new f.Rect({left:width*.08,top:height*.14,width:width*.68,height:height*.70,fill:'#fff',stroke:null}),new f.Rect({left:width*.24,top:height*.27,width:width*.30,height:height*.40,fill:'#000',stroke:'#000',strokeWidth:12,strokeUniform:false,angle:-7}),new f.Circle({left:width*.37,top:height*.32,radius:height*.15,fill:'#fff',stroke:'#000',strokeWidth:20,strokeUniform:true}),new f.Path('M '+(width*.48)+' '+(height*.80)+' L '+(width*.76)+' '+(height*.20)+' L '+(width*.94)+' '+(height*.82)+' Z',{fill:'transparent',stroke:'#fff',strokeWidth:22,strokeUniform:true,strokeLineJoin:'round'}),new f.Path('M '+(width*.10)+' '+(height*.62)+' Q '+(width*.35)+' '+(height*.1)+' '+(width*.58)+' '+(height*.6),{fill:'',stroke:'#000',strokeWidth:16,strokeDashArray:[32,12],strokeUniform:false,scaleX:1.1,angle:4}),new f.Path('M '+(width*.54)+' '+(height*.72)+' L '+(width*.91)+' '+(height*.34),{fill:'',stroke:'#fff',strokeWidth:9,strokeDashArray:[18,8],strokeUniform:true,strokeLineCap:'round'})];await save('NAŁOŻENIA / wycięcie, przywrócenie, obrysy i przekształcenia',layers);return cases}`;
  return new Function(`return (${source})`)();
}

test("DRAW: każda figura i nakładanie warstw — Canvas Fabric kontra przezroczysty SVG Hosta", async ({ page, context }, testInfo) => {
  await serveBranchCode(context, { pages: ["logo", "host"] });
  await loginAsTestUser(page, context, { username: "test9@familiada.online" });
  const name = `E2E-SVG-FABRIC-${Date.now()}`;
  let logoId;
  try {
    logoId = await L.insertLogo(page, { name, type: "PIX_150x70", payload: { w: 150, h: 70, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64: Buffer.alloc(19 * 70).toString("base64"), source: { mode: "DRAW" } } });
    await page.goto(`${ORIGIN}/logo/editor/draw/?id=${encodeURIComponent(logoId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#editorShell")).toHaveAttribute("data-mode", "DRAW");
    await expect(page.locator("#logoName")).toBeEnabled({ timeout: 20_000 });
    const width = await page.evaluate(() => window.__drawFabric?.getWidth());
    const height = await page.evaluate(() => window.__drawFabric?.getHeight());
    const cases = await page.evaluate(makeShapeSource(), { width, height });
    expect(cases.length).toBeGreaterThan(35);
    expect(cases.every(item => !item.logo.payload.source.hostRasterUrl && !item.logo.payload.source.hostRasterData)).toBe(true);
    const fabricScreenshot = await page.locator("#drawStage").screenshot();
    const fabricShotPath = testInfo.outputPath("shot-draw-fabric-editor-layered.png");
    await fs.mkdir(path.dirname(fabricShotPath), { recursive: true });
    await fs.writeFile(fabricShotPath, fabricScreenshot);
    await testInfo.attach("draw-fabric-editor-layered-scene.png", { body: fabricScreenshot, contentType: "image/png" });

    // Persist the final layered scene as a legacy row without a PNG, then
    // leave the editor and exercise the real Host source renderer.
    const layered = cases.at(-1).logo;
    const { error } = await page.evaluate(async ({ id, logo }) => {
      const { error } = await window.__sbClient.from("user_logos").update({ payload: logo.payload }).eq("id", id);
      return { error: error?.message || null };
    }, { id: logoId, logo: layered });
    expect(error).toBeNull();

    await page.evaluate(async id => {
      const { error } = await window.__sbClient.from("user_logos").delete().eq("id", id);
      if (error) throw new Error(error.message);
    }, logoId);
    logoId = null;

    await page.route(`${ORIGIN}/__host_svg_fabric_audit`, route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: auditPage }));
    await page.goto(`${ORIGIN}/__host_svg_fabric_audit`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.ready, null, { timeout: 25_000 });
    await page.evaluate(items => window.addItems(items), cases);
    const comparisonScreenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
    const comparisonShotPath = testInfo.outputPath("shot-draw-fabric-vs-host-svg.png");
    await fs.mkdir(path.dirname(comparisonShotPath), { recursive: true });
    await fs.writeFile(comparisonShotPath, comparisonScreenshot);
    await testInfo.attach("draw-fabric-vs-host-svg-overlay.png", { body: comparisonScreenshot, contentType: "image/png" });
    const details = await page.locator(".card").evaluateAll(cards => cards.map(card => ({
      name: card.querySelector(".title")?.textContent || "",
      metrics: card.querySelector(".stats")?.textContent || "",
    })));
    console.log("DRAW Fabric/Host SVG comparison:", JSON.stringify(details));
    await testInfo.attach("draw-fabric-vs-host-svg-metrics.json", { body: JSON.stringify(details, null, 2), contentType: "application/json" });
    const worstDiff = Math.max(...details.map(({ metrics }) => Number(metrics.match(/\((\d+\.\d+)%\)/)?.[1] || 0)));
    expect(worstDiff, `Największa różnica alpha: ${worstDiff}%`).toBeLessThan(8);
  } finally {
    if (logoId) await page.evaluate(async id => {
      const sb = window.__sbClient;
      const { data } = await sb.from("user_logos").select("payload").eq("id", id).maybeSingle();
      const paths = [data?.payload?.source?.hostRasterUrl].filter(Boolean).map(url => String(url).split("/user-logos/")[1]?.split("?")[0]).filter(Boolean);
      if (paths.length) await sb.storage.from("user-logos").remove(paths);
      await sb.from("user_logos").delete().eq("id", id);
    }, logoId).catch(() => {});
  }
});
