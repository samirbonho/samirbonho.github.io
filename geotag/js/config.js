// Configurações do jogo. Ajuste aqui depois do teste em campo.

export const CONFIG = {
  // Faixas de status (metros). Distância d até o tag:
  //   d < 10  -> 5 pegando fogo
  //   d < 20  -> 4 quente
  //   d < 40  -> 3 morno
  //   d <= 80 -> 2 frio
  //   d > 80  -> 1 congelando
  LIMITES: { FOGO: 10, QUENTE: 20, MORNO: 40, FRIO: 80 },

  RAIO_PALPITE_M: 15,        // palpite só é liberado a esta distância ou menos
  PRECISAO_MAX_M: 15,        // descarta leituras de GPS piores que isso
  INTERVALO_POS_MS: 3000,    // envio de "pos" ao Arduino
  GPS_VALIDADE_MS: 10000,    // leitura de GPS mais velha que isso não é enviada
  PENALIDADE_S: 60,          // por palpite errado
  TIMEOUT_RESPOSTA_MS: 3000, // espera pela resposta do Arduino
  TENTATIVAS: 2,             // reenvios em caso de timeout (exceto "chk")
  TOLERANCIA_DIVERGENCIA_M: 1.5, // perto da fronteira de uma faixa, não acusa divergência

  ARQUIVO_GABARITO: 'gabarito.enc',

  // Google Forms. Veja o README para descobrir a URL e os "entry.XXXX".
  // Deixe FORMS_URL vazio para desativar o envio.
  FORMS_URL: '',
  FORMS_CAMPOS: {
    grupo: 'entry.0000000001',
    tempoFinal: 'entry.0000000002',
    tempoBruto: 'entry.0000000003',
    erros: 'entry.0000000004',
    divergencias: 'entry.0000000005',
    comprovante: 'entry.0000000006',
  },

  // Bluetooth (módulo serial BLE padrão HM-10)
  BLE_SERVICO: 0xffe0,
  BLE_CARACTERISTICA: 0xffe1,
  BLE_TAM_PEDACO: 20,
};

export const STATUS = {
  1: { nome: 'Congelando', emoji: '🥶', cor: '#1e5bb8' },
  2: { nome: 'Frio', emoji: '❄️', cor: '#3b9bd9' },
  3: { nome: 'Morno', emoji: '🙂', cor: '#d9a520' },
  4: { nome: 'Quente', emoji: '🥵', cor: '#e2711d' },
  5: { nome: 'Pegando fogo', emoji: '🔥', cor: '#d62828' },
};

export const DIRECOES = { N: 'Norte', S: 'Sul', L: 'Leste', O: 'Oeste' };
