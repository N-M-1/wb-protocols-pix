import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { exec as childExec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(childExec);

// ============================================================
//  DeepSeek API Integration for PIXEL Bot  (v9.0)
//  - DeepSeek (thinking + search) كـ AI Agent
//  - عرض غني: Code Blocks + Tables (Rich Message)
//  - قراءة ملفات البوت + اختبار API + تنفيذ أوامر (للمالك فقط)
//  - Safety Net: ملف نصي لو الرد كبير/متكسّر
// ============================================================

const CONFIG = Object.freeze({
    AUTH_TOKEN          : process.env.DEEPSEEK_AUTH_TOKEN || 'Bearer 2BPAw4X0eis07Buok2z/DtceQb7iPnXKJUj9BuXscwVEIeblxZ30sCFhpZVJkgsp',
    BASE_URL            : 'https://chat.deepseek.com',
    WASM_PATH           : path.join(process.cwd(), 'deepseek.wasm'),
    SESSION_TTL         : 60 * 60 * 1000,
    SESSION_GC_INTERVAL : 15 * 60 * 1000,
    MAX_TURNS_BEFORE_RESET : 45,
    FILE_POLL_INTERVAL  : 2_000,
    FILE_POLL_MAX       : 90,
    FILE_POLL_MAX_DELAY : 6_000,
    POW_MAX_NONCE       : 2_000_000n,
    HTTP_TIMEOUT        : 180_000,

    // ===== إعدادات الذكاء =====
    THINKING_ENABLED    : true,     // فعّل التفكير داخل الموديل
    SEARCH_ENABLED      : true,     // فعّل البحث
    SHOW_THINKING       : false,    // ⬅️ لا تعرض نص التفكير للمستخدم

    HEADERS: {
        'User-Agent'               : 'DeepSeek/1.8.3 Android/33',
        'x-client-platform'        : 'android',
        'x-client-version'         : '1.8.3',
        'x-client-locale'          : 'en_US',
        'x-client-bundle-id'       : 'com.deepseek.chat',
        'x-client-timezone-offset' : '3600',
        'Accept'                   : 'application/json',
        'Content-Type'             : 'application/json',
    },
});

const WEB_UPLOAD_HEADERS = {
    'User-Agent'               : 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Accept'                   : '*/*',
    'Accept-Language'          : 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin'                   : 'https://chat.deepseek.com',
    'Referer'                  : 'https://chat.deepseek.com/',
    'x-client-platform'        : 'web',
    'x-client-version'         : '2.5.0',
    'x-client-locale'          : 'en_US',
    'x-client-bundle-id'       : 'com.deepseek.chat',
    'x-client-timezone-offset' : '10800',
    'x-device-id'              : 'e21453e1-a2a1-4f99-8d3d-675c314e3e6d',
    'authorization'            : CONFIG.AUTH_TOKEN,
};

const MIME_BY_EXT = {
    jpg : 'image/jpeg',   jpeg: 'image/jpeg',  jpe : 'image/jpeg',
    png : 'image/png',    webp: 'image/webp',  gif : 'image/gif',
    bmp : 'image/bmp',    svg : 'image/svg+xml',
    tif : 'image/tiff',   tiff: 'image/tiff',
    heic: 'image/heic',   heif: 'image/heif',
    ico : 'image/x-icon', avif: 'image/avif',

    pdf : 'application/pdf',
    doc : 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls : 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt : 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    txt : 'text/plain',
    md  : 'text/markdown',
    markdown: 'text/markdown',

    py  : 'text/x-python',
    sql : 'application/x-sql',
    php : 'application/octet-stream',
    js  : 'text/javascript',
    html: 'text/html',
    htm : 'text/html',
    c   : 'text/x-csrc',
    cxx : 'text/x-c++src',
    jsx : 'application/octet-stream',
    css : 'text/css',
};

// ─────────────────────────────────────────────────────────────
//  Persona (اختياري) — prompt.txt في مسار البوت الأساسي
// ─────────────────────────────────────────────────────────────
let devPersona = '';
try {
    devPersona = fs.readFileSync(path.join(process.cwd(), 'prompt.txt'), 'utf-8').trim();
    if (devPersona) console.log('✅ prompt.txt تحمل بنجاح');
} catch { /* اختياري */ }

// ─────────────────────────────────────────────────────────────
//  Session Store
// ─────────────────────────────────────────────────────────────
const sessions = new Map();

setInterval(() => {
    const cutoff = Date.now() - CONFIG.SESSION_TTL;
    for (const [id, data] of sessions) {
        if (data.lastActive < cutoff) sessions.delete(id);
    }
}, CONFIG.SESSION_GC_INTERVAL);

async function getOrCreateSession(userId) {
    if (sessions.has(userId)) {
        const data = sessions.get(userId);
        if (data.turns < CONFIG.MAX_TURNS_BEFORE_RESET) {
            return { sessionId: data.sessionId, lastMsgId: data.lastMsgId, turns: data.turns };
        }
        sessions.delete(userId);
    }
    const res = await apiPost('/api/v0/chat_session/create', {});
    const id  = res.data.data.biz_data.chat_session.id;
    sessions.set(userId, { sessionId: id, lastMsgId: null, turns: 0, lastActive: Date.now() });
    return { sessionId: id, lastMsgId: null, turns: 0 };
}

function saveSession(userId, sessionId, lastMsgId, turns) {
    sessions.set(userId, { sessionId, lastMsgId, turns, lastActive: Date.now() });
}

// ─────────────────────────────────────────────────────────────
//  HTTP Helpers
// ─────────────────────────────────────────────────────────────
const authHeaders = (extra = {}) => ({
    ...CONFIG.HEADERS,
    authorization: CONFIG.AUTH_TOKEN,
    ...extra,
});

const apiPost = (endpoint, data, extra = {}) =>
    axios.post(`${CONFIG.BASE_URL}${endpoint}`, data, {
        headers: authHeaders(extra),
        timeout: CONFIG.HTTP_TIMEOUT,
    });

const apiGet = (endpoint, extra = {}) =>
    axios.get(`${CONFIG.BASE_URL}${endpoint}`, {
        headers: authHeaders(extra),
        timeout: CONFIG.HTTP_TIMEOUT,
    });

// ─────────────────────────────────────────────────────────────
//  Proof-of-Work
// ─────────────────────────────────────────────────────────────
let wasmInstance = null;

async function loadWasm() {
    if (wasmInstance) return wasmInstance;
    if (!fs.existsSync(CONFIG.WASM_PATH)) return null;
    try {
        const { instance } = await WebAssembly.instantiate(fs.readFileSync(CONFIG.WASM_PATH), {});
        return (wasmInstance = instance);
    } catch {
        return null;
    }
}

async function solvePoW(pow) {
    const prefix = `${pow.salt}_${pow.expire_at}_`;
    const engine = await loadWasm();

    if (engine) {
        try {
            const { wasm_solve, memory, __wbindgen_export_0, __wbindgen_add_to_stack_pointer } = engine.exports;
            const alloc = (str) => {
                const buf = Buffer.from(str, 'utf8');
                const ptr = __wbindgen_export_0(buf.length, 1);
                new Uint8Array(memory.buffer, ptr, buf.length).set(buf);
                return [ptr, buf.length];
            };
            const [cPtr, cLen] = alloc(pow.challenge);
            const [pPtr, pLen] = alloc(prefix);
            const stackPtr     = __wbindgen_add_to_stack_pointer(-16);
            wasm_solve(stackPtr, cPtr, cLen, pPtr, pLen, pow.difficulty);
            const view = new DataView(memory.buffer, stackPtr, 16);
            if (view.getInt32(0, true) !== 0) return Math.floor(view.getFloat64(8, true));
        } catch { /* fall through */ }
    }

    const target = (1n << 256n) / BigInt(pow.difficulty);
    const cBuf   = Buffer.from(pow.challenge, 'hex');
    const pBuf   = Buffer.from(prefix, 'utf8');
    for (let nonce = 0n; nonce < CONFIG.POW_MAX_NONCE; nonce++) {
        const nBuf = Buffer.alloc(8);
        nBuf.writeBigUInt64LE(nonce);
        const hash = crypto.createHash('sha256')
            .update(Buffer.concat([cBuf, pBuf, nBuf]))
            .digest();
        if (BigInt(`0x${hash.toString('hex')}`) < target) return Number(nonce);
    }
    return 0;
}

async function buildPoWHeader(targetPath) {
    const res    = await apiPost('/api/v0/chat/create_pow_challenge', { target_path: targetPath });
    const pow    = res.data.data.biz_data.challenge;
    const answer = await solvePoW(pow);
    return Buffer.from(JSON.stringify({
        algorithm: pow.algorithm, challenge: pow.challenge,
        salt: pow.salt, signature: pow.signature,
        answer, target_path: targetPath,
    })).toString('base64');
}

// ─────────────────────────────────────────────────────────────
//  File Upload
// ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILE_STATUS = {
    SUCCESS : 'SUCCESS',
    PENDING : 'PENDING',
    AUDITING: 'AUDITING',
    FAILED  : 'FAILED',
    ERROR   : 'ERROR',
    BLOCKED : 'BLOCKED',
    REJECTED: 'REJECTED',
};

