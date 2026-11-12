// Arduino falso e GPS falso, para testar o app sem hardware.
// O ArduinoSimulado é também uma implementação de referência do protocolo.

import { ler, resp, normalizarCodigo } from './protocolo.js';
import { vetor, statusPorDistancia, direcao } from './geo.js';

// ---------- Arduino simulado ----------
export class ArduinoSimulado {
  // defeito = true simula um código de aluno com erros (direção invertida, sem "end"),
  // para ver as divergências aparecerem no resultado.
  constructor(grupo, defeito = false) {
    this.grupo = grupo;
    this.defeito = defeito;
    this.resetar();
  }

  resetar() {
    this.tags = {};   // i -> {la, lo, n, d}
    this.estado = 0;  // 0 sem gabarito, 1 tag 1, 2 tag 2, 3 fim
  }

  _completo() {
    return [1, 2].every((i) => this.tags[i] && this.tags[i].n && this.tags[i].d);
  }

  // Recebe uma linha e devolve a lista de linhas de resposta.
  processar(linha) {
    const m = ler(linha);
    if (!m) return [resp.err(2)];
    switch (m.t) {
      case 'oi':
        return [resp.id(this.grupo, this.estado)];
      case 'tag':
        this.tags[m.i] = { ...(this.tags[m.i] || {}), la: m.la, lo: m.lo, n: m.n };
        if (this.estado === 0 && this._completo()) this.estado = 1;
        return [resp.ok(m.i)];
      case 'dsc':
        this.tags[m.i] = { ...(this.tags[m.i] || {}), d: m.d };
        if (this.estado === 0 && this._completo()) this.estado = 1;
        return [resp.ok(m.i)];
      case 'pos': {
        if (this.estado < 1 || this.estado > 2) return [resp.err(1)];
        const i = this.estado;
        const tag = this.tags[i];
        const { dx, dy, d } = vetor(m.la, m.lo, tag.la, tag.lo);
        const s = statusPorDistancia(d);
        if (s === 1) {
          const inv = { N: 'S', S: 'N', L: 'O', O: 'L' };
          const dir = direcao(dx, dy);
          return [resp.st(i, s, { dir: this.defeito ? inv[dir] : dir })];
        }
        if (s === 5) return [resp.st(i, s, { d: tag.d })];
        return [resp.st(i, s)];
      }
      case 'chk': {
        if (this.estado < 1 || this.estado > 2) return [resp.err(1)];
        const i = this.estado;
        const ok = normalizarCodigo(m.n) === normalizarCodigo(this.tags[i].n) ? 1 : 0;
        if (!ok) return [resp.res(i, 0)];
        this.estado += 1;
        return this.estado === 3 && !this.defeito ? [resp.res(i, 1), resp.end()] : [resp.res(i, 1)];
      }
      default:
        return [resp.err(2)];
    }
  }
}

// Transporte que conversa com o ArduinoSimulado, com o mesmo formato do TransporteBLE.
export class TransporteSimulado {
  constructor(arduino, atrasoMs = 120) {
    this.arduino = arduino;
    this.atrasoMs = atrasoMs;
    this.aoReceberLinha = () => {};
    this.aoDesconectar = () => {};
    this._conectado = false;
  }
  get conectado() { return this._conectado; }
  get nome() { return `Arduino simulado (${this.arduino.grupo})`; }
  async conectar() { this._conectado = true; }
  async reconectar() { this._conectado = true; }
  desconectar() {
    if (!this._conectado) return;
    this._conectado = false;
    this.aoDesconectar();
  }
  async enviar(linha) {
    if (!this._conectado) throw new Error('Desconectado.');
    const respostas = this.arduino.processar(linha);
    respostas.forEach((r, k) => setTimeout(() => {
      if (this._conectado) this.aoReceberLinha(r.trim());
    }, this.atrasoMs * (k + 1)));
  }
}

// ---------- GPS simulado ----------
export class GpsSimulado {
  constructor(la, lo) {
    this.la = la;
    this.lo = lo;
    this.acc = 5;
  }
  iniciar(aoLer) {
    this.aoLer = aoLer;
    this._emitir();
    this.timer = setInterval(() => this._emitir(), 1000);
  }
  parar() { clearInterval(this.timer); }
  _emitir() {
    this.aoLer?.({ la: this.la, lo: this.lo, acc: this.acc, ts: Date.now() });
  }
  // Move "metros" na direção N, S, L ou O.
  mover(dir, metros) {
    const microPorM = 1 / 0.1113;
    const cosLat = Math.cos((this.la / 1e6) * Math.PI / 180);
    if (dir === 'N') this.la += Math.round(metros * microPorM);
    if (dir === 'S') this.la -= Math.round(metros * microPorM);
    if (dir === 'L') this.lo += Math.round((metros * microPorM) / cosLat);
    if (dir === 'O') this.lo -= Math.round((metros * microPorM) / cosLat);
    this._emitir();
  }
  irPara(la, lo, metrosAoSul = 0) {
    this.la = la;
    this.lo = lo;
    if (metrosAoSul) this.mover('S', metrosAoSul);
    this._emitir();
  }
}
