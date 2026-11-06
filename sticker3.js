// الوظيفة : ستيكر مجتمع  
// انضم لقناتي لكل جديد : 
# 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗜𝗡𝗚
// https://whatsapp.com/channel/0029VbCcnFGAu3aMO6CWC73B

import fs from 'fs'
import path from 'path'

const filePath = path.join(process.cwd(), 'sticker-s.json')
const historyPath = path.join(process.cwd(), 'sticker-s-history.json')

const defaultSticker = {
    url: "https://mmg.whatsapp.net/v/t62.15575-24/886631607_1494828349224283_2648941109418172292_n.enc?ccb=11-4&oh=01_Q5Aa6AEFYvchOKUndcdG1ni1b82EySn4jdJwIP8ibOD0VzOw3A&oe=6B12F3FC&_nc_sid=5e03e0&mms3=true",
    fileSha256: "BtCcgjFphrBlw1je8jVPzCjgbJ4v74lrwx4nqA/V78g=",
    fileEncSha256: "u3JY7pR165ok5BW/Z560mqpH8tt7ndGTy4iooYoQQnw=",
    mediaKey: "GQCS4dIcgVB1hfsEFhPSyMiOXvsbtF7YMeH2BA3Z/Vo=",
    mimetype: "image/webp",
    height: 512,
    width: 512,
    directPath: "/v/t62.15575-24/886631607_1494828349224283_2648941109418172292_n.enc?ccb=11-4&oh=01_Q5Aa6AEFYvchOKUndcdG1ni1b82EySn4jdJwIP8ibOD0VzOw3A&oe=6B12F3FC&_nc_sid=5e03e0",
    fileLength: 125264,
    mediaKeyTimestamp: 1793814040,
    firstFrameLength: 124846,
    firstFrameSidecar: "KOONmCWTheku8Q==",
    isAnimated: true,
    contextInfo: {},
    stickerSentTs: 1793814040746,
    isAvatar: false,
    isAiSticker: false,
    isLottie: false
}

function getSticker() {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {}
    return defaultSticker
}

function getHistory() {
    try {
        if (fs.existsSync(historyPath)) return JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
    } catch {}
    return []
}

function saveHistory(list) {
    fs.writeFileSync(historyPath, JSON.stringify(list))
}

function toBase64(v) {
    if (!v) return v
    if (Buffer.isBuffer(v)) return v.toString('base64')
    if (v instanceof Uint8Array) return Buffer.from(v).toString('base64')
    return v
}

// تدوير على stickerMessage في أي مكان جوه quoted - ده اللي صلح س1
function findSticker(obj, depth = 0, seen = new Set()) {
    if (!obj || depth > 6 || typeof obj !== 'object') return null
    if (seen.has(obj)) return null
    seen.add(obj)
    if (obj.stickerMessage) return obj.stickerMessage
    if (obj.url && obj.fileSha256 && obj.mimetype === 'image/webp') return obj
    if (obj.mtype === 'stickerMessage' && obj.msg) return obj.msg
    for (const key of Object.keys(obj)) {
        if (['key', 'chat', 'sender', 'mentionedJid'].includes(key)) continue
        const found = findSticker(obj[key], depth + 1, seen)
        if (found) return found
    }
    return null
}