async function uploadBuffer(fileBuffer, mimeType, fileName) {
    console.log(`[DeepSeek Upload] buffer.size=${fileBuffer?.length} name="${fileName}" mime="${mimeType}"`);

    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('الملف فاضي (حجم صفر). تأكد إن الملف اتحمّل صح من واتساب.');
    }

    const powHeader = await buildPoWHeader('/api/v0/file/upload_file');

    const form = new FormData();
    form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });

    const uploadHeaders = {
        ...WEB_UPLOAD_HEADERS,
        'x-ds-pow-response' : powHeader,
        'x-file-size'       : String(fileBuffer.length),
        'x-model-type'      : 'default',
        'x-thinking-enabled': '1',
        ...form.getHeaders(),
    };

    const uploadRes = await axios.post(
        `${CONFIG.BASE_URL}/api/v0/file/upload_file`,
        form,
        {
            headers          : uploadHeaders,
            timeout          : CONFIG.HTTP_TIMEOUT,
            maxBodyLength    : Infinity,
            maxContentLength : Infinity,
            validateStatus   : () => true,
        }
    );

    console.log(`[DeepSeek Upload] HTTP=${uploadRes.status}`);
    console.log(`[DeepSeek Upload] resp=${JSON.stringify(uploadRes.data).slice(0, 600)}`);

    const fileId = uploadRes.data?.data?.biz_data?.id;

    if (!fileId) {
        const code = uploadRes.data?.data?.biz_code ?? uploadRes.data?.code ?? '?';
        const msg  = uploadRes.data?.data?.biz_msg || uploadRes.data?.msg || '(empty)';
        throw new Error(`فشل الرفع: biz_code=${code} biz_msg=${msg} http=${uploadRes.status}`);
    }

    let delay = CONFIG.FILE_POLL_INTERVAL;
    let lastStatus = null;

    for (let i = 0; i < CONFIG.FILE_POLL_MAX; i++) {
        await sleep(delay);

        try {
            const res = await apiGet(`/api/v0/file/fetch_files?file_ids=${encodeURIComponent(fileId)}`);
            const file = res.data?.data?.biz_data?.files?.[0];

            if (!file) {
                delay = Math.min(delay + 500, CONFIG.FILE_POLL_MAX_DELAY);
                continue;
            }

            const status  = file.status;
            const audit   = file.audit_result;
            const errCode = file.error_code;

            if (status !== lastStatus) {
                console.log(`[DeepSeek Poll ${i + 1}] status=${status} audit=${audit} err=${errCode}`);
                lastStatus = status;
            }

            if (status === FILE_STATUS.SUCCESS) {
                if (['blocked', 'rejected', 'fail', 'failed'].includes(audit)) {
                    throw new Error(`تم رفض الملف من الـ audit (${audit}).`);
                }
                return fileId;
            }

            if ([FILE_STATUS.FAILED, FILE_STATUS.ERROR, FILE_STATUS.BLOCKED, FILE_STATUS.REJECTED].includes(status)) {
                throw new Error(`رفض الخادم: status=${status} err=${errCode || 'unknown'}`);
            }

            delay = Math.min(delay + 500, CONFIG.FILE_POLL_MAX_DELAY);
        } catch (e) {
            if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || !e.response) {
                // أخطاء الـ audit/الرفض اللي رميناها بنفسنا ملهاش response → لازم تطلع
                if (/^(تم رفض|رفض الخادم)/.test(e.message || '')) throw e;
                delay = Math.min(delay + 500, CONFIG.FILE_POLL_MAX_DELAY);
                continue;
            }
            throw e;
        }
    }

    throw new Error(`انتهى وقت معالجة الملف. آخر حالة: ${lastStatus || 'unknown'}`);
}

