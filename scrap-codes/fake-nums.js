// الوظيفة : سكراب ارقام فيك  
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

const PROXY   = 'https://opxotp.vercel.app/api/proxy';
const HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://opxotp.vercel.app/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};


const RANGES = [
  { rid: '22507',    country: '🇨🇮 ساحل العاج',  prefix: '+22507' },
  { rid: '2250777',  country: '🇨🇮 ساحل العاج',  prefix: '+2250777' },
  { rid: '2250779',  country: '🇨🇮 ساحل العاج',  prefix: '+2250779' },
  { rid: '2250709',  country: '🇨🇮 ساحل العاج',  prefix: '+2250709' },
  { rid: '38267',    country: '🇧🇾 بيلاروسيا',   prefix: '+38267' },
  { rid: '38267991', country: '🇧🇾 بيلاروسيا',   prefix: '+38267991' },
  { rid: '382679',   country: '🇧🇾 بيلاروسيا',   prefix: '+382679' },
  { rid: '2290193',  country: '🇧🇯 بنين',         prefix: '+2290193' },
  { rid: '2290194',  country: '🇧🇯 بنين',         prefix: '+2290194' },
  { rid: '26134',    country: '🇲🇬 مدغشقر',      prefix: '+26134' },
];


async function apiGet(endpoint) {
  const res = await fetch(`${PROXY}?endpoint=${endpoint}`, { headers: HEADERS });
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${PROXY}?endpoint=${endpoint}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  return res.json();
}


function extractOTP(msg) {
  const m = msg.match(/\b(\d{3}[-\s]?\d{3}|\d{4,8})\b/);
  return m ? m[1].replace(/\s/g, '') : null;
}


let handler = async (m, { conn, usedPrefix, command, args, text }) => {
  const sub = (args[0] || '').toLowerCase();

 
  if (!sub || sub === 'رقم' || sub === 'num' || sub === 'get') {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    
    const ridArg = args[1];
    let range;
    if (ridArg) {
      range = RANGES.find(r => r.rid.startsWith(ridArg) || ridArg.startsWith(r.rid));
    }
    if (!range) range = RANGES[Math.floor(Math.random() * RANGES.length)];

    let data;
    try { data = await apiPost('getnum', { rid: range.rid }); }
    catch (e) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return conn.reply(m.chat, `❌ خطأ: ${e.message}`, m);
    }

    if (data?.meta?.status !== 'ok' || !data?.data) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return conn.sendMessage(m.chat, {
        text: `❌ *فشل جلب الرقم*\n\n${data?.message || JSON.stringify(data).slice(0,200)}`
      }, { quoted: m });
    }

    const num = data.data;
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    return conn.sendMessage(m.chat, {
      text: `📱 *رقم مؤقت جاهز*

📞 *الرقم:* ${num.full_number || num.no_plus_number}
🌍 *الدولة:* ${num.country || range.country}
📡 *الشبكة:* ${num.operator || '—'}

✅ *OTP واصل:* ${usedPrefix}${command} كود
📋 *الرسائل:* ${usedPrefix}${command} شاشة
🔄 *رقم جديد:* ${usedPrefix}${command} رقم`
    }, { quoted: m });
  }


  if (sub === 'كود' || sub === 'code' || sub === 'otp') {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    let data;
    try { data = await apiGet('success-otp'); }
    catch (e) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return conn.reply(m.chat, `❌ خطأ: ${e.message}`, m);
    }

    const list = data?.data?.otps || [];
    if (!list.length) {
      await conn.sendMessage(m.chat, { react: { text: '📭', key: m.key } });
      return conn.sendMessage(m.chat, {
        text: `📭 *لا يوجد OTP بعد*\n\nانتظر قليلاً ثم أعد المحاولة`
      }, { quoted: m });
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    const rows = list.slice(0, 5).map((item, i) => {
      const otp  = extractOTP(item.message) || '—';
      const num  = item.number ? `+${item.number}` : '—';
      const time = new Date(item.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      const msg  = item.message.replace(/<#>\s?/, '').slice(0, 120);
      return `🔑 *الكود:* ${otp}
📞 *الرقم:* ${num}
🕐 *الوقت:* ${time}
📩 *الرسالة:* ${msg}`;
    }).join('\n\n────────────────\n\n');

    return conn.sendMessage(m.chat, {
      text: `🔑 *آخر ${Math.min(list.length, 5)} OTP*

${rows}`
    }, { quoted: m });
  }

 
  if (sub === 'شاشة' || sub === 'console' || sub === 'رسائل' || sub === 'كل') {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    // فلترة بالخدمة إن وجدت
    const service = args[1] ? args[1].toLowerCase() : null;

    let data;
    try { data = await apiGet('console'); }
    catch (e) {
      await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
      return conn.reply(m.chat, `❌ خطأ: ${e.message}`, m);
    }

    let list = data?.data?.hits || [];
    if (service) {
      list = list.filter(h => h.sid?.toLowerCase().includes(service));
    }

    if (!list.length) {
      await conn.sendMessage(m.chat, { react: { text: '📭', key: m.key } });
      return conn.sendMessage(m.chat, {
        text: `📭 *لا توجد رسائل*\n\n${service ? `لا يوجد رسائل من: ${service}` : 'الشاشة فارغة حالياً'}`
      }, { quoted: m });
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    const rows = list.slice(0, 6).map((item, i) => {
      const otp  = extractOTP(item.message);
      const time = new Date(item.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      const msg  = item.message.replace(/<#>\s?/, '').trim().slice(0, 150);
      return `📱 *الخدمة:* ${item.sid || '—'}
🔢 *الرقم:* ${item.range || '—'}
${otp ? `🔑 *الكود:* ${otp}\n` : ''}🕐 *الوقت:* ${time}
📩 *الرسالة:* ${msg}`;
    }).join('\n\n────────────────\n\n');

  
    const services = [...new Set(list.map(h => h.sid))].slice(0, 8).join(' • ');

    return conn.sendMessage(m.chat, {
      text: `📋 *الشاشة (${list.length} رسالة)*
${services ? `📡 *الخدمات:* ${services}` : ''}

${rows}`
    }, { quoted: m });
  }

  
  if (sub === 'أرقام' || sub === 'list' || sub === 'قائمة') {
    const rows = RANGES.map((r, i) => `${i + 1}. *${r.country}:* ${r.prefix}XXXXXXX`).join('\n');
    return conn.sendMessage(m.chat, {
      text: `🌍 *الأرقام المتاحة*

${rows}

💡 استخدم: ${usedPrefix}${command} رقم لجلب رقم عشوائي`
    }, { quoted: m });
  }

 
  return conn.sendMessage(m.chat, {
    text: `📱 *استقبال OTP*

📌 *${usedPrefix}${command}* -> جلب رقم مؤقت جديد 🌍
📌 *${usedPrefix}${command} كود* -> آخر OTP واصل (WhatsApp وغيره)
📌 *${usedPrefix}${command} شاشة* -> كل الرسائل الواردة
📌 *${usedPrefix}${command} شاشة fb* -> رسائل فيسبوك فقط
📌 *${usedPrefix}${command} أرقام* -> قائمة الدول المتاحة

🔗 يعمل بدون API key
✅ يدعم: WhatsApp • Facebook • Instagram • Telegram`
  }, { quoted: m });
};

handler.command = /^(otp|رقم|رقم مؤقت)$/i;
handler.help    = ['otp'];
handler.tags    = ['tools'];
handler.owner   = true;

export default handler;