export const run = {
    usage: ['س', 'س1', 'مسح'],
    use: 'س [عدد] = يلزق | س1 = تبديل | مسح [عدد] = يمسح من الرسالة اللي عامل عليها ريبلاي',
    category: 'قسم التحويل🔄',
    async: async (m, { client, command, isPrefix, text, args }) => {

        // ===== س1 : تبديل الاستيكر =====
        if (command === 'س1') {
            const quoted = m.quoted
            if (!quoted) return client.reply(m.chat, `اعمل ريبلاي على الاستيكر اللي عايز تبدل بيه الأول\n\nمثال: ${isPrefix}س1`, m)

            const stickerMsg = findSticker(quoted)
            if (!stickerMsg) {
                const debugType = quoted.mtype || quoted.type || Object.keys(quoted.message || quoted.msg || {}).join(',') || 'unknown'
                return client.reply(m.chat, `الرسالة اللي عملت عليها ريبلاي مش ستيكر ❌\nالنوع اللي البوت شافه: ${debugType}`, m)
            }

            const newSticker = {
                url: stickerMsg.url,
                fileSha256: toBase64(stickerMsg.fileSha256),
                fileEncSha256: toBase64(stickerMsg.fileEncSha256),
                mediaKey: toBase64(stickerMsg.mediaKey),
                mimetype: stickerMsg.mimetype || "image/webp",
                height: 512,
                width: 512,
                directPath: stickerMsg.directPath,
                fileLength: stickerMsg.fileLength,
                mediaKeyTimestamp: stickerMsg.mediaKeyTimestamp,
                firstFrameLength: stickerMsg.firstFrameLength,
                firstFrameSidecar: toBase64(stickerMsg.firstFrameSidecar),
                isAnimated: stickerMsg.isAnimated || false,
                contextInfo: {},
                stickerSentTs: Date.now(),
                isAvatar: false,
                isAiSticker: false,
                isLottie: false
            }

            fs.writeFileSync(filePath, JSON.stringify(newSticker, null, 2))
            return client.reply(m.chat, `تم ✅\nاتبدل الاستيكر بنجاح`, m)
        }

        // ===== مسح : رجعنا لطريقة المسح القديمة اللي كانت شغالة =====
        if (command === 'مسح') {
            const quoted = m.quoted
            let history = getHistory().filter(x => x.chat === m.chat)

            // لو عامل ريبلاي -> امسح اللي على الرسالة دي بس
            // بنقارن بحاجتين: لو الريبلاي على الرسالة الأصلية (parentId)
            // أو لو الريبلاي على الاستيكر نفسه (id)
            if (quoted?.key?.id) {
                const qid = quoted.key.id
                history = history.filter(x => x.parentId === qid || x.id === qid)
                if (!history.length) return client.reply(m.chat, `مفيش استيكرات على الرسالة دي عشان تتمسح`, m)
            } else {
                if (!history.length) return client.reply(m.chat, `مفيش استيكرات محفوظة تتمسح في الشات ده`, m)
            }

            let count = parseInt(args?.[0] || text?.trim())
            let toDelete = []
            let remaining = []

            if (isNaN(count) || count < 1) {
                toDelete = history
                remaining = []
            } else {
                toDelete = history.slice(-count)
                remaining = history.slice(0, history.length - toDelete.length)
            }

            let deleted = 0
            for (const item of toDelete) {
                try {
                    // نفس طريقة المسح القديمة بالظبط
                    await client.sendMessage(m.chat, {
                        delete: {
                            id: item.id,
                            remoteJid: m.chat,
                            fromMe: true,
                            participant: client.user?.id
                        }
                    })
                    deleted++
                } catch (e) {
                    console.log('delete failed', item.id, e?.message)
                }
            }

            // تحديث الحفظ: نشيل اللي اتمسح فعلا بس
            let allHistory = getHistory().filter(x => x.chat !== m.chat)
            // الباقي من نفس الشات = اللي مش في toDelete + اللي اتبقى من نفس الرسالة لو مسحت بعدد
            let otherInChat = getHistory().filter(x => x.chat === m.chat && !toDelete.find(d => d.id === x.id))
            // لو مسحت بعدد، remaining دي هي اللي فضلت من نفس الرسالة، وهي اصلا جوة otherInChat
            allHistory = [...allHistory, ...otherInChat]
            saveHistory(allHistory)

            if (deleted === 0) return client.reply(m.chat, `حاولت امسح بس واتساب رفض ❌\nممكن تكون الرسايل عدت عليها وقت أو البوت مش هو اللي باعتها`, m)
            return client.reply(m.chat, `تم ✅\nاتمسح ${deleted} ستيكر${quoted?.key?.id ? ' من الرسالة دي' : ''}`, m)
        }

        // ===== س : رجعنا لطريقة الارسال القديمة اللي بترجع id صح =====
        const quoted = m.quoted
        if (!quoted) return client.reply(m.chat, `اعمل ريبلاي على رسالة الشخص الأول\n\nمثال: ${isPrefix}س 5`, m)

        let count = parseInt(args?.[0] || text?.trim())
        if (isNaN(count) || count < 1) count = 3

        const targetKey = quoted.key
        const stickerData = getSticker()
        let history = getHistory()

        for (let i = 0; i < count; i++) {
            const sent = await client.relayMessage(m.chat, {
                messageContextInfo: {
                    messageAssociation: {
                        associationType: 11,
                        parentMessageKey: targetKey
                    }
                },
                stickerMessage: stickerData
            }, {})

            // sent هنا هو الـ id الحقيقي اللي واتساب بعت بيه
            const sentId = typeof sent === 'string' ? sent : sent?.id || sent?.key?.id
            if (sentId) {
                history.push({ id: sentId, chat: m.chat, parentId: targetKey.id, time: Date.now() })
            }
        }

        saveHistory(history)
    }
}