// ─────────────────────────────────────────────────────────────
//  Stream Collector
// ─────────────────────────────────────────────────────────────
function collectStream(stream) {
    return new Promise((resolve, reject) => {
        let buffer    = '';
        let response  = '';
        let thinking  = '';
        let messageId = null;
        let currentType = null;

        stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (let raw of lines) {
                const line = raw.trim();
                if (!line) continue;
                if (line.startsWith('event:')) continue;
                if (!line.startsWith('data:'))  continue;

                const payload = line.slice(5).trim();
                if (payload === '[DONE]') continue;

                let json;
                try { json = JSON.parse(payload); } catch { continue; }

                // 1) الرد الابتدائي
                if (json.v && typeof json.v === 'object' && json.v.response) {
                    const resp = json.v.response;
                    if (resp.message_id) messageId = resp.message_id;

                    for (const f of resp.fragments || []) {
                        if (f.type === 'THINK') {
                            thinking += f.content || '';
                            currentType = 'THINK';
                        } else if (f.type === 'RESPONSE' || !f.type) {
                            response += f.content || '';
                            currentType = 'RESPONSE';
                        }
                    }
                    continue;
                }

                // 2) patch: إضافة fragment جديد
                if (json.p === 'response/fragments' && Array.isArray(json.v)) {
                    for (const f of json.v) {
                        if (f.type === 'THINK') {
                            thinking += f.content || '';
                            currentType = 'THINK';
                        } else if (f.type === 'RESPONSE' || !f.type) {
                            response += f.content || '';
                            currentType = 'RESPONSE';
                        }
                    }
                    continue;
                }

                // 3) patch: إلحاق بآخر fragment
                if (json.p === 'response/fragments/-1/content' && typeof json.v === 'string') {
                    if (currentType === 'THINK')         thinking += json.v;
                    else if (currentType === 'RESPONSE') response += json.v;
                    continue;
                }

                // 4) اختصار: { v: "string" }
                if (typeof json.v === 'string') {
                    if (currentType === 'THINK')         thinking += json.v;
                    else if (currentType === 'RESPONSE') response += json.v;
                    continue;
                }
            }
        });

        stream.on('end', () => {
            const cleanResp  = response.replace(/\s*FINISHED\s*$/i, '').trimEnd();
            const cleanThink = thinking.replace(/\s*FINISHED\s*$/i, '').trimEnd();
            resolve({ text: cleanResp, thinking: cleanThink, messageId });
        });

        stream.on('error', reject);
    });
}

// ════════════════════════════════════════════════════
//  🔧 UTILITY FUNCTIONS
// ════════════════════════════════════════════════════

const FENCE = '`'.repeat(3);

function getFilesTree(dirPath) {
    const results = [];
    if (!fs.existsSync(dirPath)) return results;
    for (const file of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, file);
        try {
            if (fs.statSync(full).isDirectory()) {
                results.push(...getFilesTree(full));
            } else if (/\.(js|json|cjs|mjs)$/.test(file)) {
                results.push(full);
            }
        } catch {}
    }
    return results;
}

function stripMarkdown(text = '') {
    return String(text || '')
        .replace(/\[citation:\d+\]/gi, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/_([^_\n]+)_/g, '$1')
        .replace(/~~([^~\n]+)~~/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/^#{1,6}\s+(.+)$/gm, '$1')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^>\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function stripMarkdownLinksFromCode(code = '') {
    return String(code || '').replace(
        /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
        (_, text, url) => /^https?:\/\//.test(text.trim()) ? text.trim() : url
    );
}

function stripCodeFence(text = '') {
    return String(text || '').trim()
        .replace(/^[\w+#.-]*\s*\n?/, '')
        .replace(/\n?\s*$/, '')
        .trim();
}

// DeepSeek أحياناً بيرجّع سطور جديدة حقيقية جوه قيمة الـ string
// (بيكسر JSON.parse). بنمشي حرف حرف ونعمل escape لأي control char جوه string.
function sanitizeJsonControlChars(text = '') {
    let out = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (!inString) {
            out += ch;
            if (ch === '"') inString = true;
            continue;
        }
        if (escaped) { out += ch; escaped = false; continue; }
        if (ch === '\\') { out += ch; escaped = true; continue; }
        if (ch === '"') { out += ch; inString = false; continue; }

        const code = ch.charCodeAt(0);
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { out += '\\r'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }
        if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }

        out += ch;
    }
    return out;
}

function safeJsonParse(value) {
    if (!value) return null;
    const raw = String(value);

    try { return JSON.parse(raw); } catch {}

    const sanitized = sanitizeJsonControlChars(raw);
    try { return JSON.parse(sanitized); } catch {}

    try {
        return JSON.parse(
            sanitized
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        );
    } catch { return null; }
}

function normalizeLanguage(lang = '') {
    const map = {
        js: 'javascript', javascript: 'javascript',
        ts: 'typescript', typescript: 'typescript',
        py: 'python', python: 'python',
        sh: 'bash', bash: 'bash', zsh: 'zsh',
        html: 'html', css: 'css',
        json: 'json', xml: 'xml',
        sql: 'sql', php: 'php',
        java: 'java', c: 'c',
        cpp: 'cpp', 'c++': 'cpp',
        go: 'go', rust: 'rust',
        dart: 'dart', kotlin: 'kotlin',
        ruby: 'ruby', yml: 'yaml',
        yaml: 'yaml', md: 'markdown',
        markdown: 'markdown', txt: 'text',
        text: 'text'
    };
    const raw = String(lang || '').trim().toLowerCase();
    return map[raw] || raw || 'text';
}

function prettyLanguage(lang = '') {
    const map = {
        javascript: 'JavaScript', typescript: 'TypeScript',
        python: 'Python', bash: 'Bash', zsh: 'Zsh',
        html: 'HTML', css: 'CSS', json: 'JSON',
        xml: 'XML', sql: 'SQL', php: 'PHP',
        java: 'Java', c: 'C', cpp: 'C++',
        go: 'Go', rust: 'Rust', dart: 'Dart',
        kotlin: 'Kotlin', ruby: 'Ruby', yaml: 'YAML',
        markdown: 'Markdown', text: 'Text'
    };
    return map[normalizeLanguage(lang)] || lang;
}

function normalizeArrayRows(rows = [], width = 0) {
    return rows
        .filter(r => Array.isArray(r) && r.length > 0)
        .map(r => {
            const out = r.map(c => String(c ?? '').trim());
            if (width > 0) {
                while (out.length < width) out.push('');
                return out.slice(0, width);
            }
            return out;
        })
        .filter(r => r.some(c => c !== ''));
}

function uniqueBySignature(items = []) {
    const seen = new Set();
    return items.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const sig = JSON.stringify({
            type: item.type || '',
            content: (item.content || '').slice(0, 80),
            language: item.language || '',
            title: item.title || '',
            command: item.command || ''
        });
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
    });
}

// ════════════════════════════════════════════════════
//  🛡️ SAFETY NET — منع وصول رد متكسّر/ضخم للمستخدم
// ════════════════════════════════════════════════════

