// Controle do jogo: o app é o juiz.
import { CONFIG, STATUS, DIRECOES } from './config.js';
import { msg, ler, normalizarCodigo } from './protocolo.js';
import { vetor, statusPorDistancia, direcao, pertoDaFronteira, direcaoAmbigua, GpsReal } from './geo.js';
import { descriptografar, lerPublico, codigoVerificacao, montarBaseComprovante } from './cripto.js';
import { TransporteBLE } from './ble.js';

const $ = (id) => document.getElementById(id);
const CH_ESTADO = 'geotag_estado';
const CH_GABARITO = 'geotag_gabarito';
const CH_ENVIOS = 'geotag_envios';

const params = new URLSearchParams(location.search);
const GRUPO_SIM = params.get('sim');
const MODO_SIM = !!GRUPO_SIM;
// O simulador só é carregado no modo ?sim=. Assim, o arquivo js/simulador.js
// pode ser apagado do site publicado sem afetar o jogo.
let SIM = null;

// ---------- armazenamento ----------
function lerLS(chave) {
  try { return JSON.parse(localStorage.getItem(chave)); } catch (_) { return null; }
}
function gravarLS(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (_) { /* sem espaço */ }
}

let gabarito = lerLS(CH_GABARITO); // {criado, segredo, grupos}
let estado = lerLS(CH_ESTADO);     // {grupo, inicio, tagAtual, erros, divergencias, fim, ...}
let textoGabaritoEnc = null;

function salvarEstado() { gravarLS(CH_ESTADO, estado); }

// ---------- utilidades de tela ----------
function mostrarTela(id) {
  document.querySelectorAll('.tela').forEach((t) => { t.hidden = t.id !== id; });
}
function mensagem(el, texto, tipo = '') {
  el.textContent = texto;
  el.className = 'msg ' + tipo;
}
function formatarTempo(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}
function badge(texto, classe) {
  const b = $('badge-conexao');
  b.textContent = texto;
  b.className = 'badge ' + classe;
}

// ---------- divergências (Arduino diferente do esperado) ----------
function registrarDivergencia(tipo, detalhe) {
  if (!estado || estado.envioEnfileirado) return;
  const d = estado.divergencias || (estado.divergencias = {});
  if (!d[tipo]) d[tipo] = { n: 0, exemplo: detalhe };
  d[tipo].n += 1;
  salvarEstado();
  console.warn('Divergência:', tipo, detalhe);
}
function totalDivergencias() {
  return Object.values(estado?.divergencias || {}).reduce((a, x) => a + x.n, 0);
}

// ---------- transporte e fila de mensagens ----------
let transporte = null;
let arduinoSim = null;
let pendente = null;                 // {tipos, resolve}
let filaReq = Promise.resolve();
let sessaoAtiva = false;

function aoReceberLinha(linha) {
  const m = ler(linha);
  if (!m) { console.warn('Linha inválida do Arduino:', linha); return; }
  if (pendente && (pendente.tipos.includes(m.t) || m.t === 'err')) {
    const p = pendente;
    pendente = null;
    p.resolve(m);
    return;
  }
  if (m.t === 'end') {
    if (estado) { estado.arduinoEnd = true; salvarEstado(); }
    return;
  }
  console.warn('Mensagem fora de hora:', linha);
}

// Envia e espera uma resposta de um dos tipos esperados. Resolve com a mensagem ou null.
function requisitar(linha, tipos, tentativas = CONFIG.TENTATIVAS) {
  const tarefa = filaReq.then(async () => {
    for (let k = 0; k <= tentativas; k++) {
      if (!transporte?.conectado) return null;
      const resposta = new Promise((resolve) => {
        pendente = { tipos, resolve };
        setTimeout(() => {
          if (pendente && pendente.resolve === resolve) { pendente = null; resolve(null); }
        }, CONFIG.TIMEOUT_RESPOSTA_MS);
      });
      try { await transporte.enviar(linha); } catch (_) { pendente = null; return null; }
      const r = await resposta;
      if (r) return r;
    }
    return null;
  });
  filaReq = tarefa.catch(() => null);
  return tarefa;
}

// ---------- GPS ----------
let gps = null;
let ultimaLeitura = null; // leitura aceita (precisão ok)

