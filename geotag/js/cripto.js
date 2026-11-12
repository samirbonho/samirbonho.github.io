// Criptografia do gabarito (PBKDF2 + AES-GCM) e código de verificação (HMAC-SHA256).
// Usa a Web Crypto API, disponível no navegador (HTTPS) e no Node 20+.

const ITERACOES = 200000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function deB64(texto) {
  const s = atob(texto);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function chave(senha, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERACOES, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Retorna o texto do arquivo gabarito.enc.
// "publico" fica legível sem senha (ex.: data de criação).
export async function criptografar(objeto, senha, publico = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await chave(senha, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(objeto)));
  return JSON.stringify({ v: 1, ...publico, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}

export function lerPublico(textoArquivo) {
  const { salt, iv, ct, ...publico } = JSON.parse(textoArquivo);
  return publico;
}

// Lança erro se a senha estiver errada ou o arquivo corrompido.
export async function descriptografar(textoArquivo, senha) {
  const a = JSON.parse(textoArquivo);
  const k = await chave(senha, deB64(a.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(a.iv) }, k, deB64(a.ct));
    return JSON.parse(dec.decode(pt));
  } catch (_) {
    throw new Error('Senha incorreta.');
  }
}

export function segredoAleatorio() {
  return b64(crypto.getRandomValues(new Uint8Array(24)));
}

// Código de verificação de 8 caracteres para o comprovante do resultado.
export async function codigoVerificacao(segredo, texto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
  return Array.from(sig.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Comprovante: "G01|2026-11-20T13:05:00.000Z|1534|2|A1B2C3D4"
export function montarBaseComprovante(grupo, inicioMs, tempoFinalS, erros) {
  return `${grupo}|${new Date(inicioMs).toISOString()}|${tempoFinalS}|${erros}`;
}

export async function verificarComprovante(segredo, comprovante) {
  const partes = comprovante.trim().split('|');
  if (partes.length !== 5) return false;
  const codigo = partes.pop();
  return (await codigoVerificacao(segredo, partes.join('|'))) === codigo.toUpperCase();
}
