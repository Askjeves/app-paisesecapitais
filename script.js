// ================================================================
// BANCO DE PERGUNTAS (com dicas corretas)
// ================================================================
function gerarPerguntas() {
    const perguntas = [];
    PAISES.forEach(p => {
        // Adivinhar o país -> dica: capital + continente
        perguntas.push({
            id: `pais:${p.pais}`,
            tipo: 'pais',
            paisObj: p,
            palavraAlvo: p.pais,
            dica: `🏛️ Capital: ${p.capital} (${p.continente})`
        });
        // Adivinhar a capital -> dica: país + continente
        perguntas.push({
            id: `capital:${p.pais}`,
            tipo: 'capital',
            paisObj: p,
            palavraAlvo: p.capital,
            dica: `🌍 País: ${p.pais} (${p.continente})`
        });
    });
    return perguntas;
}

// ================================================================
// GERENCIAMENTO DE JOGADORES (Firestore)
// ================================================================
const COLLECTION_NAME = 'jogadores';

async function carregarJogadores() {
    try {
        const snapshot = await db.collection(COLLECTION_NAME).get();
        const jogadores = [];
        snapshot.forEach(doc => {
            jogadores.push(doc.data());
        });
        console.log('📥 Jogadores carregados do Firestore:', jogadores);
        return jogadores;
    } catch (error) {
        console.error('❌ Erro ao carregar jogadores:', error);
        return [];
    }
}

async function salvarJogadores(jogadores) {
    try {
        for (let j of jogadores) {
            await db.collection(COLLECTION_NAME).doc(j.nome).set(j);
        }
        console.log('📤 Jogadores salvos no Firestore:', jogadores);
    } catch (error) {
        console.error('❌ Erro ao salvar jogadores:', error);
    }
}

async function adicionarJogador(nome) {
    try {
        const jogadores = await carregarJogadores();
        if (jogadores.find(j => j.nome.toLowerCase() === nome.toLowerCase())) {
            return false;
        }
        const novo = {
            nome,
            vitorias: 0,
            partidas: 0,
            dicasUsadas: 0,
            perguntasConcluidas: []
        };
        await db.collection(COLLECTION_NAME).doc(nome).set(novo);
        return true;
    } catch (error) {
        console.error('❌ Erro ao adicionar jogador:', error);
        return false;
    }
}

async function atualizarEstatisticas(nome, vitorias, partidas, dicasUsadas, perguntasConcluidas) {
    try {
        await db.collection(COLLECTION_NAME).doc(nome).set({
            nome,
            vitorias,
            partidas,
            dicasUsadas,
            perguntasConcluidas
        });
        console.log(`📊 Estatísticas de "${nome}" atualizadas.`);
        await renderizarListaJogadores();
    } catch (error) {
        console.error('❌ Erro ao atualizar estatísticas:', error);
    }
}

