// Montagem e leitura das mensagens do protocolo (ver protocolo_geotag.md).

export const TAM_MAX = 63;      // caracteres por mensagem, contando o \n
export const MAX_CODIGO = 8;    // palavra-código
export const MAX_DICA = 32;     // dica bem-humorada

// Remove acentos e qualquer caractere fora do ASCII imprimível.
export function paraAscii(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/"/g, "'")
    .replace(/\\/g, '/');
}

export function normalizarCodigo(c) {
  return paraAscii(c).trim().toUpperCase();
}

// Converte graus (float) em micrograus (inteiro).
export function microgr(graus) {
  return Math.round(graus * 1e6);
}

// Serializa uma mensagem e garante o limite de tamanho.
export function montar(obj) {
  const linha = JSON.stringify(obj) + '\n';
  if (linha.length > TAM_MAX) {
    throw new Error(`Mensagem com ${linha.length} caracteres (máx. ${TAM_MAX}): ${linha.trim()}`);
  }
  return linha;
}

// Interpreta uma linha recebida. Retorna o objeto ou null se for inválida.
export function ler(linha) {
  try {
    const obj = JSON.parse(linha.trim());
    if (obj && typeof obj === 'object' && typeof obj.t === 'string') return obj;
  } catch (_) { /* ignora */ }
  return null;
}

// Mensagens do app para o Arduino
export const msg = {
  oi: () => montar({ t: 'oi' }),
  tag: (i, la, lo, n) => montar({ t: 'tag', i, la, lo, n }),
  dsc: (i, d) => montar({ t: 'dsc', i, d }),
  pos: (la, lo) => montar({ t: 'pos', la, lo }),
  chk: (n) => montar({ t: 'chk', n }),
};

// Mensagens do Arduino para o app (usadas pelo simulador)
export const resp = {
  id: (g, e) => montar({ t: 'id', g, e }),
  ok: (i) => montar({ t: 'ok', i }),
  st: (i, s, extra = {}) => montar({ t: 'st', i, s, ...extra }),
  res: (i, ok) => montar({ t: 'res', i, ok }),
  end: () => montar({ t: 'end' }),
  err: (c) => montar({ t: 'err', c }),
};

// Confere se um tag do gabarito gera mensagens dentro do limite.
export function validarTag(tag) {
  const erros = [];
  if (!tag.n || tag.n.length > MAX_CODIGO) erros.push(`palavra-código deve ter 1 a ${MAX_CODIGO} caracteres`);
  if (!/^[A-Z0-9]+$/.test(tag.n || '')) erros.push('palavra-código: use só letras e números, sem espaço');
  if (!tag.d || tag.d.length > MAX_DICA) erros.push(`dica deve ter 1 a ${MAX_DICA} caracteres`);
  try {
    msg.tag(tag.i, tag.la, tag.lo, tag.n);
    msg.dsc(tag.i, tag.d);
    resp.st(tag.i, 5, { d: tag.d });
  } catch (e) {
    erros.push(e.message);
  }
  return erros;
}
