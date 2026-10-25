'use strict';
// Data preparation is separate from rendering, so invalid orders never create a delivery image.
const fs = require('node:fs');
const path = require('node:path');
const { Lunar, LunarYear, Solar } = require('../vendor/lunar-javascript');
const REQUIRED = ['农历婚期','新人姓名','客户联系方式','婚礼地点','当天现场对接人','现场对接人电话','订单总金额 / 元','已收定金 / 元','收款日期'];
const aliases = {'定金收款日期':'收款日期','订单总金额':'订单总金额 / 元','已收定金':'已收定金 / 元'};
function fail(message) { throw new Error(message); }
function parseInput(text) {
  text = text.replace(/^\uFEFF/, '').trim();
  if (text.startsWith('{')) {
    const obj = JSON.parse(text);
    if (!obj || Array.isArray(obj) || typeof obj !== 'object') fail('订单 JSON 必须是对象。');
    const result = {};
    for (const [key,value] of Object.entries(obj)) assign(result,key,value);
    return result;
  }
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\/dp-wm\s*$/.test(line.trim())) continue;
    const m = line.match(/^\s*([^:：]+)[:：]\s*(.*?)\s*$/);
    if (!m) fail(`无法识别这一行，请使用“字段：内容”：${line}`);
    assign(result,m[1],m[2]);
  }
  return result;
}
function assign(obj,key,value) {
  key=key.trim().replace(/\s*\/\s*元$/, ' / 元');
  key=aliases[key] || key;
  if (![...REQUIRED,'阳历婚期','约定进场时间','新郎姓名','新娘姓名'].includes(key)) fail(`不支持的字段：${key}。请勿默默忽略用户的补充要求。`);
  if (key in obj) fail(`字段重复：${key}`);
  if (typeof value!=='string' && typeof value!=='number') fail(`字段必须是文字或数字：${key}`);
  obj[key]=String(value).trim();
}
function chineseNumber(raw) {
  let s=raw.replace(/^初/,'').replace('廿','二十').replace('卅','三十').replace('正','一').replace(/[腊臘]/,'十二').replace('冬','十一');
  if (/^\d+$/.test(s)) return Number(s);
  const nums={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if (/^[〇零一二三四五六七八九]{4}$/.test(s)) return Number([...s].map(c=>nums[c]).join(''));
  if (s==='十') return 10;
  if (s.includes('十')) {
    const [a,b]=s.split('十');
    if ((a && nums[a]===undefined)||(b && nums[b]===undefined)) fail(`无法识别日期数字：${raw}`);
    return (a?nums[a]:1)*10+(b?nums[b]:0);
  }
  if (nums[s]!==undefined) return nums[s];
  fail(`无法识别日期数字：${raw}`);
}
function lunarDate(value) {
  let s=value.normalize('NFKC').replace(/\s/g,'').replace(/^农历/,'');
  const explicitlyNormal=/非闰月|非閏月|普通月/.test(s);
  s=s.replace(/[（(]?(非闰月|非閏月|普通月)[）)]?/g,'');
  // A year is mandatory: do not infer "the next occurrence" or Gregorian year.
  let m=s.match(/^([0-9〇零一二三四五六七八九]{4})年([闰閏]?)([0-9一二三四五六七八九十正冬腊臘]+)月([0-9一二三四五六七八九十初廿卅]+)[日号]?$/);
  if (!m) m=s.match(/^(\d{4})[-/.]([闰閏]?)(\d{1,2})[-/.](\d{1,2})$/);
  if (!m) fail('农历婚期请写完整农历年份、月份、日期，例如“2026年九月廿二”；闰月须写“闰”。');
  const year=chineseNumber(m[1]), month=chineseNumber(m[3]), day=chineseNumber(m[4]), leap=!!m[2];
  if (year<1901 || year>2099 || month<1 || month>12 || day<1 || day>30) fail('农历日期超出支持范围或无效（农历年 1901—2099）。');
  const leapMonth=LunarYear.fromYear(year).getLeapMonth();
  if (leap && explicitlyNormal) fail('农历月份同时标注闰月和非闰月，请核实。');
  if (leap && leapMonth!==month) fail(`${year}年没有闰${month}月，请核实农历日期。`);
  if (!leap && !explicitlyNormal && leapMonth===month) fail(`${year}年有普通${month}月和闰${month}月，请明确“闰月”或“非闰月”。`);
  const signed=leap?-month:month;
  const monthObject=LunarYear.fromYear(year).getMonth(signed);
  if (!monthObject || day>monthObject.getDayCount()) fail('该农历月份没有这一天，请核实日期。');
  const lunar=Lunar.fromYmd(year,signed,day), solar=lunar.getSolar();
  const back=solar.getLunar();
  if (back.getYear()!==year || back.getMonth()!==signed || back.getDay()!==day) fail('农历往返校验失败。');
  const entry=solar.next(-1);
  return {year,month:signed,day,solar:solar.toYmd(),entry:entry.toYmd(),display:`农历${year}年\n${leap?'闰':''}${['','正','二','三','四','五','六','七','八','九','十','十一','腊'][month]}月${lunar.getDayInChinese()}`,calendar:'lunar-javascript 1.7.7',timezone:'Asia/Shanghai'};
}
function solarDate(value,label) {
  const m=value.normalize('NFKC').trim().match(/^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/);
  if (!m) fail(`${label}请填写完整阳历日期，例如 2026-10-25。`);
  const [y,mo,d]=m.slice(1).map(Number);
  if (y<1901 || y>2100 || mo<1 || mo>12 || d<1 || d>31) fail(`${label}无效。`);
  const t=new Date(Date.UTC(y,mo-1,d));
  if(t.getUTCFullYear()!==y || t.getUTCMonth()!==mo-1 || t.getUTCDate()!==d) fail(`${label}无效。`);
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function cents(raw,label) {
  const s=raw.normalize('NFKC').replace(/[¥￥元\s]/g,'');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s)) fail(`${label}请填写明确金额，最多两位小数，例如 5000；不接受“5千”或负数。`);
  const [whole,part='']=s.replace(/,/g,'').split('.');
  const n=Number(whole)*100+Number(part.padEnd(2,'0'));
  if (!Number.isSafeInteger(n) || n>10000000000) fail(`${label}超出支持金额范围。`);
  return n;
}
function amount(n) { return (n/100).toFixed(2).replace(/\.00$/,''); }
function nonempty(s,label) {
  if (!s || /【|待填|待定|未知|不详/.test(s)) fail(`请补充${label}，不要保留占位文字。`);
  if (s.length>600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) fail(`${label}内容过长或包含控制字符。`);
  return s;
}
function names(input) {
  let groom=input['新郎姓名'],bride=input['新娘姓名'];
  const raw=input['新人姓名'];
  // The input form explicitly specifies groom first. Never infer gender from a name.
  const parts=raw.split(/\s*(?:💗|&|＆|、|\+|＋)\s*/);
  if(parts.length!==2) fail('新人姓名请按“新郎姓名 💗 新娘姓名”填写；无法确定新郎时请先核实。');
  const g=parts[0].replace(/^新郎\s*[:：]?\s*/,''),b=parts[1].replace(/^新娘\s*[:：]?\s*/,'');
  if (/^新娘/.test(parts[0]) || /^新郎/.test(parts[1])) fail('新人姓名顺序应为新郎在前、新娘在后。');
  if ((groom && groom!==g)||(bride && bride!==b)) fail('单独提供的新人姓名与“新人姓名”字段不一致。');
  groom=nonempty(g,'新郎姓名');bride=nonempty(b,'新娘姓名');
  if(groom.length>40 || bride.length>40) fail('新人姓名过长，请核实。');
  return {groom,bride,display:`${groom} 💗 ${bride}`};
}
function safeName(name) { return name.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim() || '未命名'; }
function prepare(input) {
  for(const key of REQUIRED) nonempty(input[key],key);
  const dates=lunarDate(input['农历婚期']);
  const received=solarDate(input['收款日期'],'定金收款日期');
  if(received>dates.solar) fail('定金收款日期晚于婚期，请核实后再生成。');
  if(input['阳历婚期'] && solarDate(input['阳历婚期'],'阳历婚期')!==dates.solar) fail('用户提供的阳历婚期与农历换算不一致，请核实。');
  if(input['约定进场时间'] && solarDate(input['约定进场时间'],'进场日期')!==dates.entry) fail('用户提供的进场时间与婚礼前一天不一致，请确认是否属于特别安排。');
  const pair=names(input), total=cents(input['订单总金额 / 元'],'订单总金额'),deposit=cents(input['已收定金 / 元'],'已收定金');
  if(total<=0 || deposit<=0 || deposit>total) fail('这是定金已收的确认单：总额、定金应大于零，且定金不得高于总额。');
  if(deposit*5>total) fail('已收定金超过订单总额的20%。请先核实是否含预付款，并单独确认展示方式；不要自动把超出部分标成定金。');
  const displayDate=d=>d.replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,y,m,dd)=>`${y}年${Number(m)}月${Number(dd)}日`);
  const fields=[['婚礼信息'],['names','新人姓名',pair.display],['date','婚礼日期',dates.solar.replaceAll('-','.')],['lunar','农历日期',dates.display],['address','详细地址',input['婚礼地点']],['customer','客户联系方式',input['客户联系方式']],['entry','约定进场日期',displayDate(dates.entry)+'（婚礼前一天）'],['liaison','现场对接人',input['当天现场对接人']+' / '+input['现场对接人电话']],['费用与联络'],['total','订单总金额（元）',amount(total),'number'],['deposit','已收定金（元）',amount(deposit),'number'],['received','定金收款日期',displayDate(received)],['contact','门店联系方式','完美婚庆 · 陈西宽\n联系电话：13526946306 丨 15037935358','textarea']];
  return {dates,pair,received,amounts:{total:amount(total),deposit:amount(deposit),remaining:amount(total-deposit)},fields};
}
function makeHtml(template,order) {
  const re=/\/\* ORDER_FIELDS_BEGIN \*\/[\s\S]*?\/\* ORDER_FIELDS_END \*\//;
  if (!re.test(template)) fail('模板数据入口缺失，请恢复母版。');
  // Encode script terminators, even though the UI uses textContent.
  const json=JSON.stringify(order.fields).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return template.replace(re,()=>`/* ORDER_FIELDS_BEGIN */${json}/* ORDER_FIELDS_END */`).replace('这是 dp-wm 订单模板。请通过生成脚本填写完整订单后导出图片。','本单已由 dp-wm 填写。核对右侧内容后，可再次导出图片。');
}
module.exports={parseInput,lunarDate,solarDate,prepare,makeHtml,safeName};
