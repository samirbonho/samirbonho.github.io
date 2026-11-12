# Protocolo de comunicação App ↔ Arduino — Geotag

## Regras gerais

- Cada mensagem é um objeto JSON em **uma única linha**, terminada com `\n`.
- Cada mensagem tem **no máximo 63 caracteres** (contando o `\n`).
- Use apenas caracteres ASCII: sem acentos.
- Toda mensagem tem o campo `t`, que indica o **tipo** da mensagem.
- O app envia uma mensagem e **espera a resposta** do Arduino antes de enviar a próxima.
- Pelo Bluetooth, uma mensagem pode chegar dividida em pedaços de até 20 bytes. Ela só está completa quando chega o `\n`.

---

## Dicionário de campos

| Campo | Significado | Tipo | Exemplo |
|---|---|---|---|
| `t` | **Tipo** da mensagem | texto | `"pos"` |
| `i` | **Índice do tag**: 1 = primeiro tag, 2 = segundo tag | inteiro | `1` |
| `la` | **Latitude** em micrograus (graus × 1.000.000) | inteiro (long) | `-22912345` |
| `lo` | **Longitude** em micrograus (graus × 1.000.000) | inteiro (long) | `-43230123` |
| `n` | **Palavra-código** escrita no tag (máx. 8 letras ou números). Na comparação, maiúsculas e minúsculas são iguais | texto | `"TATU42"` |
| `d` | **Dica** bem-humorada sobre o esconderijo (máx. 32 caracteres) | texto | `"Me sinto um aipim dormindo"` |
| `g` | **Código do grupo** | texto | `"G07"` |
| `e` | **Estado** do jogo no Arduino (ver tabela abaixo) | inteiro | `0` |
| `s` | **Status** de proximidade (ver tabela abaixo) | inteiro | `3` |
| `dir` | **Direção** para onde ir: `N`, `S`, `L` ou `O` | texto | `"N"` |
| `ok` | **Resultado** do palpite: 1 = acertou, 0 = errou | inteiro | `1` |
| `c` | **Código de erro** (ver tabela abaixo) | inteiro | `2` |

### Valores do campo `e` (estado)

| Valor | Significado |
|---|---|
| 0 | Sem gabarito (acabou de ligar ou resetou) |
| 1 | Buscando o tag 1 |
| 2 | Buscando o tag 2 |
| 3 | Fim de jogo |

### Valores do campo `s` (status)

| Valor | Significado | Distância até o tag |
|---|---|---|
| 1 | Congelando | mais de 80 m |
| 2 | Frio | de 40 m até 80 m |
| 3 | Morno | de 20 m até menos de 40 m |
| 4 | Quente | de 10 m até menos de 20 m |
| 5 | Pegando fogo | menos de 10 m |

Cálculo da distância (coordenadas em micrograus, resultado em metros):

```cpp
float cosLat = cos(latTag / 1e6 * PI / 180.0);
float dy = (latTag - latCel) * 0.1113;           // + = tag ao norte
float dx = (lonTag - lonCel) * 0.1113 * cosLat;  // + = tag a leste
float d  = sqrt(dx * dx + dy * dy);
```

Direção (só no status 1): se `|dy| > |dx|`, use `N` (dy > 0) ou `S`; senão, `L` (dx > 0) ou `O`.

### Valores do campo `c` (erro)

| Valor | Significado |
|---|---|
| 1 | Arduino ainda não tem gabarito |
| 2 | Mensagem inválida (JSON com erro ou tipo desconhecido) |

---

## Mensagens enviadas pelo **app** ao Arduino

### `oi` — Início da conversa
O app envia logo depois de conectar. O Arduino responde com `id`.

```json
{"t":"oi"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"oi"` |

---

### `tag` — Gabarito de um tag
Envia a posição e a palavra-código de um tag. O Arduino responde com `ok`.

```json
{"t":"tag","i":1,"la":-22912345,"lo":-43230123,"n":"TATU42"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"tag"` |
| `i` | Índice do tag (1 ou 2) |
| `la` | Latitude do tag, em micrograus |
| `lo` | Longitude do tag, em micrograus |
| `n` | Palavra-código escrita no tag |

---

### `dsc` — Descrição (dica) de um tag
Envia a dica bem-humorada do tag. O Arduino guarda o texto e responde com `ok`.

```json
{"t":"dsc","i":1,"d":"Me sinto um aipim dormindo"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"dsc"` |
| `i` | Índice do tag (1 ou 2) |
| `d` | Texto da dica |

---

### `pos` — Posição atual do celular
Enviada a cada 3 segundos durante a busca. O Arduino responde com `st`.

```json
{"t":"pos","la":-22912400,"lo":-43230200}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"pos"` |
| `la` | Latitude do celular, em micrograus |
| `lo` | Longitude do celular, em micrograus |

---

### `chk` — Palpite (checagem)
Envia a palavra-código digitada pelo aluno. O Arduino responde com `res`, comparando sem diferenciar maiúsculas e minúsculas ("tatu42" = "TATU42"). Se acertar, passa para o próximo tag.

```json
{"t":"chk","n":"TATU42"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"chk"` |
| `n` | Palavra-código digitada |

---

## Mensagens enviadas pelo **Arduino** ao app

### `id` — Identificação
Resposta ao `oi`. Informa o grupo e o estado atual do jogo.

```json
{"t":"id","g":"G07","e":0}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"id"` |
| `g` | Código do grupo |
| `e` | Estado do jogo (0, 1, 2 ou 3) |

---

### `ok` — Confirmação
Resposta a `tag` e a `dsc`. Confirma que o Arduino guardou os dados.

```json
{"t":"ok","i":1}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"ok"` |
| `i` | Índice do tag recebido (1 ou 2) |

---

### `st` — Status de proximidade
Resposta a `pos`. Informa o quão perto o celular está do tag atual.

Com status 1 (congelando), inclui a direção:
```json
{"t":"st","i":1,"s":1,"dir":"N"}
```

Com status 2, 3 ou 4, só o status:
```json
{"t":"st","i":1,"s":3}
```

Com status 5 (pegando fogo), inclui a dica:
```json
{"t":"st","i":1,"s":5,"d":"Me sinto um aipim dormindo"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"st"` |
| `i` | Índice do tag que está sendo buscado (1 ou 2) |
| `s` | Status de proximidade (1 a 5) |
| `dir` | Só quando `s` = 1: direção para onde ir (`N`, `S`, `L`, `O`) |
| `d` | Só quando `s` = 5: dica do esconderijo |

---

### `res` — Resultado do palpite
Resposta a `chk`.

```json
{"t":"res","i":1,"ok":1}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"res"` |
| `i` | Índice do tag do palpite (1 ou 2) |
| `ok` | 1 = acertou, 0 = errou |

---

### `end` — Fim de jogo
Enviada logo depois do `res` com acerto do tag 2.

```json
{"t":"end"}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"end"` |

---

### `err` — Erro
Resposta a qualquer mensagem que o Arduino não consiga tratar.

```json
{"t":"err","c":2}
```

| Campo | Descrição |
|---|---|
| `t` | Sempre `"err"` |
| `c` | Código do erro (1 ou 2) |
