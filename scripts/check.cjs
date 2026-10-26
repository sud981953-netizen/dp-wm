'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseInput,lunarDate,prepare,makeHtml}=require('./order.cjs');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const raw=`农历婚期：2026年九月廿三
新人姓名：陈明 💗 周宁
客户联系方式：13800000000
婚礼地点：测试乡镇测试村婚礼院落
订单总金额 / 元：5000
已收定金 / 元：1000
收款日期：2026-10-25`;
test('常规日期与跨月进场',()=>{const d=lunarDate('2026年九月廿三');assert.equal(d.solar,'2026-11-01');assert.equal(d.entry,'2026-10-31');});
test('公历跨年进场',()=>{const d=lunarDate('2025年十一月十三');assert.equal(d.solar,'2026-01-01');assert.equal(d.entry,'2025-12-31');});
test('春节',()=>assert.equal(lunarDate('2026年正月初一').solar,'2026-02-17'));
test('农历腊月进入下一公历年',()=>assert.equal(lunarDate('2026年腊月初一').solar,'2027-01-08'));
test('闰月与非闰月分别解析',()=>{assert.equal(lunarDate('2025年闰六月初一').solar,'2025-07-25');assert.equal(lunarDate('2025年六月初一（非闰月）').solar,'2025-06-25');});
test('闰月歧义不可默认',()=>assert.throws(()=>lunarDate('2025年六月初一'),/普通/));
test('缺年份不可推测',()=>assert.throws(()=>lunarDate('九月廿三'),/完整农历年份/));
test('错误闰月与不存在日期',()=>{assert.throws(()=>lunarDate('2026年闰六月初一'));assert.throws(()=>lunarDate('2026年二月三十'));});
test('口令和中英文冒号',()=>assert.equal(parseInput('/dp-wm\n'+raw.replace('农历婚期：','农历婚期:'))['农历婚期'],'2026年九月廿三'));
test('收款别名与尾款',()=>{const o=prepare(parseInput(raw.replace('收款日期','定金收款日期')));assert.equal(o.amounts.remaining,'4000');assert.equal(o.pair.groom,'陈明');});
test('小数金额无浮点尾差',()=>{const o=prepare(parseInput(raw.replace('5000','1000.30').replace('1000\n','200.06\n')));assert.equal(o.amounts.remaining,'800.24');});
test('缺电话拒绝出图',()=>assert.throws(()=>prepare(parseInput(raw.replace('13800000000',''))),/客户联系方式/));
test('缺新郎身份及身份冲突',()=>{assert.throws(()=>prepare(parseInput(raw.replace('陈明 💗 周宁','陈明和周宁'))),/新郎/);assert.throws(()=>prepare(parseInput(raw.replace('陈明 💗 周宁','新娘周宁 💗 新郎陈明'))),/顺序/);});
test('收款日期不假定当天',()=>assert.throws(()=>prepare(parseInput(raw.replace('2026-10-25','10月25日'))),/完整阳历/));
test('阴阳历冲突拒绝出图',()=>assert.throws(()=>prepare(parseInput(raw+'\n阳历婚期：2026-10-31')),/不一致/));
test('异常资金拒绝出图',()=>{assert.throws(()=>prepare(parseInput(raw.replace('已收定金 / 元：1000','已收定金 / 元：-100'))));assert.throws(()=>prepare(parseInput(raw.replace('已收定金 / 元：1000','已收定金 / 元：1500'))),/20%/);});
test('模板注入隔离',()=>{const o=prepare(parseInput(raw.replace('测试乡镇测试村婚礼院落','</script><script>throw Error(1)</script>')));const html=makeHtml('/* ORDER_FIELDS_BEGIN */[]/* ORDER_FIELDS_END */',o);assert(!html.includes('</script>'));assert(html.includes('\\u003c'));});
test('占位母版不含样例字段',()=>{const template=fs.readFileSync(path.join(__dirname,'../assets/template.html'),'utf8');const html=makeHtml(template,prepare(parseInput(raw)));assert(html.includes('陈明 💗 周宁'));assert(!html.includes('张先生'));});
test('现场对接人固定且不要求输入',()=>assert.equal(prepare(parseInput(raw)).fields.find(f=>f[0]==='liaison')[2],'陈西宽丨王秀丽\n13526946306丨15037935358'));
console.log(JSON.stringify({passed:checks}));
