// ================================================================
// NÍVEIS
// ================================================================
let nivelAtual = 'basico'; // 'basico', 'intermedio', 'avancado'

// Por enquanto, todos os níveis usam o mesmo conjunto de países
function getPaisesPorNivel(nivel) {
    return PAISES;
}

// ================================================================
// BANCO DE PERGUNTAS (com prefixo por nível)
// ================================================================
function gerarPerguntas(nivel) {
    const paises = getPaisesPorNivel(nivel);
    const perguntas = [];
    paises.forEach(p => {
        const prefix = nivel + ':';
        perguntas.push({
            id: `${prefix}pais:${p.pais}`,
            tipo: 'pais',
            paisObj: p,
            palavraAlvo: p.pais,
            pergunta: `Qual é o país cuja capital é ${p.capital}?`,
            opcoesTipo: 'pais'
        });
        perguntas.push({
            id: `${prefix}capital:${p.pais}`,
            tipo: 'capital',
            paisObj: p,
            palavraAlvo: p.capital,
            pergunta: `Qual é a capital de ${p.pais}?`,
            opcoesTipo: 'capital'
        });
    });
    console.log(`✅ Perguntas geradas para nível ${nivel}:`, perguntas.length);
    return perguntas;
}

// ================================================================
// GERAR 4 OPÇÕES (TODAS DO MESMO CONTINENTE, DENTRO DO NÍVEL)
// ================================================================
function gerarOpcoes(pergunta, paisObj) {
    const tipo = pergunta.opcoesTipo;
    const continente = paisObj.continente;
    const correta = tipo === 'pais' ? paisObj.pais : paisObj.capital;

    const paisesNivel = getPaisesPorNivel(nivelAtual);
    const mesmosContinentes = paisesNivel.filter(p => p.continente === continente);
    const valores = mesmosContinentes.map(p => tipo === 'pais' ? p.pais : p.capital);
    const outras = valores.filter(v => v !== correta);

    let distratores = outras.sort(() => Math.random() - 0.5).slice(0, 3);
    if (distratores.length < 3) {
        const todosValores = paisesNivel.map(p => tipo === 'pais' ? p.pais : p.capital);
        const outrasGlobais = todosValores.filter(v => v !== correta && !distratores.includes(v));
        const extra = outrasGlobais.sort(() => Math.random() - 0.5).slice(0, 3 - distratores.length);
        distratores = [...distratores, ...extra];
    }
    const opcoes = [correta, ...distratores];
    return opcoes.sort(() => Math.random() - 0.5);
}

// ================================================================
// FIREBASE
// ================================================================
const COLLECTION_NAME = 'jogadores';

async function carregarJogadores() {
    try {
        const snapshot = await db.collection(COLLECTION_NAME).get();
        const jogadores = [];
        snapshot.forEach(doc => jogadores.push(doc.data()));
        console.log('📥 Jogadores carregados:', jogadores);
        return jogadores;
    } catch (e) {
        console.error('❌ Erro ao carregar jogadores:', e);
        return [];
    }
}

async function salvarJogadores(jogadores) {
    try {
        for (let j of jogadores) await db.collection(COLLECTION_NAME).doc(j.nome).set(j);
    } catch (e) { console.error(e); }
}

async function adicionarJogador(nome) {
    const jogadores = await carregarJogadores();
    if (jogadores.find(j => j.nome.toLowerCase() === nome.toLowerCase())) return false;
    const novo = { nome, vitorias: 0, partidas: 0, dicasUsadas: 0, perguntasConcluidas: [] };
    await db.collection(COLLECTION_NAME).doc(nome).set(novo);
    return true;
}

async function atualizarEstatisticas(nome, vitorias, partidas, dicasUsadas, perguntasConcluidas) {
    await db.collection(COLLECTION_NAME).doc(nome).set({ nome, vitorias, partidas, dicasUsadas, perguntasConcluidas });
    await renderizarListaJogadores();
}

// ================================================================
// DOM
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
const questionDisplay = document.getElementById('questionDisplay');
const optionsGrid = document.getElementById('optionsGrid');
const hintBtn = document.getElementById('hintBtn');
const resetBtn = document.getElementById('resetBtn');

console.log('✅ Elementos DOM carregados.');

// ================================================================
// ESTADO
// ================================================================
let state = {
    perguntaAtual: null,
    opcoes: [],
    correta: '',
    respostaDada: false,
    jogoTerminou: false,
    palavraCompleta: false,
    usouDica: false,
    cometeuErro: false,
    tempoRestante: 60,
    timerInterval: null,
    tempoExpirado: false
};

