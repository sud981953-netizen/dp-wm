'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {parseInput,prepare,makeHtml,safeName}=require('./order.cjs');
const skillRoot=path.resolve(__dirname,'..');
function option(name) {const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];}
async function launchBrowser() {
  const {chromium}=require('../vendor/playwright-core');
  if(process.env.DP_WM_BROWSER) return chromium.launch({headless:true,executablePath:process.env.DP_WM_BROWSER});
  const failures=[];
  for(const channel of ['chrome','msedge',undefined]) {
    try{return await chromium.launch({headless:true,...(channel?{channel}:{})});}catch(e){failures.push(e.message.split('\n')[0]);}
  }
  throw Error('未找到可用浏览器。请安装 Chrome/Edge，或设置 DP_WM_BROWSER 为浏览器可执行文件路径。'+failures.join('；'));
}
async function main() {
  const inputFile=option('--input'),output=option('--output');
  if(!inputFile || !output) throw Error('用法：node scripts/generate.cjs --input 订单.txt --output 订单根目录 [--validate-only]');
  const raw=fs.readFileSync(path.resolve(inputFile),'utf8');
  const data=parseInput(raw),order=prepare(data);
  if(process.argv.includes('--validate-only')) { console.log(JSON.stringify({ok:true,...order},null,2));return; }
  const template=fs.readFileSync(path.join(skillRoot,'assets','template.html'),'utf8');
  const html=makeHtml(template,order);
  const root=path.resolve(output),folderName=`${order.dates.solar}_${safeName(order.pair.groom)}_${safeName(order.pair.bride)}`;
  const orderDir=path.join(root,order.dates.solar.slice(0,4),folderName);
  const imageName=`${order.dates.solar}_${safeName(order.pair.groom)}.png`;
  const revision=new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','Z')+'-'+crypto.randomBytes(3).toString('hex');
  // Stage under output root; do not touch the previous delivery until rendering succeeds.
  fs.mkdirSync(root,{recursive:true});
  const staging=fs.mkdtempSync(path.join(root,'.dp-wm-'));
  let browser;
  try {
    const metaDir=path.join(staging,'订单资料');fs.mkdirSync(metaDir);
    const htmlPath=path.join(metaDir,'订单确认单.html'),png=path.join(staging,imageName);
    fs.writeFileSync(htmlPath,html,'utf8');
    fs.writeFileSync(path.join(metaDir,'原始输入.txt'),raw,'utf8');
    browser=await launchBrowser();
    const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route(/^https?:\/\//,route=>route.abort());
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#card img')].map(i=>i.decode()));});
    const actual=await page.locator('#card').innerText();
    for(const [selector,wanted] of [['[data-bind="names"]',order.pair.display],['[data-bind="date"]',order.dates.solar.replaceAll('-','.')],['[data-bind="lunar"]',order.dates.display]]) {
      if(await page.locator(selector).innerText()!==wanted) throw Error('页面字段核对失败：'+selector);
    }
    if(/【|待填写|非真实预订/.test(actual)) throw Error('图片仍含样例或占位内容，请核实输入。');
    const balance=await page.locator('#balanceOut').innerText();
    if(Number(balance.replaceAll(',',''))!==Number(order.amounts.remaining)) throw Error('尾款核对失败。');
    if(pageErrors.length) throw Error(pageErrors.join(';'));
    const downloadWait=page.waitForEvent('download',{timeout:60000});
    await page.locator('#export').click();
    const download=await downloadWait;
    await download.saveAs(png);
    const bytes=fs.readFileSync(png);
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('导出结果不是 PNG。');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(width!==1440 || height<1000 || bytes.length<50000) throw Error('导出图片尺寸或内容异常。');
    await page.setViewportSize({width:390,height:844});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('订单内容导致手机页面横向溢出。');
    const checks={version:'1.1.0',generatedAt:new Date().toISOString(),identity:{groom:order.pair.groom,bride:order.pair.bride},...order.dates,depositReceived:order.received,amounts:order.amounts,image:{width,height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},templateSha256:crypto.createHash('sha256').update(template).digest('hex'),checks:{dateRoundTrip:true,balance:true,placeholderFree:true,mobileNoOverflow:true}};
    fs.writeFileSync(path.join(metaDir,'日期与金额核对.json'),JSON.stringify(checks,null,2),'utf8');
    await browser.close();browser=null;
    if(fs.existsSync(orderDir)) {
      const existingMeta=path.join(orderDir,'订单资料','日期与金额核对.json');
      if(!fs.existsSync(existingMeta)) throw Error('目标文件夹已存在但不是 dp-wm 订单，停止覆盖：'+orderDir);
      const existing=JSON.parse(fs.readFileSync(existingMeta,'utf8'));
      if(existing.identity.groom!==order.pair.groom || existing.identity.bride!==order.pair.bride) throw Error('文件名清理后与其他新人重名，停止覆盖。');
      const history=path.join(orderDir,'历史版本',revision);fs.mkdirSync(history,{recursive:true});
      for(const name of [imageName,'订单资料']) {
        const src=path.join(orderDir,name);if(fs.existsSync(src)) fs.cpSync(src,path.join(history,name),{recursive:true,errorOnExist:true,force:false});
      }
    }
    fs.mkdirSync(orderDir,{recursive:true});
    fs.cpSync(metaDir,path.join(orderDir,'订单资料'),{recursive:true});
    fs.copyFileSync(png,path.join(orderDir,imageName));
    console.log(JSON.stringify({ok:true,image:path.join(orderDir,imageName),html:path.join(orderDir,'订单资料','订单确认单.html'),audit:path.join(orderDir,'订单资料','日期与金额核对.json'),solarWedding:order.dates.solar,entryDate:order.dates.entry,remaining:order.amounts.remaining},null,2));
  } finally {
    if(browser) await browser.close();
    // Only remove this invocation's freshly created staging directory.
    if(path.dirname(staging)!==root || !path.basename(staging).startsWith('.dp-wm-')) throw Error('临时路径边界异常。');
    fs.rmSync(staging,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:e.message},null,2));process.exitCode=1;});
