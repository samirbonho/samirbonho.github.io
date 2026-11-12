// Distância, status, direção e leitura de GPS.
// O cálculo é o mesmo que os alunos fazem no Arduino (aproximação plana).

import { CONFIG } from './config.js';

const M_POR_MICROGRAU = 0.1113;

// Recebe coordenadas em micrograus. Retorna metros: dx (+ leste), dy (+ norte) do celular até o tag.
export function vetor(laCel, loCel, laTag, loTag) {
  const cosLat = Math.cos((laTag / 1e6) * Math.PI / 180);
  const dy = (laTag - laCel) * M_POR_MICROGRAU;
  const dx = (loTag - loCel) * M_POR_MICROGRAU * cosLat;
  return { dx, dy, d: Math.sqrt(dx * dx + dy * dy) };
}

export function statusPorDistancia(d) {
  const L = CONFIG.LIMITES;
  if (d < L.FOGO) return 5;
  if (d < L.QUENTE) return 4;
  if (d < L.MORNO) return 3;
  if (d <= L.FRIO) return 2;
  return 1;
}

export function direcao(dx, dy) {
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? 'N' : 'S';
  return dx > 0 ? 'L' : 'O';
}

// Está perto de uma fronteira de faixa? (para não acusar divergência por arredondamento)
export function pertoDaFronteira(d) {
  const tol = CONFIG.TOLERANCIA_DIVERGENCIA_M;
  return Object.values(CONFIG.LIMITES).some((lim) => Math.abs(d - lim) <= tol);
}

// Direção ambígua quando |dx| e |dy| são quase iguais.
export function direcaoAmbigua(dx, dy) {
  return Math.abs(Math.abs(dx) - Math.abs(dy)) <= CONFIG.TOLERANCIA_DIVERGENCIA_M;
}

// GPS real. Chama aoLer({la, lo, acc, ts}) com coordenadas em micrograus.
export class GpsReal {
  iniciar(aoLer, aoErro) {
    if (!('geolocation' in navigator)) {
      aoErro?.('Este navegador não tem GPS.');
      return;
    }
    this.id = navigator.geolocation.watchPosition(
      (p) => aoLer({
        la: Math.round(p.coords.latitude * 1e6),
        lo: Math.round(p.coords.longitude * 1e6),
        acc: p.coords.accuracy,
        ts: Date.now(),
      }),
      (e) => aoErro?.(e.code === 1 ? 'Permissão de localização negada.' : 'Sem sinal de GPS.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  parar() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    this.id = null;
  }
}