// ================================================================
// ELEMENTOS DOM
// ================================================================
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const completeScreen = document.getElementById('completeScreen');
const playerListDiv = document.getElementById('playerList');
const newPlayerInput = document.getElementById('newPlayerInput');
const createPlayerBtn = document.getElementById('createPlayerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const logoutCompleteBtn = document.getElementById('logoutCompleteBtn');
const resetProgressBtn = document.getElementById('resetProgressBtn');
const playerNameDisplay = document.getElementById('playerNameDisplay');
const progressDisplay = document.getElementById('progressDisplay');
const gameProgressFill = document.getElementById('gameProgressFill');
const messageDiv = document.getElementById('message');

const wordDisplay = document.getElementById('wordDisplay');
const hintDisplay = document.getElementById('hintDisplay');
const keyboardDiv = document.getElementById('keyboard');
const hintBtn = document.getElementById('hintBtn');
const resetBtn = document.getElementById('resetBtn');
const gameTitle = document.getElementById('gameTitle');

// ================================================================
// FUNÇÃO DE MENSAGEM
// ================================================================
function definirMensagem(texto, tipo = 'info') {
    if (!messageDiv) {
        console.warn('Elemento #message não encontrado.');
        return;
    }
    messageDiv.textContent = texto;
    messageDiv.className = 'message';
    if (tipo === 'success') messageDiv.classList.add('success');
    else if (tipo === 'error') messageDiv.classList.add('error');
    else if (tipo === 'win') messageDiv.classList.add('win');
}

// ================================================================
// ESTADO DO JOGO (SEM LIMITE DE DICAS)
// ================================================================
let state = {
    perguntaAtual: null,
    palavraAlvo: '',
    dica: '',
    letrasReveladas: new Set(),
    letrasErradas: new Set(),
    jogoTerminou: false,
    palavraCompleta: false,
    usouDica: false,
    cometeuErro: false,
    tempoRestante: 60,
    timerInterval: null,
    tempoExpirado: false
};

let jogadorAtual = null;
let todasPerguntas = gerarPerguntas();

// ================================================================
// FUNÇÕES AUXILIARES
// ================================================================
function removerAcentos(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function letraEstaNoNome(letra, nome) {
    const nomeSemAcento = removerAcentos(nome.toLowerCase());
    return nomeSemAcento.includes(letra);
}

function letrasUnicasDoNome(nome) {
    const semAcento = removerAcentos(nome.toLowerCase());
    const letras = new Set();
    for (let ch of semAcento) {
        if (ch !== ' ') letras.add(ch);
    }
    return letras;
}

function perguntasPendentes() {
    if (!jogadorAtual) return [];
    const concluidas = new Set(jogadorAtual.perguntasConcluidas);
    return todasPerguntas.filter(p => !concluidas.has(p.id));
}

function progressoAtual() {
    const total = todasPerguntas.length;
    const concluidas = jogadorAtual ? jogadorAtual.perguntasConcluidas.length : 0;
    return { total, concluidas };
}

// ================================================================
// TEMPORIZADOR (invisível)
// ================================================================
function iniciarTemporizador() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    state.tempoRestante = 60;
    state.tempoExpirado = false;

    state.timerInterval = setInterval(() => {
        state.tempoRestante--;
        if (state.tempoRestante <= 0) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            state.tempoExpirado = true;
        }
    }, 1000);
}

function pararTemporizador() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// ================================================================
// RENDERIZAÇÃO DO JOGO
// ================================================================
function renderizarPalavra() {
    const nome = state.palavraAlvo;
    let html = '';
    for (let i = 0; i < nome.length; i++) {
        const letra = nome[i];
        if (letra === ' ') {
            html += `<span class="letter-box space"></span>`;
        } else {
            const normalizada = removerAcentos(letra.toLowerCase());
            const revelada = state.letrasReveladas.has(normalizada);
            const classe = revelada ? 'letter-box revealed' : 'letter-box';
            html += `<span class="${classe}">${revelada ? letra : ''}</span>`;
        }
    }
    wordDisplay.innerHTML = html;
}

function renderizarDica() {
    hintDisplay.textContent = state.dica || '—';
}

function renderizarTeclado() {
    const letras = 'abcdefghijklmnopqrstuvwxyzç'.split('');
    let html = '';
    for (let letra of letras) {
        let classe = 'key';
        const normalizada = removerAcentos(letra);
        if (state.letrasReveladas.has(normalizada)) {
            classe += ' used-correct';
        } else if (state.letrasErradas.has(normalizada)) {
            classe += ' used-wrong';
        }
        const disabled = state.jogoTerminou || state.palavraCompleta;
        html += `<button class="${classe}" data-letra="${letra}" ${disabled ? 'disabled' : ''}>${letra}</button>`;
    }
    keyboardDiv.innerHTML = html;
}

function atualizarProgressoTela() {
    const prog = progressoAtual();
    const percent = prog.total > 0 ? (prog.concluidas / prog.total) * 100 : 0;
    progressDisplay.textContent = `${prog.concluidas}/${prog.total}`;
    if (gameProgressFill) {
        gameProgressFill.style.width = percent + '%';
    }
}

function atualizarTudo() {
    renderizarPalavra();
    renderizarDica();
    renderizarTeclado();
    hintBtn.disabled = (state.jogoTerminou || state.palavraCompleta);
    resetBtn.disabled = !state.palavraCompleta;
    atualizarProgressoTela();
    if (jogadorAtual) {
        playerNameDisplay.textContent = `👤 ${jogadorAtual.nome}`;
    }
}