function iniciarGps() {
  if (gps) return;
  if (MODO_SIM) {
    const tag1 = tagsDoGrupo(GRUPO_SIM)?.[0];
    gps = new SIM.GpsSimulado(tag1 ? tag1.la : -22900000, tag1 ? tag1.lo : -43200000);
    if (tag1) gps.irPara(tag1.la, tag1.lo, 150);
  } else {
    gps = new GpsReal();
  }
  gps.iniciar((p) => {
    const ok = p.acc <= CONFIG.PRECISAO_MAX_M;
    if (ok) ultimaLeitura = p;
    $('info-gps').textContent = ok
      ? `GPS: precisão de ${Math.round(p.acc)} m`
      : `GPS impreciso (${Math.round(p.acc)} m). Vá para um lugar aberto.`;
    atualizarBotaoAchei();
    atualizarInfoSim();
  }, (erro) => { $('info-gps').textContent = 'GPS: ' + erro; });
}

function leituraValida() {
  return ultimaLeitura && Date.now() - ultimaLeitura.ts <= CONFIG.GPS_VALIDADE_MS ? ultimaLeitura : null;
}

// ---------- gabarito ----------
function tagsDoGrupo(g) {
  return gabarito?.grupos?.[g]?.tags?.slice().sort((a, b) => a.i - b.i) || null;
}
function tagAtual() {
  return tagsDoGrupo(estado.grupo)[estado.tagAtual - 1];
}

async function carregarArquivoGabarito() {
  const r = await fetch(CONFIG.ARQUIVO_GABARITO, { cache: 'no-store' });
  if (!r.ok) throw new Error('Arquivo de gabarito não encontrado.');
  return r.text();
}

async function prepararTelaPrep() {
  mostrarTela('tela-prep');
  try {
    textoGabaritoEnc = await carregarArquivoGabarito();
    const pub = lerPublico(textoGabaritoEnc);
    $('info-gabarito').textContent = pub.criado
      ? `Gabarito gerado em ${new Date(pub.criado).toLocaleString('pt-BR')}`
      : 'Gabarito carregado.';
    if (pub.demo) $('info-gabarito').textContent += ' — gabarito de DEMONSTRAÇÃO (senha: demo1234).';
  } catch (e) {
    $('info-gabarito').textContent = 'Erro: ' + e.message + ' Verifique a internet.';
  }
}

async function verificarSenha(senha) {
  if (!textoGabaritoEnc) textoGabaritoEnc = await carregarArquivoGabarito();
  return descriptografar(textoGabaritoEnc, senha);
}

// ---------- sessão com o Arduino ----------
async function conectar() {
  const msgEl = $('msg-conectar');
  try {
    if (!transporte) criarTransporte();
    mensagem(msgEl, 'Conectando…');
    await transporte.conectar();
    await iniciarSessao();
  } catch (e) {
    mensagem(msgEl, e.name === 'NotFoundError' ? 'Nenhum dispositivo escolhido.' : 'Falha: ' + e.message, 'erro');
  }
}

function criarTransporte() {
  if (MODO_SIM) {
    arduinoSim = new SIM.ArduinoSimulado(GRUPO_SIM, params.get('defeito') === '1');
    transporte = new SIM.TransporteSimulado(arduinoSim);
  } else {
    transporte = new TransporteBLE();
  }
  transporte.aoReceberLinha = aoReceberLinha;
  transporte.aoDesconectar = aoDesconectar;
}

