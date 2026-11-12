# Geotag

Jogo de "quente ou frio" com GPS para o curso técnico de Eletrônica. O celular envia a posição ao Arduino por Bluetooth (BLE), e o Arduino responde com dicas. Os alunos programam o Arduino; este web app é o juiz.

- **Jogo (alunos):** `index.html`
- **Professor:** `professor.html`
- **Protocolo para os alunos:** [`protocolo_geotag.md`](protocolo_geotag.md)
- **Plano de desenvolvimento:** [`PLANO.md`](PLANO.md)

## 1. Publicar no GitHub Pages

1. No GitHub, crie um repositório (ex.: `geotag`) e envie todos os arquivos desta pasta (botão **Add file → Upload files**, arrastando a pasta inteira).
2. Vá em **Settings → Pages**. Em *Source*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
3. Em 1 ou 2 minutos o site estará em `https://SEU-USUARIO.github.io/geotag/`.
   - Jogo: `https://SEU-USUARIO.github.io/geotag/`
   - Professor: `https://SEU-USUARIO.github.io/geotag/professor.html`

## 2. Testar sem Arduino (simulador)

Abra `index.html?sim=G01` (troque `G01` pelo grupo). O Arduino e o GPS são simulados, e um painel permite mover o "celular" e testar desconexão e reset do Arduino.

- O `gabarito.enc` que vem no repositório é de **demonstração**, com a senha `demo1234` e os grupos G01 a G05.
- `index.html?sim=G01&defeito=1` simula um código de aluno com erros, para você ver as divergências no resultado.
- Para recomeçar, abra **Área do professor → Novo jogo**.
- O `js/simulador.js` contém a lógica do Arduino em JavaScript. Se não quiser que os alunos o vejam, apague-o do repositório publicado e guarde uma cópia no seu computador. O jogo continua funcionando; só o modo `?sim=` deixa de existir no site. Para usar o simulador no seu computador, abra a pasta com um servidor local (ex.: `python3 -m http.server`) e acesse `http://localhost:8000/index.html?sim=G01`.

## 3. Configurar o Google Forms

1. Crie um formulário com 6 perguntas de **resposta curta**, nesta ordem: Grupo, Tempo final, Tempo cronometrado, Erros, Divergências, Comprovante.
2. No menu **⋮ → Gerar link pré-preenchido**, preencha cada campo com algo (ex.: `a`, `b`, `c`…), clique em **Gerar link** e copie o link.
3. No link, cada campo aparece como `entry.123456789=a`. Anote os números.
4. Edite `js/config.js`:
   - `FORMS_URL`: o endereço do formulário trocando `/viewform…` por `/formResponse`.
     Exemplo: `https://docs.google.com/forms/d/e/1FAIpQL.../formResponse`
   - `FORMS_CAMPOS`: troque cada `entry.000000000X` pelo número correspondente.
5. Faça um jogo simulado até o fim e confira se a resposta chegou ao formulário.

Sem internet no fim do jogo, o resultado fica guardado no celular e é enviado quando a conexão voltar (basta abrir o app de novo).

## 4. Véspera do jogo: gabarito

1. Esconda os tags. Em cada esconderijo, abra `professor.html`, preencha grupo, tag (1 ou 2), palavra-código e dica, toque em **Capturar posição** (15 s parado) e depois em **Salvar tag**.
   - Palavra-código: até 8 letras/números, sem espaço. Escreva-a no próprio tag.
   - Dica: até 32 caracteres; os acentos são removidos automaticamente.
   - As capturas ficam salvas no celular. Use **Baixar backup** por segurança.
2. Com todos os grupos completos, digite a senha em **Gerar gabarito** e baixe o `gabarito.enc`.
3. No GitHub, envie o novo `gabarito.enc` (**Add file → Upload files**), substituindo o antigo.
4. Em **Conferir o gabarito publicado**, digite a senha para confirmar que o site já está com o arquivo novo.
5. Faça uma partida em `index.html?sim=G01` para testar.

**Importante:** o código de verificação depende do gabarito. Guarde o mesmo `gabarito.enc` publicado até conferir todos os comprovantes.

## 5. Dia do jogo

1. Os alunos abrem o link **no Chrome**, no Wi-Fi da escola (depois disso o app funciona sem internet).
2. Confira a data do gabarito na tela e digite a senha em cada celular.
3. Os alunos tocam em **Conectar** e escolhem o módulo BLE do grupo. O cronômetro começa na primeira resposta do Arduino.
4. No fim, o resultado aparece na tela com um comprovante e vai para o Google Forms.
5. Para conferir um comprovante, use **Verificar um comprovante** em `professor.html`.

## Ajustes

Tudo em `js/config.js`: faixas de distância, raio do palpite (15 m), precisão mínima do GPS (15 m), intervalo de envio (3 s) e penalidade (60 s).

Se mudar as faixas de distância, avise os alunos: o Arduino usa as mesmas faixas.

## Observações

- Funciona no Chrome do Android. Não funciona no iPhone (o Safari não tem Web Bluetooth).
- Depois que o professor digita a senha, o gabarito fica guardado no celular. Só dá para lê-lo ligando o celular a um computador com depuração USB.