// ================================================================
// LÓGICA DO JOGO
// ================================================================
function iniciarPergunta() {
    gameTitle.style.display = 'none';

    const pendentes = perguntasPendentes();
    if (pendentes.length === 0) {
        gameScreen.style.display = 'none';
        completeScreen.style.display = 'flex';
        return;
    }

    const pergunta = pendentes[Math.floor(Math.random() * pendentes.length)];
    state.perguntaAtual = pergunta;
    state.palavraAlvo = pergunta.palavraAlvo;
    state.dica = pergunta.dica;
    state.letrasReveladas = new Set();
    state.letrasErradas = new Set();
    state.jogoTerminou = false;
    state.palavraCompleta = false;
    state.usouDica = false;
    state.cometeuErro = false;

    iniciarTemporizador();

    if (jogadorAtual) {
        jogadorAtual.partidas += 1;
        salvarProgresso();
    }

    definirMensagem('Adivinhe a palavra!', 'info');
    atualizarTudo();
}

async function salvarProgresso() {
    if (!jogadorAtual) return;
    await atualizarEstatisticas(
        jogadorAtual.nome,
        jogadorAtual.vitorias,
        jogadorAtual.partidas,
        jogadorAtual.dicasUsadas,
        jogadorAtual.perguntasConcluidas
    );
}

function usarDica() {
    if (state.jogoTerminou || state.palavraCompleta) return;

    const todasLetras = letrasUnicasDoNome(state.palavraAlvo);
    const naoReveladas = [];
    for (let l of todasLetras) {
        if (!state.letrasReveladas.has(l)) {
            naoReveladas.push(l);
        }
    }
    if (naoReveladas.length === 0) {
        definirMensagem('Todas as letras já estão reveladas!', 'info');
        return;
    }
    const letraSorteada = naoReveladas[Math.floor(Math.random() * naoReveladas.length)];
    state.letrasReveladas.add(letraSorteada);
    state.usouDica = true;

    if (jogadorAtual) {
        jogadorAtual.dicasUsadas += 1;
        salvarProgresso();
    }

    definirMensagem(`🔍 Dica: a letra "${letraSorteada.toUpperCase()}" está na palavra!`, 'success');
    atualizarTudo();
    verificarVitoria();
}

function tentarLetra(letra) {
    if (state.jogoTerminou || state.palavraCompleta) return;
    const normalizada = removerAcentos(letra.toLowerCase());
    if (state.letrasReveladas.has(normalizada) || state.letrasErradas.has(normalizada)) return;

    if (letraEstaNoNome(normalizada, state.palavraAlvo)) {
        state.letrasReveladas.add(normalizada);
        definirMensagem(`✅ A letra "${letra.toUpperCase()}" está na palavra!`, 'success');
    } else {
        state.letrasErradas.add(normalizada);
        state.cometeuErro = true;
        definirMensagem(`❌ A letra "${letra.toUpperCase()}" não está na palavra.`, 'error');
    }
    atualizarTudo();
    verificarVitoria();
}

async function verificarVitoria() {
    if (state.jogoTerminou || state.palavraCompleta) return;
    const todas = letrasUnicasDoNome(state.palavraAlvo);
    let todasReveladas = true;
    for (let l of todas) {
        if (!state.letrasReveladas.has(l)) {
            todasReveladas = false;
            break;
        }
    }
    if (todasReveladas) {
        state.palavraCompleta = true;
        pararTemporizador();

        const concluida = !state.usouDica && !state.cometeuErro && !state.tempoExpirado;

        if (concluida && jogadorAtual && state.perguntaAtual) {
            jogadorAtual.perguntasConcluidas.push(state.perguntaAtual.id);
            jogadorAtual.vitorias += 1;
            await salvarProgresso();
            definirMensagem('🎉 Perfeito! Pergunta concluída!', 'win');
        } else if (state.tempoExpirado) {
            definirMensagem('⏰ O tempo acabou, mas podes continuar. Esta pergunta não será concluída.', 'error');
        } else {
            definirMensagem('Usaste dicas ou cometeste erros. Tenta de novo!', 'info');
        }

        atualizarTudo();
        resetBtn.disabled = false;
        await renderizarListaJogadores();
    }
}

// ================================================================
// REINICIAR PROGRESSO
// ================================================================
async function reiniciarProgresso() {
    if (!jogadorAtual) return;
    jogadorAtual.perguntasConcluidas = [];
    jogadorAtual.vitorias = 0;
    jogadorAtual.partidas = 0;
    jogadorAtual.dicasUsadas = 0;
    await salvarProgresso();
    completeScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    iniciarPergunta();
}