async function iniciarSessao() {
  const msgEl = $('msg-conectar');
  badge(MODO_SIM ? 'simulador' : 'conectado', MODO_SIM ? 'sim' : 'on');

  const id = await requisitar(msg.oi(), ['id']);
  if (!id || id.t !== 'id') throw new Error('o Arduino não respondeu ao "oi".');
  const g = String(id.g || '').toUpperCase();
  if (!tagsDoGrupo(g)) throw new Error(`o grupo "${id.g}" não está no gabarito.`);

  if (estado && estado.grupo !== g) {
    throw new Error(`este celular está com um jogo do grupo ${estado.grupo}. Peça ao professor um "Novo jogo".`);
  }
  if (!estado) {
    estado = { grupo: g, inicio: Date.now(), tagAtual: 1, erros: 0, divergencias: {}, fim: null };
    salvarEstado();
  }
  if (estado.fim) { mostrarResultado(); return; }

  if (id.e === 0) {
    mensagem(msgEl, 'Enviando gabarito ao Arduino…');
    await enviarGabarito();
    if (estado.tagAtual === 2) {
      // Arduino resetou depois do tag 1: avança ele para o tag 2.
      const r = await requisitar(msg.chk(tagsDoGrupo(g)[0].n), ['res'], 0);
      if (!r || r.ok !== 1) registrarDivergencia('reset', 'não avançou para o tag 2 após reenvio do gabarito');
    }
  } else if (id.e !== estado.tagAtual) {
    registrarDivergencia('estado', `Arduino em e=${id.e}, app no tag ${estado.tagAtual}`);
  }

  mensagem(msgEl, '');
  sessaoAtiva = true;
  entrarNaBusca();
}

async function enviarGabarito() {
  for (const t of tagsDoGrupo(estado.grupo)) {
    const r1 = await requisitar(msg.tag(t.i, t.la, t.lo, t.n), ['ok']);
    const r2 = await requisitar(msg.dsc(t.i, t.d), ['ok']);
    if (!r1 || r1.t !== 'ok' || !r2 || r2.t !== 'ok') {
      throw new Error(`o Arduino não confirmou o tag ${t.i} (esperado "ok").`);
    }
    if (r1.i !== t.i || r2.i !== t.i) registrarDivergencia('ok', `ok com i errado para o tag ${t.i}`);
  }
}

let timerReconexao = null;
function aoDesconectar() {
  sessaoAtiva = false;
  badge('desconectado', 'off');
  if (!estado || estado.fim) return;
  mensagem($('msg-busca'), 'Conexão perdida. Tentando reconectar… Fique perto do Arduino.', 'erro');
  $('btn-reconectar').hidden = false;
  clearInterval(timerReconexao);
  timerReconexao = setInterval(tentarReconectar, 4000);
}

let reconectando = false;
async function tentarReconectar() {
  if (reconectando || transporte?.conectado) return;
  reconectando = true;
  try {
    await transporte.reconectar();
    clearInterval(timerReconexao);
    $('btn-reconectar').hidden = true;
    mensagem($('msg-busca'), 'Reconectado!', 'ok');
    await iniciarSessao();
  } catch (e) {
    if (transporte?.conectado) mensagem($('msg-busca'), 'Falha: ' + e.message, 'erro');
  } finally {
    reconectando = false;
  }
}

// ---------- busca ----------
let lacoPos = null;
let cronometro = null;
let enviandoPos = false;
let palpitando = false;

function entrarNaBusca() {
  mostrarTela('tela-busca');
  $('pl-grupo').textContent = estado.grupo;
  atualizarPlacar();
  iniciarGps();
  pedirTelaLigada();
  clearInterval(lacoPos);
  lacoPos = setInterval(cicloPos, CONFIG.INTERVALO_POS_MS);
  clearInterval(cronometro);
  cronometro = setInterval(atualizarPlacar, 1000);
  cicloPos();
}

function atualizarPlacar() {
  if (!estado) return;
  $('pl-tag').textContent = `${Math.min(estado.tagAtual, 2)}/2`;
  $('pl-erros').textContent = estado.erros;
  const fim = estado.fim || Date.now();
  $('pl-tempo').textContent = formatarTempo((fim - estado.inicio) / 1000);
}

async function cicloPos() {
  if (!sessaoAtiva || enviandoPos || palpitando || !estado || estado.fim) return;
  const p = leituraValida();
  if (!p) return;
  enviandoPos = true;
  try {
    const st = await requisitar(msg.pos(p.la, p.lo), ['st']);
    if (!st) { registrarDivergencia('sem_st', 'sem resposta ao "pos"'); return; }
    if (st.t === 'err' && st.c === 1) {
      // Arduino perdeu o gabarito (reset/queda de energia): refaz a sessão.
      sessaoAtiva = false;
      mensagem($('msg-busca'), 'O Arduino reiniciou. Reenviando o gabarito…');
      try { await iniciarSessao(); mensagem($('msg-busca'), ''); } catch (e) { mensagem($('msg-busca'), 'Falha: ' + e.message, 'erro'); }
      return;
    }
    if (st.t === 'err') { registrarDivergencia('err', `err c=${st.c} em resposta ao "pos"`); return; }
    mostrarStatus(st);
    conferirStatus(st, p);
  } finally {
    enviandoPos = false;
  }
}

