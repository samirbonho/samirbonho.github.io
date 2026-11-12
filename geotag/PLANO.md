# Plano de ataque — Web app Geotag

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Web app em JavaScript puro, sem framework e sem build, rodando no Chrome do Android |
| Hospedagem | GitHub Pages (HTTPS gratuito) |
| Bluetooth | Web Bluetooth, serviço `FFE0`, característica `FFE1` (Write + Notify) |
| Juiz | O app. O Arduino dá as dicas, mas quem decide acerto, penalidade e tempo é o app |
| Gabarito | Arquivo `gabarito.enc`, criptografado (AES-GCM) com a senha do professor |
| Palpite | Liberado só a 15 m ou menos do tag; palavra-código sem diferenciar maiúsculas e minúsculas |
| Penalidade | +1 min por palpite errado |
| Cronômetro | Começa na primeira resposta `id` do Arduino; guarda o horário de início, sobrevive a fechar o app e não reinicia na reconexão |
| GPS | Só envia posições com precisão de 15 m ou melhor, a cada 3 s; tela sempre ligada |
| Resultado | Na tela, com código de verificação, e enviado ao Google Forms (fica na fila se estiver sem internet) |
| Offline | Service worker guarda o app no celular depois do primeiro acesso |
| Celulares | Dos alunos, com o do professor como reserva |

## Arquivos do repositório

```
index.html           Jogo (tela dos alunos)
professor.html       Captura de posições, geração do gabarito, verificação de resultados
gabarito.enc         Gabarito criptografado (substituído na véspera do jogo)
sw.js                Service worker (modo offline)
manifest.json        Permite "Adicionar à tela inicial"
css/estilo.css
js/config.js         Faixas de distância, intervalos, Google Forms
js/protocolo.js      Montagem e validação das mensagens JSON
js/geo.js            Distância, status, direção e leitura do GPS
js/cripto.js         Criptografia do gabarito e código de verificação
js/ble.js            Conexão Web Bluetooth, fatiamento em 20 bytes, remontagem por \n
js/simulador.js      Arduino falso e GPS falso para testar sem hardware
js/jogo.js           Controle do jogo (juiz, cronômetro, fila de mensagens, Forms)
js/professor.js      Lógica da página do professor
protocolo_geotag.md  Especificação do protocolo para os alunos
```

## Etapas

| # | Etapa | Como testar |
|---|---|---|
| 1 | Módulos base: protocolo, distância/status, criptografia | Testes automáticos no Node |
| 2 | Simulador de Arduino + GPS simulado | Jogo completo no navegador do PC com `?sim=G01` |
| 3 | Camada Bluetooth (conectar, fatiar, remontar, reconectar) | Celular + módulo BLE ligado a um Arduino com eco serial |
| 4 | Juiz e cronômetro (distância própria, penalidade, divergências, persistência) | Modo simulador: errar, acertar, recarregar a página no meio |
| 5 | Telas (preparação, conectar, busca, palpite, resultado) | Modo simulador no celular |
| 6 | Página do professor (captura com média de GPS, gerar gabarito, verificar código) | Capturar 2 pontos no pátio e gerar um gabarito de teste |
| 7 | Publicação no GitHub Pages + Google Forms | Abrir o link no celular, enviar um resultado de teste |
| 8 | Teste em campo com Arduino real | Ajustar as faixas de distância em `js/config.js` |

## Roteiro do dia do jogo

**Véspera**
1. Esconder os 10 tags. Em cada esconderijo, abrir `professor.html`, capturar a posição e preencher grupo, índice, palavra-código e dica.
2. Gerar o `gabarito.enc` com a senha e enviá-lo ao repositório no GitHub (substituindo o anterior).
3. Abrir `index.html?sim=G01` e jogar uma partida simulada para conferir o gabarito.

**No dia**
1. Alunos abrem o link no Chrome, no Wi-Fi da escola. Conferir a data do gabarito mostrada na tela.
2. O professor digita a senha em cada celular.
3. Os alunos conectam ao Arduino e o cronômetro começa.
4. No fim, o resultado aparece na tela e vai para o Google Forms.
5. Conferir os códigos de verificação na página do professor.