let jogadorAtual = null;
let todasPerguntas = gerarPerguntas(nivelAtual);

// ================================================================
// AUXILIARES
// ================================================================
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
// MUDAR NÍVEL
// ================================================================
function mudarNivel(nivel) {
    if (nivel === nivelAtual) return;
    nivelAtual = nivel;

    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.level === nivel);
    });

    todasPerguntas = gerarPerguntas(nivel);
    if (jogadorAtual) {
        iniciarPergunta();
    }
    renderizarListaJogadores();
}

// ================================================================
// TEMPORIZADOR
// ================================================================
function iniciarTemporizador() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    // O tempo só conta para níveis diferentes do básico
    // No básico, o temporizador corre apenas para exibição (não bloqueia)
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
    if (state.timerInterval) clearInterval(state.timerInterval);
}

// ================================================================
// RENDERIZAÇÃO DAS OPÇÕES
// ================================================================
function renderizarOpcoes() {
    console.log('🔄 Renderizar opções:', state.opcoes);
    const botoes = optionsGrid.querySelectorAll('.option-btn');
    const letras = ['A', 'B', 'C', 'D'];
    botoes.forEach((btn, i) => {
        if (i < state.opcoes.length) {
            btn.innerHTML = `<span class="letter">${letras[i]}.</span> ${state.opcoes[i]}`;
            btn.style.display = 'flex';
            btn.className = 'option-btn';
            btn.dataset.valor = state.opcoes[i];
            btn.disabled = false;
        } else {
            btn.style.display = 'none';
        }
    });
}

function atualizarTudo() {
    const prog = progressoAtual();
    const percent = prog.total > 0 ? (prog.concluidas / prog.total) * 100 : 0;
    progressDisplay.textContent = `${prog.concluidas}/${prog.total}`;
    if (gameProgressFill) gameProgressFill.style.width = percent + '%';
    if (jogadorAtual) playerNameDisplay.textContent = `👤 ${jogadorAtual.nome}`;
    resetBtn.disabled = !state.palavraCompleta;
    hintBtn.disabled = (state.respostaDada || state.palavraCompleta || state.usouDica);
}

// ================================================================
// LÓGICA DO JOGO
// ================================================================
function iniciarPergunta() {
    const pendentes = perguntasPendentes();
    if (pendentes.length === 0) {
        gameScreen.style.display = 'none';
        completeScreen.style.display = 'flex';
        return;
    }

    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.className = 'option-btn';
        btn.style.removeProperty('opacity');
        btn.style.removeProperty('cursor');
        btn.style.removeProperty('border-color');
        btn.style.removeProperty('background');
        btn.style.removeProperty('pointer-events');
        btn.style.removeProperty('color');
        btn.style.removeProperty('display');
        btn.style.removeProperty('background-color');
        btn.style.removeProperty('border');
        btn.removeAttribute('disabled');
        btn.disabled = false;
    });

    const pergunta = pendentes[Math.floor(Math.random() * pendentes.length)];
    state.perguntaAtual = pergunta;
    state.respostaDada = false;
    state.palavraCompleta = false;
    state.usouDica = false;
    state.cometeuErro = false;
    state.jogoTerminou = false;
    state.tempoExpirado = false;

    state.opcoes = gerarOpcoes(pergunta, pergunta.paisObj);
    state.correta = pergunta.palavraAlvo;

    questionDisplay.textContent = pergunta.pergunta;
    renderizarOpcoes();

    if (jogadorAtual) {
        jogadorAtual.partidas += 1;
        salvarProgresso();
    }

    iniciarTemporizador();
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

// ================================================================
// USAR DICA (elimina uma opção errada)
// ================================================================
function usarDica() {
    if (state.usouDica || state.respostaDada || state.palavraCompleta) {
        console.log('⛔ Dica não disponível.');
        return;
    }

    const botoes = optionsGrid.querySelectorAll('.option-btn:not(.disabled):not(.hidden)');
    const erradas = [];
    botoes.forEach(btn => {
        if (btn.dataset.valor !== state.correta) {
            erradas.push(btn);
        }
    });

    if (erradas.length === 0) {
        console.log('⚠️ Não há opções erradas para desativar.');
        return;
    }

    const alvo = erradas[Math.floor(Math.random() * erradas.length)];
    alvo.classList.add('disabled');
    alvo.style.opacity = '0.4';
    alvo.style.cursor = 'default';
    alvo.style.borderColor = 'rgba(255,255,255,0.1)';
    alvo.style.background = 'rgba(255,255,255,0.02)';
    alvo.disabled = true;

    state.usouDica = true;
    if (jogadorAtual) {
        jogadorAtual.dicasUsadas += 1;
        salvarProgresso();
    }
    hintBtn.disabled = true;

    console.log('💡 Dica: opção desativada:', alvo.dataset.valor);
    atualizarTudo();
}