function mostrarStatus(st) {
  const info = STATUS[st.s] || { nome: `Status ${st.s}?`, emoji: '❓', cor: '#5b6878' };
  $('cartao-status').style.background = info.cor;
  $('st-emoji').textContent = info.emoji;
  $('st-nome').textContent = info.nome;
  $('st-direcao').textContent = st.dir ? `Vá mais para o ${DIRECOES[st.dir] || st.dir}` : '';
  $('st-dica').textContent = st.d ? `“${st.d}”` : '';
}

// O app calcula o que o Arduino deveria ter respondido.
function conferirStatus(st, p) {
  const t = tagAtual();
  const { dx, dy, d } = vetor(p.la, p.lo, t.la, t.lo);
  const esperado = statusPorDistancia(d);
  if (st.i !== estado.tagAtual) registrarDivergencia('st_i', `i=${st.i}, esperado ${estado.tagAtual}`);
  if (st.s !== esperado && !pertoDaFronteira(d)) {
    registrarDivergencia('st_s', `s=${st.s}, esperado ${esperado} (${d.toFixed(1)} m)`);
  }
  if (st.s === 1) {
    if (!st.dir) registrarDivergencia('st_dir', 'status 1 sem "dir"');
    else if (st.dir !== direcao(dx, dy) && !direcaoAmbigua(dx, dy)) {
      registrarDivergencia('st_dir', `dir=${st.dir}, esperado ${direcao(dx, dy)}`);
    }
  }
  if (st.s === 5 && !st.d) registrarDivergencia('st_d', 'status 5 sem "d"');
}

function distanciaAtual() {
  const p = leituraValida();
  if (!p || !estado || estado.fim) return null;
  const t = tagAtual();
  return vetor(p.la, p.lo, t.la, t.lo).d;
}

function atualizarBotaoAchei() {
  if (!estado || estado.fim) return;
  const d = distanciaAtual();
  const perto = d != null && d <= CONFIG.RAIO_PALPITE_M;
  $('btn-achei').disabled = !perto || palpitando;
  $('info-achei').textContent = perto
    ? 'Você está perto do tag. Ache-o e digite a palavra-código.'
    : `Chegue a menos de ${CONFIG.RAIO_PALPITE_M} m do tag para liberar.`;
}

// ---------- palpite ----------
function abrirPalpite() {
  $('form-palpite').hidden = false;
  $('btn-achei').hidden = true;
  $('inp-codigo').value = '';
  $('inp-codigo').focus();
}
function fecharPalpite() {
  $('form-palpite').hidden = true;
  $('btn-achei').hidden = false;
}

async function enviarPalpite(ev) {
  ev.preventDefault();
  const digitado = normalizarCodigo($('inp-codigo').value);
  if (!digitado) return;
  const d = distanciaAtual();
  if (d == null || d > CONFIG.RAIO_PALPITE_M) {
    mensagem($('msg-busca'), 'Você se afastou do tag. Volte para perto.', 'erro');
    fecharPalpite();
    return;
  }
  palpitando = true;
  atualizarBotaoAchei();
  try {
    const t = tagAtual();
    const correto = digitado === normalizarCodigo(t.n); // o app decide

    const r = await requisitar(msg.chk(digitado), ['res'], 0);
    if (!r || r.t !== 'res') registrarDivergencia('res', 'sem resposta ao "chk"');
    else {
      if (r.ok !== (correto ? 1 : 0)) registrarDivergencia('res_ok', `ok=${r.ok}, esperado ${correto ? 1 : 0}`);
      if (r.i !== t.i) registrarDivergencia('res_i', `i=${r.i}, esperado ${t.i}`);
    }

    if (!correto) {
      estado.erros += 1;
      salvarEstado();
      mensagem($('msg-busca'), `Código errado: +${CONFIG.PENALIDADE_S / 60} min.`, 'erro');
      atualizarPlacar();
      return;
    }

    fecharPalpite();
    if (estado.tagAtual === 1) {
      estado.tagAtual = 2;
      salvarEstado();
      atualizarPlacar();
      mensagem($('msg-busca'), 'Tag 1 encontrado! Agora procurem o tag 2.', 'ok');
      mostrarStatus({ s: 0 });
      $('st-emoji').textContent = '🎉';
      $('st-nome').textContent = 'Tag 1 encontrado!';
    } else {
      await finalizar();
    }
  } finally {
    palpitando = false;
    atualizarBotaoAchei();
  }
}