// ================================================================
// ECRÃ INICIAL – LISTA DE JOGADORES
// ================================================================
async function renderizarListaJogadores() {
    console.log('🔁 A renderizar lista de jogadores...');
    const jogadores = await carregarJogadores();
    const totalPerguntas = todasPerguntas.length;

    if (jogadores.length === 0) {
        playerListDiv.innerHTML = `<p style="color:#94a3b8;">Ainda não há jogadores. Crie um!</p>`;
        return;
    }

    let html = `<p style="color:#94a3b8; margin-bottom:12px;">Jogadores existentes</p>`;
    for (let j of jogadores) {
        const concluidas = j.perguntasConcluidas ? j.perguntasConcluidas.length : 0;
        const percent = totalPerguntas > 0 ? Math.round((concluidas / totalPerguntas) * 100) : 0;
        console.log(`👤 ${j.nome}: ${concluidas}/${totalPerguntas} (${percent}%)`);

        html += `
            <div class="player-item" data-nome="${j.nome}">
                <span class="name">${j.nome}</span>
                <span class="stats">
                    <span class="progress-track" style="width:350px; display:inline-block; background:rgba(255,255,255,0.1); border-radius:20px; overflow:hidden; height:8px; vertical-align:middle;">
                        <span class="progress-fill" style="width:${percent}%; height:100%; background:#34d399; border-radius:20px; display:block; transition:width 0.4s ease;"></span>
                    </span>
                    <span class="progress-label" style="min-width:50px; text-align:right; font-weight:600; color:#facc15; font-size:0.85rem;">
                        ${percent}%
                    </span>
                </span>
            </div>
        `;
    }
    playerListDiv.innerHTML = html;

    document.querySelectorAll('.player-item').forEach(el => {
        el.addEventListener('click', () => {
            const nome = el.dataset.nome;
            selecionarJogador(nome);
        });
    });
}

// ================================================================
// SELEÇÃO DE JOGADOR
// ================================================================
async function selecionarJogador(nome) {
    const jogadores = await carregarJogadores();
    const jogador = jogadores.find(j => j.nome === nome);
    if (!jogador) return;
    if (!jogador.perguntasConcluidas) jogador.perguntasConcluidas = [];
    jogadorAtual = jogador;
    startScreen.style.display = 'none';
    completeScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    iniciarPergunta();
}

async function criarNovoJogador() {
    const nome = newPlayerInput.value.trim();
    if (!nome) {
        alert('Digite um nome para o jogador.');
        return;
    }
    const sucesso = await adicionarJogador(nome);
    if (!sucesso) {
        alert('Já existe um jogador com esse nome.');
        return;
    }
    newPlayerInput.value = '';
    await renderizarListaJogadores();
    definirMensagem(`✅ Jogador "${nome}" criado! Clique no nome para jogar.`, 'success');
}

// ================================================================
// SAIR
// ================================================================
async function sair() {
    jogadorAtual = null;
    pararTemporizador();
    gameScreen.style.display = 'none';
    completeScreen.style.display = 'none';
    startScreen.style.display = 'block';
    await renderizarListaJogadores();
}

// ================================================================
// OBSERVADOR E ATUALIZAÇÃO PERIÓDICA
// ================================================================
const observer = new MutationObserver(() => {
    if (startScreen.style.display !== 'none') {
        renderizarListaJogadores();
    }
});
observer.observe(startScreen, { attributes: true, attributeFilter: ['style'] });

setInterval(() => {
    if (startScreen.style.display !== 'none') {
        renderizarListaJogadores();
    }
}, 5000);

// ================================================================
// EVENTOS
// ================================================================

createPlayerBtn.addEventListener('click', criarNovoJogador);
newPlayerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') criarNovoJogador();
});

logoutBtn.addEventListener('click', sair);
logoutCompleteBtn.addEventListener('click', sair);
resetProgressBtn.addEventListener('click', reiniciarProgresso);

keyboardDiv.addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key || key.disabled) return;
    const letra = key.dataset.letra;
    tentarLetra(letra);
});

document.addEventListener('keydown', (e) => {
    if (gameScreen.style.display === 'none') return;
    const tecla = e.key;
    if (tecla.length === 1 && tecla.match(/[a-zA-ZçÇ]/)) {
        tentarLetra(tecla);
    }
});

hintBtn.addEventListener('click', usarDica);
resetBtn.addEventListener('click', iniciarPergunta);

// ================================================================
// INICIALIZAR
// ================================================================
renderizarListaJogadores();