// ================================================================
// SELECIONAR OPÇÃO
// ================================================================
async function selecionarOpcao(valor, btn) {
    if (state.respostaDada || state.palavraCompleta) return;
    state.respostaDada = true;
    pararTemporizador();

    const correta = valor === state.correta;
    if (!correta) state.cometeuErro = true;

    document.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        if (b.dataset.valor === state.correta) {
            b.classList.add('correct');
        } else {
            b.classList.add('disabled');
            if (b.dataset.valor === valor && !correta) {
                b.classList.add('wrong');
            }
        }
    });

    // ===== REGRAS DE CONCLUSÃO POR NÍVEL =====
    let concluida;
    if (nivelAtual === 'basico') {
        // No básico: basta acertar, independentemente de dicas ou tempo
        concluida = correta && !state.cometeuErro;
    } else {
        // Intermédio e Avançado: sem dicas, sem erros e dentro do tempo
        concluida = correta && !state.usouDica && !state.cometeuErro && !state.tempoExpirado;
    }

    if (concluida && jogadorAtual && state.perguntaAtual) {
        jogadorAtual.perguntasConcluidas.push(state.perguntaAtual.id);
        jogadorAtual.vitorias += 1;
        await salvarProgresso();
        console.log('✅ Pergunta concluída!');
    } else {
        console.log('❌ Pergunta NÃO concluída.', { correta, usouDica: state.usouDica, cometeuErro: state.cometeuErro, tempoExpirado: state.tempoExpirado });
    }

    state.palavraCompleta = true;
    atualizarTudo();
    resetBtn.disabled = false;
    await renderizarListaJogadores();
}

// ================================================================
// EVENTOS DAS OPÇÕES
// ================================================================
optionsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (!btn || btn.disabled || btn.classList.contains('hidden')) return;
    const valor = btn.dataset.valor;
    if (valor) selecionarOpcao(valor, btn);
});

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
// LISTA DE JOGADORES
// ================================================================
async function renderizarListaJogadores() {
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
        html += `
            <div class="player-item" data-nome="${j.nome}">
                <span class="name">${j.nome}</span>
                <span class="stats">
                    <span class="progress-track" style="width:350px; display:inline-block; background:rgba(255,255,255,0.1); border-radius:20px; overflow:hidden; height:8px; vertical-align:middle;">
                        <span class="progress-fill" style="width:${percent}%; height:100%; background:#34d399; border-radius:20px; display:block; transition:width 0.4s ease;"></span>
                    </span>
                    <span class="progress-label" style="min-width:50px; text-align:right; font-weight:600; color:#facc15; font-size:0.85rem;">${percent}%</span>
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
    if (!nome) { alert('Digite um nome.'); return; }
    const sucesso = await adicionarJogador(nome);
    if (!sucesso) { alert('Já existe.'); return; }
    newPlayerInput.value = '';
    await renderizarListaJogadores();
    selecionarJogador(nome);
}

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
    if (startScreen.style.display !== 'none') renderizarListaJogadores();
});
observer.observe(startScreen, { attributes: true, attributeFilter: ['style'] });

setInterval(() => {
    if (startScreen.style.display !== 'none') renderizarListaJogadores();
}, 5000);

// ================================================================
// EVENTOS
// ================================================================
createPlayerBtn.addEventListener('click', criarNovoJogador);
newPlayerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') criarNovoJogador(); });
logoutBtn.addEventListener('click', sair);
logoutCompleteBtn.addEventListener('click', sair);
resetProgressBtn.addEventListener('click', reiniciarProgresso);
hintBtn.addEventListener('click', usarDica);
resetBtn.addEventListener('click', iniciarPergunta);

// ================================================================
// EVENTOS DOS BOTÕES DE NÍVEL
// ================================================================
document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const nivel = btn.dataset.level;
        if (nivel !== nivelAtual) {
            mudarNivel(nivel);
        }
    });
});

// ================================================================
// INICIALIZAR
// ================================================================
renderizarListaJogadores();