// ---------- fim ----------
async function finalizar() {
  estado.fim = Date.now();
  estado.tagAtual = 3;
  const bruto = Math.round((estado.fim - estado.inicio) / 1000);
  estado.tempoBrutoS = bruto;
  estado.tempoFinalS = bruto + estado.erros * CONFIG.PENALIDADE_S;
  const base = montarBaseComprovante(estado.grupo, estado.inicio, estado.tempoFinalS, estado.erros);
  estado.comprovante = `${base}|${await codigoVerificacao(gabarito.segredo, base)}`;
  salvarEstado();
  clearInterval(lacoPos);
  clearInterval(cronometro);
  clearInterval(timerReconexao);
  setTimeout(() => {
    if (!estado.arduinoEnd) registrarDivergencia('end', 'Arduino não enviou "end"');
    enfileirarEnvio();
    mostrarResultado();
  }, CONFIG.TIMEOUT_RESPOSTA_MS);
  mostrarResultado();
}

function mostrarResultado() {
  mostrarTela('tela-fim');
  $('r-grupo').textContent = estado.grupo;
  $('r-bruto').textContent = formatarTempo(estado.tempoBrutoS);
  $('r-pen').textContent = `${estado.erros} × ${CONFIG.PENALIDADE_S / 60} min`;
  $('r-final').textContent = formatarTempo(estado.tempoFinalS);
  $('r-div').textContent = totalDivergencias();
  $('r-comprovante').textContent = estado.comprovante;
  const lista = $('r-div-lista');
  lista.innerHTML = '';
  for (const [tipo, x] of Object.entries(estado.divergencias || {})) {
    const li = document.createElement('li');
    li.textContent = `${tipo}: ${x.n}× (ex.: ${x.exemplo})`;
    lista.appendChild(li);
  }
  if (!lista.children.length) lista.innerHTML = '<li>Nenhuma.</li>';
  atualizarStatusEnvio();
}

// ---------- Google Forms ----------
function enfileirarEnvio() {
  if (estado.envioEnfileirado) return;
  estado.envioEnfileirado = true;
  salvarEstado();
  const resumo = Object.entries(estado.divergencias || {}).map(([k, x]) => `${k}:${x.n}`).join(' ');
  const fila = lerLS(CH_ENVIOS) || [];
  const C = CONFIG.FORMS_CAMPOS;
  fila.push({
    [C.grupo]: estado.grupo,
    [C.tempoFinal]: formatarTempo(estado.tempoFinalS),
    [C.tempoBruto]: formatarTempo(estado.tempoBrutoS),
    [C.erros]: String(estado.erros),
    [C.divergencias]: `${totalDivergencias()} ${resumo}`.trim(),
    [C.comprovante]: estado.comprovante,
  });
  gravarLS(CH_ENVIOS, fila);
  enviarPendentes();
}

let enviando = false;
async function enviarPendentes() {
  if (enviando || !CONFIG.FORMS_URL) { atualizarStatusEnvio(); return; }
  enviando = true;
  try {
    let fila = lerLS(CH_ENVIOS) || [];
    while (fila.length) {
      await fetch(CONFIG.FORMS_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(fila[0]) });
      fila = fila.slice(1);
      gravarLS(CH_ENVIOS, fila);
    }
  } catch (_) { /* sem internet: tenta depois */ }
  enviando = false;
  atualizarStatusEnvio();
}

