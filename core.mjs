export function phone(value) {
  const s=String(value??'').replace(/[\s+-]/g,'').replace(/^880/,'0');
  if(!/^01\d{9}$/.test(s)) throw new Error('A full Bangladesh mobile number is required');
  return s;
}
export function money(value) {
  const original=String(value??'');
  if(original.includes(',')&&!/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(original))throw new Error('Invalid amount grouping');
  const s=original.replace(/,/g,'');
  if(!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Invalid amount');
  const [whole,fraction='']=s.split('.');
  const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<=0||n>100000000) throw new Error('Amount out of range');
  return n;
}
export function parseSMS(pattern,message) {
  if(typeof pattern!=='string'||pattern.length>3000||typeof message!=='string'||message.length>4000) throw new Error('Invalid SMS or template');
  const names=[]; const seen=new Set();
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let source='',last=0;
  for(const m of pattern.matchAll(/\{\{(sender|transaction|amount)\}\}/g)) {
    source+=escape(pattern.slice(last,m.index));
    if(seen.has(m[1])) throw new Error('Use each field exactly once');
    names.push(m[1]);seen.add(m[1]);
    source+=m[1]==='sender'?'([+\\d -]{11,18})':m[1]==='amount'?'([\\d,]+(?:\\.\\d{1,2})?)':'([A-Za-z0-9-]{3,80})';
    last=m.index+m[0].length;
  }
  if(seen.size!==3) throw new Error('Template must contain sender, transaction and amount markers');
  source+=escape(pattern.slice(last));
  const match=new RegExp('^'+source+'$').exec(message.trim());
  if(!match) throw new Error('Message does not match this template');
  const fields=Object.fromEntries(names.map((n,i)=>[n,match[i+1]]));
  return {sender:phone(fields.sender),transaction:fields.transaction.toUpperCase(),amount:money(fields.amount)};
}
