// Transporte Web Bluetooth para módulo serial BLE (FFE0 / FFE1).
// Fatia o envio em pedaços de 20 bytes e remonta o que chega até o "\n".

import { CONFIG } from './config.js';

export class TransporteBLE {
  constructor() {
    this.dispositivo = null;
    this.carac = null;
    this.buffer = '';
    this.aoReceberLinha = () => {};
    this.aoDesconectar = () => {};
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();
    this.filaEscrita = Promise.resolve();
  }

  static disponivel() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  get conectado() {
    return !!(this.dispositivo && this.dispositivo.gatt.connected && this.carac);
  }

  get nome() {
    return this.dispositivo?.name || 'módulo BLE';
  }

  // Abre a lista de dispositivos (exige toque do usuário).
  async conectar() {
    this.dispositivo = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [CONFIG.BLE_SERVICO],
    });
    this.dispositivo.addEventListener('gattserverdisconnected', () => {
      this.carac = null;
      this.aoDesconectar();
    });
    await this._abrir();
  }

  // Reconecta ao mesmo dispositivo, sem abrir a lista.
  async reconectar() {
    if (!this.dispositivo) throw new Error('Nenhum dispositivo escolhido.');
    await this._abrir();
  }

  async _abrir() {
    const servidor = await this.dispositivo.gatt.connect();
    const servico = await servidor.getPrimaryService(CONFIG.BLE_SERVICO);
    this.carac = await servico.getCharacteristic(CONFIG.BLE_CARACTERISTICA);
    this.buffer = '';
    this.carac.addEventListener('characteristicvaluechanged', (ev) => this._receber(ev.target.value));
    await this.carac.startNotifications();
  }

  _receber(dataView) {
    this.buffer += this.decoder.decode(dataView, { stream: true });
    let pos;
    while ((pos = this.buffer.indexOf('\n')) >= 0) {
      const linha = this.buffer.slice(0, pos).replace(/\r$/, '');
      this.buffer = this.buffer.slice(pos + 1);
      if (linha.trim()) this.aoReceberLinha(linha);
    }
    if (this.buffer.length > 512) this.buffer = ''; // lixo sem \n: descarta
  }

  // Envia uma linha (já com \n), em pedaços de 20 bytes, um após o outro.
  enviar(linha) {
    const bytes = this.encoder.encode(linha);
    this.filaEscrita = this.filaEscrita.then(async () => {
      if (!this.conectado) throw new Error('Desconectado.');
      const comResposta = this.carac.properties.write;
      for (let i = 0; i < bytes.length; i += CONFIG.BLE_TAM_PEDACO) {
        const pedaco = bytes.slice(i, i + CONFIG.BLE_TAM_PEDACO);
        if (comResposta) await this.carac.writeValueWithResponse(pedaco);
        else await this.carac.writeValueWithoutResponse(pedaco);
      }
    });
    return this.filaEscrita;
  }

  desconectar() {
    if (this.dispositivo?.gatt.connected) this.dispositivo.gatt.disconnect();
  }
}