function atualizarStatusEnvio() {
  const el = $('r-envio');
  if (!el || !estado?.fim) return;
  if (!CONFIG.FORMS_URL) { mensagem(el, 'Envio ao Google Forms desativado (configure em js/config.js).'); return; }
  const n = (lerLS(CH_ENVIOS) || []).length;
  if (!estado.envioEnfileirado) mensagem(el, 'Preparando envio…');
  else if (n) mensagem(el, 'Resultado guardado. Será enviado quando houver internet.', 'erro');
  else mensagem(el, 'Resultado enviado ao professor.', 'ok');
}

// ---------- tela ligada ----------
let wakeLock = null;
async function pedirTelaLigada() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (_) { /* não suportado */ }
}

// ---------- simulador ----------
function atualizarInfoSim() {
  if (!MODO_SIM || !estado || estado.fim || !gps) return;
  const t = tagAtual();
  const { d } = vetor(gps.la, gps.lo, t.la, t.lo);
  $('sim-info').textContent = `Distância real até o tag ${estado.tagAtual}: ${d.toFixed(1)} m`;
}

function configurarSimulador() {
  $('painel-sim').hidden = false;
  document.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
    if (!gps) return;
    gps.mover(b.dataset.mover, Number($('sim-passo').value));
  }));
  $('sim-perto').addEventListener('click', () => {
    if (!gps || !estado || estado.fim) return;
    const t = tagAtual();
    gps.irPara(t.la, t.lo, 4);
  });
  $('sim-desconectar').addEventListener('click', () => transporte?.desconectar());
  $('sim-reset').addEventListener('click', () => arduinoSim?.resetar());
}

// ---------- área do professor ----------
async function acaoProfessor(apagarTudo) {
  const el = $('msg-prof');
  try {
    await verificarSenha($('senha-prof').value);
  } catch (e) {
    mensagem(el, e.message, 'erro');
    return;
  }
  localStorage.removeItem(CH_ESTADO);
  if (apagarTudo) localStorage.removeItem(CH_GABARITO);
  location.reload();
}

// ---------- início ----------
async function iniciar() {
  if (!MODO_SIM && !TransporteBLE.disponivel()) $('aviso-navegador').hidden = false;
  if (MODO_SIM) {
    try {
      SIM = await import('./simulador.js');
    } catch (_) {
      document.body.innerHTML = '<p style="padding:20px">Simulador não disponível nesta versão.</p>';
      return;
    }
    configurarSimulador();
    badge('simulador', 'sim');
  }

  $('btn-liberar').addEventListener('click', async () => {
    const el = $('msg-prep');
    mensagem(el, 'Verificando…');
    try {
      gabarito = await verificarSenha($('senha-prep').value);
      gravarLS(CH_GABARITO, gabarito);
      $('senha-prep').value = '';
      irParaConectar();
    } catch (e) {
      mensagem(el, e.message, 'erro');
    }
  });
  $('btn-conectar').addEventListener('click', conectar);
  $('btn-reconectar').addEventListener('click', async () => {
    try {
      await transporte.reconectar();
      $('btn-reconectar').hidden = true;
      clearInterval(timerReconexao);
      await iniciarSessao();
    } catch (_) {
      await conectar(); // abre a lista de novo
    }
  });
  $('btn-achei').addEventListener('click', abrirPalpite);
  $('btn-cancelar-palpite').addEventListener('click', fecharPalpite);
  $('form-palpite').addEventListener('submit', enviarPalpite);
  $('btn-novo-jogo').addEventListener('click', () => acaoProfessor(false));
  $('btn-apagar').addEventListener('click', () => acaoProfessor(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sessaoAtiva) pedirTelaLigada();
  });
  window.addEventListener('online', enviarPendentes);

  if ('serviceWorker' in navigator && !MODO_SIM) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  enviarPendentes();

  if (estado?.fim) {
    if (!estado.envioEnfileirado) enfileirarEnvio();
    mostrarResultado();
    return;
  }
  if (!gabarito) { await prepararTelaPrep(); return; }
  irParaConectar();
}

function irParaConectar() {
  mostrarTela('tela-conectar');
  if (estado) {
    $('info-andamento').textContent =
      `Jogo do grupo ${estado.grupo} em andamento desde ${new Date(estado.inicio).toLocaleTimeString('pt-BR')}. O tempo continua correndo.`;
  }
}

iniciar();
