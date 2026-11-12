// Página do professor: captura de posições, gabarito criptografado e verificação.
import { CONFIG } from './config.js';
import { paraAscii, normalizarCodigo, validarTag, MAX_DICA, MAX_CODIGO } from './protocolo.js';
import { criptografar, descriptografar, segredoAleatorio, verificarComprovante } from './cripto.js';

const $ = (id) => document.getElementById(id);
const CH_CAPTURAS = 'geotag_capturas';
const DURACAO_CAPTURA_S = 15;

let capturas = lerCapturas();      // [{g, i, la, lo, acc, n, d}]
let ultimaCaptura = null;          // {la, lo, acc}

function lerCapturas() {
  try { return JSON.parse(localStorage.getItem(CH_CAPTURAS)) || []; } catch (_) { return []; }
}
function gravarCapturas() {
  localStorage.setItem(CH_CAPTURAS, JSON.stringify(capturas));
  desenharTabela();
}
function mensagem(el, texto, tipo = '') { el.textContent = texto; el.className = 'msg ' + tipo; }
function baixar(nome, texto, tipo = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- campos com limite ----------
function atualizarContadores() {
  const n = normalizarCodigo($('c-codigo').value);
  const d = paraAscii($('c-dica').value);
  $('cont-codigo').textContent = `${n.length}/${MAX_CODIGO}`;
  $('cont-dica').textContent = `${d.length}/${MAX_DICA}`;
  $('cont-dica').style.color = d.length > MAX_DICA ? '#c0392b' : '';
}

// ---------- captura com média ----------
function capturar() {
  if (!('geolocation' in navigator)) { $('c-info').textContent = 'Sem GPS neste navegador.'; return; }
  const leituras = [];
  const prog = $('c-progresso');
  prog.hidden = false;
  prog.value = 0;
  $('btn-capturar').disabled = true;
  $('c-info').textContent = 'Capturando… mantenha o celular parado.';
  const id = navigator.geolocation.watchPosition(
    (p) => leituras.push({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
    (e) => { $('c-info').textContent = 'Erro de GPS: ' + e.message; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  let s = 0;
  const t = setInterval(() => {
    prog.value = ++s;
    if (s < DURACAO_CAPTURA_S) return;
    clearInterval(t);
    navigator.geolocation.clearWatch(id);
    prog.hidden = true;
    $('btn-capturar').disabled = false;
    finalizarCaptura(leituras);
  }, 1000);
}

function finalizarCaptura(leituras) {
  if (!leituras.length) { $('c-info').textContent = 'Nenhuma leitura de GPS. Tente em local aberto.'; return; }
  // Média ponderada por 1/precisão² (leituras melhores pesam mais).
  let sp = 0, sla = 0, slo = 0;
  for (const l of leituras) {
    const p = 1 / Math.max(l.acc, 1) ** 2;
    sp += p; sla += l.lat * p; slo += l.lon * p;
  }
  const melhor = Math.min(...leituras.map((l) => l.acc));
  ultimaCaptura = { la: Math.round((sla / sp) * 1e6), lo: Math.round((slo / sp) * 1e6), acc: Math.round(melhor) };
  $('c-lat').value = (ultimaCaptura.la / 1e6).toFixed(6);
  $('c-lon').value = (ultimaCaptura.lo / 1e6).toFixed(6);
  const aviso = melhor > CONFIG.PRECISAO_MAX_M ? ' Atenção: precisão ruim, tente de novo em local mais aberto.' : '';
  $('c-info').textContent = `${leituras.length} leituras, melhor precisão ${Math.round(melhor)} m.${aviso}`;
}

// ---------- salvar ----------
function salvarTag() {
  const el = $('msg-salvar');
  const g = normalizarCodigo($('c-grupo').value);
  const i = Number($('c-indice').value);
  const n = normalizarCodigo($('c-codigo').value);
  const d = paraAscii($('c-dica').value).trim();
  const lat = parseFloat($('c-lat').value.replace(',', '.'));
  const lon = parseFloat($('c-lon').value.replace(',', '.'));
  if (!/^[A-Z0-9]{1,6}$/.test(g)) { mensagem(el, 'Grupo: use de 1 a 6 letras/números (ex.: G01).', 'erro'); return; }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    mensagem(el, 'Capture a posição (ou digite latitude e longitude).', 'erro');
    return;
  }
  const tag = { g, i, la: Math.round(lat * 1e6), lo: Math.round(lon * 1e6), n, d };
  const erros = validarTag(tag);
  if (erros.length) { mensagem(el, erros.join('; '), 'erro'); return; }
  const acc = ultimaCaptura && ultimaCaptura.la === tag.la && ultimaCaptura.lo === tag.lo ? ultimaCaptura.acc : null;
  const existia = capturas.findIndex((c) => c.g === g && c.i === i);
  if (existia >= 0) capturas.splice(existia, 1);
  capturas.push({ ...tag, acc });
  capturas.sort((a, b) => a.g.localeCompare(b.g) || a.i - b.i);
  gravarCapturas();
  mensagem(el, existia >= 0 ? `Tag ${i} do grupo ${g} substituído.` : `Tag ${i} do grupo ${g} salvo.`, 'ok');
  $('c-codigo').value = ''; $('c-dica').value = ''; $('c-lat').value = ''; $('c-lon').value = '';
  $('c-info').textContent = '';
  ultimaCaptura = null;
  atualizarContadores();
}

// ---------- tabela ----------
function grupos() {
  const mapa = {};
  for (const c of capturas) (mapa[c.g] ||= {})[c.i] = c;
  return mapa;
}

function desenharTabela() {
  const tab = $('tabela-tags');
  tab.innerHTML = '<tr><th>Grupo</th><th>Tag</th><th>Código</th><th>Dica</th><th>Lat / Lon</th><th>Prec.</th><th></th></tr>';
  capturas.forEach((c, k) => {
    const tr = document.createElement('tr');
    const celulas = [c.g, c.i, c.n, c.d, `${(c.la / 1e6).toFixed(6)}<br>${(c.lo / 1e6).toFixed(6)}`, c.acc != null ? `${c.acc} m` : '-'];
    celulas.forEach((v, j) => {
      const td = document.createElement('td');
      if (j === 4) td.innerHTML = v; else td.textContent = v;
      tr.appendChild(td);
    });
    const td = document.createElement('td');
    const b = document.createElement('button');
    b.textContent = 'Excluir';
    b.addEventListener('click', () => {
      if (confirm(`Excluir o tag ${c.i} do grupo ${c.g}?`)) { capturas.splice(k, 1); gravarCapturas(); }
    });
    td.appendChild(b);
    tr.appendChild(td);
    tab.appendChild(tr);
  });
  const gs = grupos();
  const nomes = Object.keys(gs).sort();
  $('resumo-grupos').innerHTML = nomes.length
    ? nomes.map((g) => (gs[g][1] && gs[g][2]
      ? `<span class="ok-grupo">${g} ✔</span>`
      : `<span class="falta-grupo">${g}: falta o tag ${gs[g][1] ? 2 : 1}</span>`)).join(' · ')
    : 'Nenhum tag capturado ainda.';
}

// ---------- backup ----------
function exportar() {
  baixar(`geotag_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(capturas, null, 2));
}
function importar(ev) {
  const arq = ev.target.files[0];
  if (!arq) return;
  arq.text().then((t) => {
    const dados = JSON.parse(t);
    if (!Array.isArray(dados)) throw new Error('formato inválido');
    capturas = dados;
    gravarCapturas();
    alert(`${dados.length} tags carregados.`);
  }).catch((e) => alert('Não foi possível abrir: ' + e.message));
  ev.target.value = '';
}

// ---------- gerar gabarito ----------
async function gerar() {
  const el = $('msg-gerar');
  const s1 = $('g-senha').value;
  const s2 = $('g-senha2').value;
  if (s1.length < 6) { mensagem(el, 'Use uma senha com pelo menos 6 caracteres.', 'erro'); return; }
  if (s1 !== s2) { mensagem(el, 'As senhas não conferem.', 'erro'); return; }
  const gs = grupos();
  const nomes = Object.keys(gs).sort();
  if (!nomes.length) { mensagem(el, 'Nenhum tag capturado.', 'erro'); return; }
  const incompletos = nomes.filter((g) => !(gs[g][1] && gs[g][2]));
  if (incompletos.length) { mensagem(el, `Grupos incompletos: ${incompletos.join(', ')}`, 'erro'); return; }

  const criado = new Date().toISOString();
  const gabarito = { versao: 1, criado, segredo: segredoAleatorio(), grupos: {} };
  for (const g of nomes) {
    gabarito.grupos[g] = { tags: [1, 2].map((i) => {
      const { la, lo, n, d } = gs[g][i];
      return { i, la, lo, n, d };
    }) };
  }
  mensagem(el, 'Criptografando…');
  const texto = await criptografar(gabarito, s1, { criado, grupos: nomes.length });
  baixar('gabarito.enc', texto, 'application/octet-stream');
  mensagem(el, `Gabarito com ${nomes.length} grupos gerado. Envie o arquivo ao GitHub.`, 'ok');
  $('g-senha').value = ''; $('g-senha2').value = '';
}

// ---------- conferir publicado ----------
async function abrirPublicado(senha) {
  const r = await fetch(CONFIG.ARQUIVO_GABARITO, { cache: 'no-store' });
  if (!r.ok) throw new Error('gabarito.enc não encontrado no site.');
  return descriptografar(await r.text(), senha);
}

async function testar() {
  const el = $('msg-testar');
  const lista = $('lista-testar');
  lista.innerHTML = '';
  try {
    const gab = await abrirPublicado($('t-senha').value);
    mensagem(el, `OK. Gerado em ${new Date(gab.criado).toLocaleString('pt-BR')}.`, 'ok');
    for (const [g, x] of Object.entries(gab.grupos)) {
      for (const t of x.tags) {
        const li = document.createElement('li');
        li.textContent = `${g} tag ${t.i}: ${t.n} — "${t.d}" (${(t.la / 1e6).toFixed(6)}, ${(t.lo / 1e6).toFixed(6)})`;
        lista.appendChild(li);
      }
    }
  } catch (e) {
    mensagem(el, e.message, 'erro');
  }
}

// ---------- verificar comprovante ----------
async function verificar() {
  const el = $('msg-verificar');
  try {
    const gab = await abrirPublicado($('v-senha').value);
    const valido = await verificarComprovante(gab.segredo, $('v-comprovante').value);
    mensagem(el, valido ? 'Comprovante VÁLIDO.' : 'Comprovante INVÁLIDO (alterado, ou de outro gabarito).', valido ? 'ok' : 'erro');
  } catch (e) {
    mensagem(el, e.message, 'erro');
  }
}

// ---------- início ----------
$('c-codigo').addEventListener('input', atualizarContadores);
$('c-dica').addEventListener('input', atualizarContadores);
$('btn-capturar').addEventListener('click', capturar);
$('btn-salvar').addEventListener('click', salvarTag);
$('btn-exportar').addEventListener('click', exportar);
$('btn-importar').addEventListener('click', () => $('arq-backup').click());
$('arq-backup').addEventListener('change', importar);
$('btn-gerar').addEventListener('click', gerar);
$('btn-testar').addEventListener('click', testar);
$('btn-verificar').addEventListener('click', verificar);
atualizarContadores();
desenharTabela();