const FILE_FALLBACK_CHAR_THRESHOLD = 3500;
const CORRUPTION_MIN_LINES = 8;
const CORRUPTION_SHORT_LINE_RATIO = 0.35;

function extractFencedCodeBlocks(text = '') {
    const codes = [];
    const withoutCode = String(text || '').replace(/([\w+#.-]*)\n?([\s\S]*?)/g, (_, lang, code) => {
        const c = stripMarkdownLinksFromCode(String(code || '').trim());
        if (c) {
            codes.push({
                type: 'code',
                language: normalizeLanguage(lang || 'text'),
                label: prettyLanguage(lang || 'text'),
                content: c
            });
        }
        return '\n';
    });
    return { withoutCode, codes };
}

function isLikelyCorruptedText(text = '') {
    const s = String(text || '').trim();
    if (!s) return false;
    const lines = s.split('\n');
    if (lines.length < CORRUPTION_MIN_LINES) return false;
    const shortLines = lines.filter(l => l.trim().length <= 2).length;
    return (shortLines / lines.length) > CORRUPTION_SHORT_LINE_RATIO;
}

const FILENAME_STOPWORDS = new Set([
    'في', 'من', 'الى', 'إلى', 'على', 'عن', 'مع', 'هل', 'ما', 'ماذا', 'هذا', 'هذه',
    'ذلك', 'تلك', 'التي', 'الذي', 'كيف', 'لو', 'او', 'أو', 'و', 'ثم', 'قم', 'بعمل',
    'اعمل', 'اعملي', 'اعمله', 'اعملها', 'ابعت', 'ابعتلي', 'ابعتله', 'اكتب', 'اكتبلي',
    'عدل', 'عدلي', 'عدله', 'صلح', 'صلحلي', 'صلحله', 'حول', 'حولي', 'انشئ', 'انشئي',
    'سوي', 'سويلي', 'لي', 'ليا', 'ليه', 'عايز', 'عايزة', 'عاوز', 'عاوزة', 'ممكن',
    'رجاء', 'بليز', 'دلوقتي', 'كده', 'كدا', 'بس', 'يا', 'انت', 'انتا', 'احنا', 'بقى',
    'ده', 'دي', 'ال', 'the', 'a', 'an', 'is', 'are', 'to', 'of', 'for', 'and', 'or',
    'please', 'can', 'you', 'make', 'create', 'write', 'add', 'fix', 'update', 'me'
]);

function slugifyRequestTopic(text = '', maxWords = 6, maxLen = 60) {
    const cleaned = String(text || '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim();

    if (!cleaned) return '';

    const words = cleaned
        .split(/\s+/)
        .filter(w => w && !FILENAME_STOPWORDS.has(w.toLowerCase()));

    if (!words.length) return '';

    let slug = words.slice(0, maxWords).join('-');
    if (slug.length > maxLen) slug = slug.slice(0, maxLen);
    return slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function guessOutputFilename(questionText = '', content = '') {
    const named = String(questionText || '').match(/([\w-]+\.(js|json|cjs|mjs|ts|py|html|css|txt|md|yml|yaml))\b/i);
    if (named) return named[1];

    const trimmed = String(content || '').trim();
    const looksLikeJson = /^[{[]/.test(trimmed);
    const looksLikeJs = /\b(function|const|let|var|=>|require\(|import\s+|export\s+)\b/.test(trimmed);

    let ext = 'txt';
    if (looksLikeJson) ext = 'json';
    else if (looksLikeJs) ext = 'js';

    const topicSlug = slugifyRequestTopic(questionText);
    const stamp = Date.now();

    if (topicSlug) return `${topicSlug}-${stamp}.${ext}`;
    return `response-${stamp}.${ext}`;
}

async function sendTextAsFile(client, m, content, filename, caption) {
    const text = String(content || '').trim() || 'لا يوجد محتوى لعرضه.';
    const buffer = Buffer.from(text, 'utf-8');
    await client.sendMessage(m.chat, {
        document: buffer,
        fileName: filename,
        mimetype: 'text/plain',
        caption: caption || ''
    }, { quoted: m });
}

// ════════════════════════════════════════════════════
//  🌐 INTERNAL API TEST (GET) — للمالك فقط
// ════════════════════════════════════════════════════

async function testApiUrl(url) {
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json,text/html,*/*;q=0.9'
            },
            timeout: 12000,
            responseType: 'text',
            transformResponse: [(d) => d],
            validateStatus: () => true,
            maxContentLength: 5 * 1024 * 1024,
        });

        const ct = String(res.headers['content-type'] || '');
        const cl = parseInt(res.headers['content-length'] || '0') || 0;
        let dataType = 'binary', responseData = null, responseText = null;

        if (/json/i.test(ct)) {
            try { responseData = JSON.parse(res.data); dataType = 'json'; }
            catch { responseText = String(res.data); dataType = 'text'; }
        } else if (/text|html/i.test(ct)) {
            responseText = String(res.data); dataType = 'text';
        }

        const ok = res.status >= 200 && res.status < 300;
        return {
            ok, status: res.status, statusText: res.statusText || '',
            contentType: ct, contentLength: cl, dataType,
            responseData, responseText: responseText?.slice(0, 2500), url
        };
    } catch (err) {
        return { ok: false, error: err.message, url };
    }
}

function buildApiTableItem(r) {
    const rows = [['🔗 الرابط', r.url]];

    if (r.error) {
        rows.push(['📊 الحالة', '❌ خطأ في الاتصال']);
        rows.push(['⚠️ التفاصيل', r.error]);
    } else {
        const statusIcon = r.ok ? '✅' : '❌';
        rows.push(['📊 الحالة', `${statusIcon} ${r.status} ${r.statusText}`]);
        rows.push(['📄 نوع المحتوى', r.contentType || 'غير محدد']);
        rows.push(['📦 نوع البيانات',
            r.dataType === 'json' ? '🔵 JSON' :
            r.dataType === 'text' ? '🟡 نص / HTML' : '🔴 بيانات ثنائية']);

        if (r.contentLength > 0)
            rows.push(['💾 الحجم', `${(r.contentLength / 1024).toFixed(2)} KB`]);

        if (r.dataType === 'json' && r.responseData && typeof r.responseData === 'object') {
            const keys = Object.keys(r.responseData).slice(0, 8).join(', ');
            if (keys) rows.push(['🔑 مفاتيح JSON', keys]);

            const jsonStr = JSON.stringify(r.responseData);
            const media = jsonStr.match(/https?:\/\/[^\s"']+\.(mp4|mp3|m4a|jpg|jpeg|png|gif|webp)/i);
            if (media) rows.push(['🎬 رابط ميديا مكتشف', media[0]]);
        }
    }

    return {
        type: 'table',
        title: '🌐 تقرير اختبار الـ API',
        subtitle: r.error ? 'فشل الاتصال بالرابط' : r.ok ? 'الرابط يعمل بنجاح' : 'الرابط يرجع بخطأ',
        headers: ['الحقل', 'القيمة'],
        rows
    };
}

function buildApiCodeItem(r) {
    if (!r.ok) return null;
    let content = '', language = 'text';
    if (r.dataType === 'json' && r.responseData) {
        content = JSON.stringify(r.responseData, null, 2).slice(0, 3000);
        language = 'json';
    } else if (r.responseText) {
        content = r.responseText.slice(0, 2000);
    }
    if (!content) return null;
    return { type: 'code', language, label: language === 'json' ? 'JSON Response' : 'Response Body', content };
}

function buildApiContextForAI(r) {
    let ctx = `\n\n[API TEST - ALREADY SHOWN TO USER AS TABLE]\nURL: ${r.url}\n`;
    if (r.error) {
        ctx += `Status: ERROR: ${r.error}`;
    } else {
        ctx += `Status: ${r.status} ${r.statusText}\nContent-Type: ${r.contentType || 'N/A'}\nData-Type: ${r.dataType}`;
        if (r.dataType === 'json' && r.responseData && typeof r.responseData === 'object') {
            ctx += `\nJSON Keys: ${Object.keys(r.responseData).slice(0, 15).join(', ')}`;
            ctx += `\nJSON Preview: ${JSON.stringify(r.responseData, null, 2).slice(0, 1000)}`;
        } else if (r.responseText) {
            ctx += `\nText Preview: ${r.responseText.slice(0, 500)}`;
        }
    }
    return ctx;
}

// ════════════════════════════════════════════════════
//  ⚡ INTERNAL EXEC — للمالك فقط
// ════════════════════════════════════════════════════

const BLOCKED_EXEC = [
    /rm\s+(-[rfRF]+\s+)?\/(?!\S)/,
    /rm\s+(-[rfRF]+\s+)?~\s*$/,
    /:\s*\(\)\s*\{\s*:\|:\s*&\s*\}/,
    /mkfs/,
    /dd\s+if=/,
    /chmod\s+-R\s+000/
];

function isSafeCommand(cmd) {
    return !BLOCKED_EXEC.some(p => p.test(cmd));
}

async function runExecCommand(command, timeoutMs = 30000) {
    if (!isSafeCommand(command)) {
        return { ok: false, output: `⛔ تم رفض الأمر لأسباب أمنية: "${command}"`, command };
    }

    try {
        const { stdout, stderr } = await Promise.race([
            execAsync(command, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: timeoutMs }),
            new Promise((_, rej) =>
                setTimeout(() => rej(new Error(`⏱️ انتهت مهلة التنفيذ (${timeoutMs / 1000}ث)`)), timeoutMs)
            )
        ]);
        const output = stdout?.trim() || stderr?.trim() || '✅ تم التنفيذ بنجاح (لا يوجد إخراج)';
        return { ok: true, output, command };
    } catch (e) {
        return { ok: false, output: e.message || 'خطأ غير معروف أثناء التنفيذ', command };
    }
}

// ════════════════════════════════════════════════════
//  📄 STRUCTURED RESPONSE PARSER
// ════════════════════════════════════════════════════

function parseStructuredResponse(rawText) {
    let cleaned = stripCodeFence(String(rawText || '').replace(/\[citation:\d+\]/gi, ''));

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    const parsed = safeJsonParse(cleaned);
    const normalized = [];

    if (parsed && typeof parsed === 'object') {
        const items =
            Array.isArray(parsed.messages) ? parsed.messages :
            Array.isArray(parsed.items) ? parsed.items :
            Array.isArray(parsed.response) ? parsed.response :
            Array.isArray(parsed) ? parsed : [];

        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const type = String(item.type || item.kind || '').trim().toLowerCase();

            if (!type || type === 'text' || type === 'message' || type === 'paragraph') {
                const c = stripMarkdown(String(item.content ?? item.text ?? item.message ?? '').trim());
                if (c) normalized.push({ type: 'text', content: c });
                continue;
            }

            if (type === 'code') {
                const raw = stripCodeFence(String(item.content ?? item.code ?? item.source ?? '')).trim();
                const c = stripMarkdownLinksFromCode(raw);
                if (!c) continue;
                const lang = normalizeLanguage(item.language || item.lang || 'text');
                const label = String(item.label || item.caption || item.title || prettyLanguage(lang)).trim();
                normalized.push({ type: 'code', language: lang, label: label || prettyLanguage(lang), content: c });
                continue;
            }

            if (type === 'table') {
                const title = String(item.title ?? item.caption ?? 'Table').trim();
                const subtitle = String(item.subtitle ?? item.description ?? '').trim();
                const headers = Array.isArray(item.headers)
                    ? item.headers.map(v => String(v ?? '').trim()).filter(Boolean)
                    : [];
                const rows = normalizeArrayRows(Array.isArray(item.rows) ? item.rows : [], headers.length);
                if (!headers.length || !rows.length) continue;
                normalized.push({ type: 'table', title: title || 'Table', subtitle, headers, rows });
                continue;
            }

            if (type === 'exec') {
                const cmd = String(item.command || item.cmd || '').trim();
                if (!cmd) continue;
                normalized.push({
                    type: 'exec',
                    command: cmd,
                    description: String(item.description || item.desc || '').trim(),
                    timeout: parseInt(item.timeout || '30000') || 30000
                });
                continue;
            }
        }

        if (normalized.length > 0) return { items: uniqueBySignature(normalized), usedFallback: false };

        if (typeof parsed.content === 'string' && parsed.content.trim()) {
            return { items: [{ type: 'text', content: stripMarkdown(parsed.content.trim()) }], usedFallback: false };
        }
    }

    // Fallback: الرد مش JSON → نفصل الكود عن النص بنفسنا
    const { withoutCode, codes } = extractFencedCodeBlocks(String(rawText || '').replace(/\[citation:\d+\]/gi, ''));
    const txt = stripMarkdown(withoutCode.trim());
    const fallback = [];
    if (txt) fallback.push({ type: 'text', content: txt });
    fallback.push(...codes);
    return { items: uniqueBySignature(fallback), usedFallback: true };
}

// ════════════════════════════════════════════════════
//  📨 SUBMESSAGE BUILDER
// ════════════════════════════════════════════════════

// نص عادي "نظيف" من العناصر المُحلّلة (لمسارات الـ fallback)
function buildPlainTextFromItems(items = []) {
    const parts = [];

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        if (item.type === 'text') {
            const c = String(item.content || '').trim();
            if (c) parts.push(c);
            continue;
        }

        if (item.type === 'code') {
            const lang = normalizeLanguage(item.language || 'text');
            const label = String(item.label || prettyLanguage(lang)).trim();
            const c = stripMarkdownLinksFromCode(stripCodeFence(String(item.content || '').trim()));
            if (c) parts.push(`💻 ${label}:\n${FENCE}${lang}\n${c}\n${FENCE}`);
            continue;
        }

        if (item.type === 'table') {
            const headers = (item.headers || []).map(v => String(v ?? '').trim()).filter(Boolean);
            const rows = normalizeArrayRows(item.rows || [], headers.length);
            if (!headers.length || !rows.length) continue;

            let tableText = `📊 ${item.title || 'Table'}`;
            if (item.subtitle) tableText += `\n${item.subtitle}`;
            tableText += `\n${headers.join(' | ')}`;
            for (const r of rows) tableText += `\n${r.join(' | ')}`;
            parts.push(tableText);
            continue;
        }
    }

    return parts.join('\n\n').trim();
}

function buildSubmessagesFromStructuredItems(items = []) {
    const out = [];

    for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        if (item.type === 'text') {
            const c = String(item.content || '').trim();
            if (c) out.push({ messageType: 2, messageText: c });
            continue;
        }

        if (item.type === 'table') {
            const headers = (item.headers || []).map(v => String(v ?? '').trim()).filter(Boolean);
            const rows = normalizeArrayRows(item.rows || [], headers.length);
            if (!headers.length || !rows.length) continue;

            out.push({ messageType: 2, messageText: `- table: ${item.title || 'Table'}` });
            out.push({
                messageType: 4,
                tableMetadata: {
                    title: item.title || 'Table',
                    subtitle: item.subtitle || item.title || 'Table',
                    rows: [
                        { items: headers, isHeading: true },
                        ...rows.map(r => ({ items: r, isHeading: false }))
                    ]
                }
            });
            continue;
        }

        if (item.type === 'code') {
            const c = stripMarkdownLinksFromCode(stripCodeFence(String(item.content || '').trim()));
            if (!c) continue;
            const lang = normalizeLanguage(item.language || 'text');
            const label = String(item.label || prettyLanguage(lang)).trim();

            out.push({ messageType: 2, messageText: `- code: ${label}` });
            out.push({
                messageType: 5,
                codeMetadata: {
                    codeLanguage: lang,
                    codeBlocks: [{ highlightType: 1, codeContent: c }]
                }
            });
            continue;
        }
    }

    return out;
}

// ════════════════════════════════════════════════════
//  🚀 RICH MESSAGE SENDER
// ════════════════════════════════════════════════════

async function sendRichComponent({ client, m, botJid, generateWAMessageFromContent, submessages }) {
    const msg = await generateWAMessageFromContent(
        m.chat,
        {
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages,
                        contextInfo: {
                            isForwarded: true,
                            forwardingScore: 1,
                            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
                            forwardOrigin: 4
                        }
                    }
                }
            }
        },
        {
            senderId: botJid,
            userJid: botJid,
            messageId: (typeof client.generateMessageIDV2 === 'function')
                ? client.generateMessageIDV2(botJid)
                : 'NEOXR-' + Date.now().toString(36).toUpperCase()
        }
    );
    await client.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
}

// ════════════════════════════════════════════════════
//  📂 SMART FILE FINDER
// ════════════════════════════════════════════════════

function findTargetedFiles(text, allFiles) {
    const textLower = text.toLowerCase();
    const scored = [];

    for (const fp of allFiles) {
        const base = path.basename(fp);
        const clean = fp.replace(/^\.\//, '');
        const baseLower = base.toLowerCase();
        const noExt = base.replace(/\.[^.]+$/, '');

        let score = 0;
        if (text.includes(base)) score = 10;
        else if (text.includes(clean)) score = 9;
        else if (textLower.includes(baseLower)) score = 7;
        else if (textLower.includes(clean.toLowerCase())) score = 6;
        else if (noExt.length > 2 && textLower.includes(noExt.toLowerCase())) score = 4;

        if (score > 0) scored.push({ fp, score });
    }

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(x => x.fp);
}

function getQuotedTextContent(m) {
    if (!m?.quoted) return null;
    const q = m.quoted;
    return (
        q.text || q.body || q.caption ||
        q.message?.conversation ||
        q.message?.extendedTextMessage?.text ||
        q.message?.imageMessage?.caption ||
        q.message?.videoMessage?.caption ||
        q.message?.documentMessage?.caption ||
        (typeof q.content === 'string' ? q.content : null) ||
        null
    );
}

// بيجمّع سياق السيرفر (شجرة الملفات + الملفات المطلوبة) — للمالك فقط
function buildServerContext(questionText) {
    const allFiles = [
        ...getFilesTree('./plugins'),
        ...getFilesTree('./lib'),
        ...['handler.js', 'index.js', 'client.js', 'config.json', 'package.json']
            .filter(f => fs.existsSync(f))
    ];

    const treeContext = allFiles
        .map(p => `- /home/container/${p.replace(/^\.\//, '')}`)
        .join('\n');

    const targetFiles = findTargetedFiles(questionText, allFiles);
    let fileContext = '';

    for (const fp of targetFiles) {
        try {
            const name = `/home/container/${fp.replace(/^\.\//, '')}`;
            const raw = fs.readFileSync(fp, 'utf8');
            const MAX = 8000;
            const display = raw.length > MAX
                ? raw.slice(0, MAX) + `\n\n... [⚠️ مقتطع — الحجم الأصلي: ${raw.length} حرف]`
                : raw;
            fileContext += `\n\n[TARGETED FILE: ${name}]\n${display}\n`;
        } catch (e) {
            fileContext += `\n\n[FILE READ ERROR: ${fp}] ${e.message}\n`;
        }
    }

    if (targetFiles.length === 0) {
        const pluginJsFiles = getFilesTree('./plugins').filter(f => f.endsWith('.js'));
        const samples = pluginJsFiles
            .map(fp => { try { return { fp, size: fs.statSync(fp).size }; } catch { return null; } })
            .filter(Boolean)
            .sort((a, b) => a.size - b.size)
            .slice(0, 3);

        for (const { fp } of samples) {
            try {
                const name = `/home/container/${fp.replace(/^\.\//, '')}`;
                const raw = fs.readFileSync(fp, 'utf8');
                const MAX_S = 3000;
                const display = raw.length > MAX_S ? raw.slice(0, MAX_S) + '\n... [مقتطع]' : raw;
                fileContext += `\n\n[SAMPLE PLUGIN — REAL STRUCTURE REFERENCE: ${name}]\n${display}\n`;
            } catch {}
        }

        if (fs.existsSync('./handler.js')) {
            try {
                const raw = fs.readFileSync('./handler.js', 'utf8');
                const MAX_H = 4000;
                fileContext += `\n\n[HANDLER.JS — plugin context injection]:\n${raw.slice(0, MAX_H)}${raw.length > MAX_H ? '\n... [مقتطع]' : ''}\n`;
            } catch {}
        }
    }

    return { treeContext, fileContext };
}

// ════════════════════════════════════════════════════
//  🤖 MAIN PLUGIN
// ════════════════════════════════════════════════════

const RESET_COMMANDS = /^(ديبريست|deepreset)$/i;
const RESET_WORDS    = /^(ريست|مسح|reset|clear)$/i;

export const run = {
    usage: ['ديب', 'دبسيك', 'ديبريست'],
    command: ['ديب', 'دبسيك', 'ديبريست'],
    use: 'للتحدث مع DeepSeek (تفكير + بحث + عرض غني)',
    category: 'قسم الذكاء الاصطناعي🤖',
    limit: true,
    async: async (m, { client, text, isPrefix, command, isOwner, plugins, Utils }) => {

        const userId = m.sender;

        try {
            // ───── Reset ─────
            if ((command && RESET_COMMANDS.test(command)) || (text && RESET_WORDS.test(text.trim()))) {
                sessions.delete(userId);
                return client.reply(m.chat, '🔄 تم مسح الذاكرة، المحادثة القادمة هتبدأ من جديد.', m);
            }

            const q    = m.quoted ? m.quoted : m;
            const mime = (q.msg || q).mimetype || '';

            // نص الرسالة المقتبسة (لو مفيش ميديا)
            const quotedTextContent = (m.quoted && !mime) ? getQuotedTextContent(m) : null;

            let questionText = text || '';
            if (quotedTextContent) {
                questionText = questionText
                    ? `${questionText}\n\n[محتوى الرسالة المُرفقة]:\n${quotedTextContent}`
                    : quotedTextContent;
            }

            // ───── Help ─────
            if (!questionText && !mime) {
                const p = isPrefix + command;
                let help =
                    `*_╭──══─┈•⤣⚡⤤•┈─══─╭_*\n` +
                    `🤖 *DeepSeek AI* (تفكير + بحث)\n\n` +
                    `• اسأل أي سؤال: \`${p} كيف تصنع كعكة؟\`\n` +
                    `• ارفع صورة/ملف مع تعليق أو رد عليه\n` +
                    `• تصفير الذاكرة: \`${isPrefix}ديبريست\` أو \`${p} ريست\``;
                if (isOwner) {
                    help +=
                        `\n\n*وضع المطور (للمالك):*\n` +
                        `• قراءة ملف من السيرفر وتعديله:\n← \`${p} صلح الأخطاء في ستيكر.js\`\n` +
                        `• اختبار API وتقرير جدول تلقائي:\n← \`${p} حول البلوجن ده https://api.example.com\`\n` +
                        `• تنفيذ أمر على السيرفر:\n← \`${p} نزّل مكتبة axios\``;
                }
                help += `\n*_╯──══─┈•⤣⚡⤤•┈─══─╰_*`;
                return await client.sendMessage(m.chat, { text: help }, { quoted: m });
            }

            await m.react('⏳');

            const { sessionId, lastMsgId, turns } = await getOrCreateSession(userId);

            // ───── File Upload (DeepSeek) ─────
            let fileId = null;
            if (mime) {
                await m.react('📥');

                let fileName =
                    q.msg?.fileName ||
                    q.fileName ||
                    q.msg?.documentMessage?.fileName ||
                    '';

                const fileBuffer = await client.downloadMediaMessage(q);

                if (!fileName) {
                    if (mime.startsWith('image/')) {
                        const sub = mime.split('/')[1]?.split(';')[0] || 'jpg';
                        fileName = `image.${sub === 'jpeg' ? 'jpg' : sub}`;
                    } else {
                        fileName = 'file.bin';
                    }
                }

                const ext        = (fileName.split('.').pop() || '').toLowerCase();
                const mappedMime = MIME_BY_EXT[ext];
                const isImage    = mime.startsWith('image/');

                if (!mappedMime && !isImage) {
                    await m.react('❌');
                    return client.reply(
                        m.chat,
                        `*الصيغة غير مدعومة* \`.${ext}\`\n\nالصيغ المتاحة:\nصور • pdf • txt • md • doc/docx • xls/xlsx • ppt/pptx • py • sql • php • js • html • c • cxx • jsx • css`,
                        m
                    );
                }

                const finalMime = isImage
                    ? (mime || mappedMime || 'image/jpeg')
                    : (mappedMime || mime || 'application/octet-stream');

                fileId = await uploadBuffer(fileBuffer, finalMime, fileName);
                await m.react('🧠');
            }

            if (!questionText) questionText = 'صف هذا الملف أو الصورة';

            // ───── Baileys (للرسائل الغنية) ─────
            let generateWAMessageFromContent = null;
            let botJid = null;
            try {
                let baileysLib;
                try { baileysLib = await import('@whiskeysockets/baileys'); }
                catch { baileysLib = await import('baileys'); }
                generateWAMessageFromContent =
                    baileysLib?.generateWAMessageFromContent ||
                    baileysLib?.default?.generateWAMessageFromContent ||
                    baileysLib?.default?.default?.generateWAMessageFromContent;
                botJid = client.user?.id || client.user?.jid || null;
            } catch (e) {
                console.error('تعذر تحميل Baileys للرسائل الغنية:', e.message);
            }

            // ───── وضع المطور (المالك فقط): ملفات السيرفر + اختبار API ─────
            let treeContext = '';
            let fileContext = '';
            const apiItems = [];
            let apiContext = '';

            if (isOwner) {
                ({ treeContext, fileContext } = buildServerContext(questionText));

                const urlMatch = questionText.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                    const result = await testApiUrl(urlMatch[0].trim());
                    apiItems.push(buildApiTableItem(result));
                    const codeBlock = buildApiCodeItem(result);
                    if (codeBlock) apiItems.push(codeBlock);
                    apiContext = buildApiContextForAI(result);
                }
            }

            // ───── Prompt ─────
            const identity = isOwner && devPersona
                ? devPersona
                : 'You are DeepSeek, a helpful, accurate assistant inside a WhatsApp bot. Reply in the same language/dialect the user writes in.';

            const execRule = isOwner
                ? `[EXEC USAGE]\nUse exec ONLY when explicitly needed (install packages, terminal commands, fix dependencies).`
                : `[EXEC USAGE]\nNever use "exec". It is disabled for this user.`;

            const serverBlock = isOwner
                ? `\n[SERVER STRUCTURE]\n${treeContext}\n\nRegistered Plugins: [${Object.keys(plugins || {}).join(', ')}]\n${fileContext}${apiContext}\nFollow the bot's plugin architecture (ESM, Baileys, neoxr-style) when writing plugins.\n`
                : '';

            const systemInstruction = `[IDENTITY]
${identity}

[STRICT OUTPUT FORMAT]
Return ONE JSON object only. No markdown outside JSON. No text outside schema. Do NOT include citations like [citation:1].
Schema:
{
  "messages": [
    { "type": "text",  "content": "plain Arabic/English — ZERO markdown" },
    { "type": "table", "title": "Title", "subtitle": "Subtitle", "headers": ["Col1","Col2"], "rows": [["A","B"]] },
    { "type": "code",  "language": "javascript", "label": "Label", "content": "raw code" },
    { "type": "exec",  "command": "shell command", "description": "وصف عربي", "timeout": 30000 }
  ]
}
Rules:
- ANY code (even one line) MUST be in a "code" item, never inside "text".
- Comparisons / lists of fields / structured data → use a "table" item.
- Escape newlines inside JSON strings as \\n.

${execRule}
${serverBlock}`;

            const fullPrompt = `${systemInstruction}\n\n[طلب المستخدم الحالي]:\n${questionText}`;

            // ───── DeepSeek Completion ─────
            const powHeader = await buildPoWHeader('/api/v0/chat/completion');

            const chatRes = await axios.post(
                `${CONFIG.BASE_URL}/api/v0/chat/completion`,
                {
                    chat_session_id   : sessionId,
                    parent_message_id : lastMsgId,
                    prompt            : fullPrompt,
                    ref_file_ids      : fileId ? [fileId] : [],
                    thinking_enabled  : CONFIG.THINKING_ENABLED,
                    search_enabled    : CONFIG.SEARCH_ENABLED,
                    model_type        : 'default',
                    action            : null,
                    preempt           : false,
                },
                {
                    headers      : authHeaders({
                        'x-ds-pow-response' : powHeader,
                        'Accept'            : 'text/event-stream',
                    }),
                    responseType : 'stream',
                    timeout      : CONFIG.HTTP_TIMEOUT,
                }
            );

            const { text: rawAnswer, thinking, messageId } = await collectStream(chatRes.data);

            if (messageId) saveSession(userId, sessionId, messageId, turns + 1);

            if (!rawAnswer?.trim()) {
                await m.react('❌').catch(() => {});
                return client.reply(m.chat, '❌ لم أستطع توليد رد، حاول مرة أخرى.', m);
            }

            // ───── Parse + Exec ─────
            const { items: rawItems } = parseStructuredResponse(rawAnswer);
            const processedItems = [];

            for (const item of rawItems) {
                if (item.type === 'exec') {
                    if (!isOwner) {
                        processedItems.push({ type: 'text', content: '⛔ تنفيذ الأوامر على السيرفر للمالك فقط.' });
                        continue;
                    }
                    const execRes = await runExecCommand(item.command, item.timeout);
                    processedItems.push({
                        type: 'text',
                        content: `⚡ ${item.description || 'تنفيذ أمر'}: ${item.command}\n${execRes.ok ? '✅ نجح التنفيذ' : '❌ فشل التنفيذ'}`
                    });
                    processedItems.push({
                        type: 'code', language: 'bash', label: 'نتيجة الأمر', content: execRes.output
                    });
                } else {
                    processedItems.push(item);
                }
            }

            const finalItems = [
                ...apiItems,
                ...(processedItems.length > 0
                    ? processedItems
                    : [{ type: 'text', content: stripMarkdown(rawAnswer.trim()) }])
            ].filter(Boolean);

            // التفكير (مقفول افتراضياً)
            if (CONFIG.SHOW_THINKING && thinking) {
                finalItems.unshift({ type: 'text', content: `💭 التفكير:\n${thinking}` });
            }

            // ───── Safety Net: ملف نصي لو الرد كبير/متكسّر ─────
            const needsFileFallback =
                finalItems.length === 0 ||
                finalItems.some(it => it.type === 'text' && isLikelyCorruptedText(it.content)) ||
                finalItems.some(it => String(it.content || '').length > FILE_FALLBACK_CHAR_THRESHOLD);

            if (needsFileFallback) {
                const filename = guessOutputFilename(questionText, rawAnswer);
                const cleanContent = buildPlainTextFromItems(finalItems) || stripMarkdown(rawAnswer.trim());
                try {
                    await sendTextAsFile(
                        client, m, cleanContent, filename,
                        '📄 الرد كان كبير أو صياغته مش مضمونة، فتم إرساله كملف نصي عشان يوصلك كامل وبدون أي تلف في التنسيق.'
                    );
                } catch (fileErr) {
                    console.error('[DeepSeek] فشل إرسال الملف الاحتياطي:', fileErr);
                    const safeFallback = cleanContent.slice(0, 3500);
                    await client.sendMessage(m.chat, { text: safeFallback || '❌ لم يتم توليد أي رد صالح.' }, { quoted: m });
                }
                await m.react('✅').catch(() => {});
                return;
            }

            // ───── Rich Message ─────
            const submessages = buildSubmessagesFromStructuredItems(finalItems).filter(Boolean);

            if (submessages.length > 0 && typeof generateWAMessageFromContent === 'function' && botJid) {
                try {
                    await sendRichComponent({ client, m, botJid, generateWAMessageFromContent, submessages });
                } catch (sendErr) {
                    console.error('[DeepSeek] فشل إرسال الرسالة الغنية، جاري الإرسال كملف احتياطي:', sendErr);
                    const filename = guessOutputFilename(questionText, rawAnswer);
                    const cleanContent = buildPlainTextFromItems(finalItems) || stripMarkdown(rawAnswer.trim());
                    await sendTextAsFile(client, m, cleanContent, filename, '📄 حصلت مشكلة في تنسيق الرد، تم إرساله كملف نصي.');
                }
            } else {
                const fallback = buildPlainTextFromItems(finalItems) || stripMarkdown(rawAnswer.trim());
                await client.sendMessage(m.chat, { text: fallback || '❌ لم يتم توليد أي رد صالح.' }, { quoted: m });
            }

            await m.react('✅');

        } catch (err) {
            console.error('[DeepSeek API Error]:', err);
            await m.react('❌').catch(() => {});
            const data = err.response?.data;
            const detail = (data && typeof data === 'object' && typeof data.pipe !== 'function')
                ? JSON.stringify(data)
                : err.message;
            client.reply(m.chat, `*حدث خطأ أثناء التواصل مع DeepSeek:*\n\n${detail}`, m);
        }
    }
};
