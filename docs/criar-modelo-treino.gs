/**
 * Consultoria — Criador de Modelo de Treino
 * ==========================================
 * Como usar:
 *   1. Acesse script.google.com e crie um novo projeto
 *   2. Cole todo este código no editor
 *   3. No menu superior, selecione a função "criarModeloDeTreino"
 *   4. Clique em ▶ Executar (Ctrl+R)
 *   5. Autorize o acesso quando solicitado
 *   6. Verifique o painel "Execuções" para o link da planilha criada
 *
 * O script cria uma nova planilha no seu Google Drive com:
 *   • 5 colunas (cabe na tela do celular sem scroll horizontal)
 *   • Paleta de cores com contraste WCAG 2.1 AA
 *   • Dados de exemplo baseados no treino real do treinador
 *   • Validações de dropdown e checkbox
 *   • Indicadores visuais para ESCOLHER / PREENCHER
 */

// ─────────────────────────────────────────────────────────────────────────────
// PALETA DE CORES — todos os pares passam WCAG 2.1 AA (≥ 4.5:1 texto normal)
// ─────────────────────────────────────────────────────────────────────────────
const COR = {
  // Linhas de metadados (topo da aba)
  metaBg:       '#0F172A',   // fundo escuro
  metaText:     '#F97316',   // laranja — 6.8:1 ✅

  // Seções de exercício (Aquecimento, Treino Principal…)
  secaoBg:      '#1E293B',   // slate escuro
  secaoText:    '#FFFFFF',   // branco — 16.1:1 ✅

  // Início / Final do treino
  inicioBg:     '#991B1B',   // vermelho escuro (corrige o #DC2626 original que falhava)
  inicioText:   '#FFFFFF',   // branco — 5.83:1 ✅

  // Perguntas pré/pós treino
  pergBg:       '#292524',   // quase-preto
  pergText:     '#FFFFFF',   // branco — ~16:1 ✅
  pergHint:     '#94A3B8',   // dica secundária — 5.7:1 sobre #292524 ✅

  // Cabeçalhos de coluna
  colBg:        '#334155',   // slate médio
  colText:      '#FFFFFF',   // branco — 10.1:1 ✅

  // Células de exercício (alternando)
  parBg:        '#FFFFFF',   // branco
  parText:      '#1E293B',   // slate escuro — 16.1:1 ✅
  imparBg:      '#F8FAFC',   // cinza muito claro
  imparText:    '#475569',   // slate médio — 4.63:1 ✅

  // Células ESCOLHER / PREENCHER
  escolherBg:   '#FFF7ED',   // âmbar muito claro
  escolherText: '#9A3412',   // laranja-ferrugem — 5.0:1 ✅

  // Linha de Recorde Pessoal (rm)
  rmBg:         '#FEF9C3',   // amarelo claro
  rmText:       '#854D0E',   // âmbar escuro — 5.5:1 ✅

  // Texto de RPE (verde escuro, legível sobre branco ou #F8FAFC)
  rpeVerde:     '#15803D',   // 4.54:1 sobre branco ✅

  // Texto de continuação (col A vazio = mesmo exercício)
  continuacaoText: '#94A3B8',

  // Borda entre seções
  borda:        '#CBD5E1',
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
function criarModeloDeTreino() {
  const ss = SpreadsheetApp.create('Consultoria — Modelo de Treino');
  const sheet = ss.getActiveSheet();
  sheet.setName('Terça');

  // ── Largura das colunas (5 colunas → ~455 px total, cabe em 480 px+) ───────
  sheet.setColumnWidth(1, 220); // A — Exercício (coluna mais larga)
  sheet.setColumnWidth(2,  55); // B — Séries
  sheet.setColumnWidth(3,  60); // C — Reps
  sheet.setColumnWidth(4,  75); // D — Carga (kg)
  sheet.setColumnWidth(5,  50); // E — RPE
  // Ocultar colunas F em diante para deixar a planilha limpa
  const nCols = sheet.getMaxColumns();
  if (nCols > 5) sheet.hideColumns(6, nCols - 5);

  // Configuração global de texto
  sheet.getRange(1, 1, 35, 5)
    .setFontFamily('Arial')
    .setFontSize(11)
    .setVerticalAlignment('middle');

  // ── Linha 1 — Metadados da sessão (preenchido pelo treinador) ────────────
  _rowHeight(sheet, 1, 28);
  sheet.getRange('A1:E1')
    .setBackground(COR.metaBg)
    .setFontColor(COR.metaText)
    .setFontWeight('bold')
    .setFontSize(10);
  sheet.getRange('A1').setValue('[Nome do Aluno]');
  sheet.getRange('C1').setValue('b1 · s1 · mg').setHorizontalAlignment('center');
  sheet.getRange('E1').setValue('Visto ✓').setHorizontalAlignment('center');

  // ── Linha 2 — Motto + dia de treino + checkbox "Visto do Aluno" ──────────
  _rowHeight(sheet, 2, 28);
  sheet.getRange('A2:E2')
    .setBackground(COR.metaBg)
    .setFontColor(COR.metaText)
    .setFontSize(10);
  sheet.getRange('A2').setValue('Funcionalidade acima da estética').setFontStyle('italic');
  sheet.getRange('C2').setValue('Treino 2').setFontWeight('bold').setHorizontalAlignment('center');
  // Checkbox em E2 — o app escreve TRUE quando o aluno abre a sessão
  sheet.getRange('E2')
    .setValue(false)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment('center');

  // ── Linha 3 — Espaço vazio ────────────────────────────────────────────────
  _rowHeight(sheet, 3, 8);

  // ── Linha 4 — INÍCIO DO TREINO ────────────────────────────────────────────
  _rowHeight(sheet, 4, 38);
  sheet.getRange('A4:E4').merge()
    .setValue('Preencha abaixo (INÍCIO DO TREINO)')
    .setBackground(COR.inicioBg)
    .setFontColor(COR.inicioText)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // ── Linha 5 — Nível de ânimo (pré-treino) ────────────────────────────────
  _rowHeight(sheet, 5, 38);
  sheet.getRange('A5:E5').setBackground(COR.pergBg).setFontColor(COR.pergText);
  sheet.getRange('A5').setValue('Qual o seu nível de ânimo?').setFontWeight('bold');
  sheet.getRange('B5:C5').merge()
    .setValue(2)
    .setHorizontalAlignment('center')
    .setFontSize(15)
    .setFontWeight('bold')
    .setNote('Insira um número de 1 a 5\n1 = muito baixo\n5 = muito alto');
  sheet.getRange('D5:E5').merge()
    .setValue('(1 – 5)')
    .setFontSize(9)
    .setFontColor(COR.pergHint)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // ── Linha 6 — Como está se sentindo? (pré-treino) ────────────────────────
  _rowHeight(sheet, 6, 38);
  sheet.getRange('A6:E6').setBackground(COR.pergBg).setFontColor(COR.pergText);
  sheet.getRange('A6').setValue('Como está se sentindo?').setFontWeight('bold');
  sheet.getRange('B6:E6').merge()
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Bem', 'Mal'], true)
        .setHelpText('Selecione como está se sentindo antes do treino')
        .build()
    )
    .setHorizontalAlignment('center')
    .setFontWeight('bold')
    .setFontSize(12);

  // ── Linha 7 — Seção: AQUECIMENTO ─────────────────────────────────────────
  _secao(sheet, 7, 'Aquecimento');

  // ── Linha 8 — Cabeçalhos de coluna ───────────────────────────────────────
  _cabecalhos(sheet, 8);

  // ── Linhas 9–12 — Exercícios de aquecimento ──────────────────────────────
  // [exercício, séries, reps, carga, rpe]
  // Obs do treinador colocadas como nota na célula do exercício
  const aquecimento = [
    { row: ['Scorpion',                     1,    1,   '--', '--'],  nota: null },
    { row: ['Extensão torácica',             1,    1,   '--', '--'],  nota: null },
    { row: ['Extensão de punho (4 apoios)', 1,   10,   '--', '--'],  nota: 'Segurar 15s em cada rep' },
    { row: ['Frog Pump',                    2,   10,   '--',   7],   nota: 'Segurar 2s no topo de todas as reps' },
  ];
  aquecimento.forEach((item, i) => _exercicio(sheet, 9 + i, item.row, i, item.nota));

  // ── Linha 13 — Seção: TREINO PRINCIPAL ───────────────────────────────────
  _secao(sheet, 13, 'Treino Principal');

  // ── Linha 14 — Cabeçalhos de coluna (repetição) ──────────────────────────
  _cabecalhos(sheet, 14);

  // ── Linhas 15–25 — Exercícios principais ─────────────────────────────────
  // Nome vazio em col A = linha de continuação do mesmo exercício (multi-set)
  const principal = [
    // Levantamento Terra — 5 séries progressivas
    { row: ['Levantamento Terra',  1,  5,   80, 7],  nota: null },
    { row: ['',                    1,  5,  100, 7],  nota: null },
    { row: ['',                    1,  3,  125, 8],  nota: null },
    { row: ['',                    3,  1,  145, 9],  nota: 'pensa menos' },
    { row: ['',                    2,  3,  138, 8],  nota: null },
    // Agachamento Livre — 4 séries
    { row: ['Agachamento Livre',   1,  5,   90, 7],  nota: null },
    { row: ['',                    1,  5,  100, 7],  nota: null },
    { row: ['',                    2,  5,  120, 8],  nota: null },
    // Exercícios isolados
    { row: ['RDL Unilateral',      3, 10,   40, 7],  nota: null },
    { row: ['Cadeira Flexora',     3, 10,   'ESCOLHER', 'PREENCHER'], nota: null },
    { row: ['Extensora',           3, 10,   'ESCOLHER', 'PREENCHER'], nota: null },
  ];
  principal.forEach((item, i) => _exercicio(sheet, 15 + i, item.row, i, item.nota));

  // ── Linha 26 — Recorde pessoal (rm) ──────────────────────────────────────
  _rowHeight(sheet, 26, 38);
  sheet.getRange('A26:E26')
    .setBackground(COR.rmBg)
    .setFontColor(COR.rmText)
    .setFontWeight('bold');
  sheet.getRange('A26')
    .setValue('🏆  rm')
    .setFontSize(12)
    .setHorizontalAlignment('center');
  sheet.getRange('B26:C26').merge()
    .setValue('[exercício]')
    .setFontStyle('italic')
    .setFontWeight('normal')
    .setHorizontalAlignment('center');
  sheet.getRange('D26:E26').merge()
    .setValue('[melhor carga (kg)]')
    .setFontStyle('italic')
    .setFontWeight('normal')
    .setHorizontalAlignment('center');

  // ── Linha 27 — FINAL DO TREINO ────────────────────────────────────────────
  _rowHeight(sheet, 27, 38);
  sheet.getRange('A27:E27').merge()
    .setValue('Preencha abaixo (FINAL DO TREINO)')
    .setBackground(COR.inicioBg)
    .setFontColor(COR.inicioText)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // ── Linha 28 — Nível de ânimo (pós-treino) ───────────────────────────────
  _rowHeight(sheet, 28, 38);
  sheet.getRange('A28:E28').setBackground(COR.pergBg).setFontColor(COR.pergText);
  sheet.getRange('A28').setValue('Qual o seu nível de ânimo?').setFontWeight('bold');
  sheet.getRange('B28:C28').merge()
    .setValue(5)
    .setHorizontalAlignment('center')
    .setFontSize(15)
    .setFontWeight('bold')
    .setNote('Insira um número de 1 a 5\n1 = muito baixo\n5 = muito alto');
  sheet.getRange('D28:E28').merge()
    .setValue('(1 – 5)')
    .setFontSize(9)
    .setFontColor(COR.pergHint)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');

  // ── Linha 29 — Como está se sentindo? (pós-treino) ───────────────────────
  _rowHeight(sheet, 29, 38);
  sheet.getRange('A29:E29').setBackground(COR.pergBg).setFontColor(COR.pergText);
  sheet.getRange('A29').setValue('Como está se sentindo?').setFontWeight('bold');
  sheet.getRange('B29:E29').merge()
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Igual', 'Melhor', 'Pior'], true)
        .setHelpText('Selecione como está se sentindo após o treino')
        .build()
    )
    .setHorizontalAlignment('center')
    .setFontWeight('bold')
    .setFontSize(12);

  // ── Linha 30 — Espaço vazio final ────────────────────────────────────────
  _rowHeight(sheet, 30, 10);

  // ── Congelar as 2 primeiras linhas (metadados ficam visíveis ao rolar) ───
  sheet.setFrozenRows(2);

  // ── Bordas sutis entre seções ────────────────────────────────────────────
  const bs = SpreadsheetApp.BorderStyle.SOLID;
  [
    'A9:E12',
    'A15:E25',
  ].forEach(addr => {
    sheet.getRange(addr)
      .setBorder(true, true, true, true, false, true, COR.borda, bs);
  });
  // Borda mais forte abaixo dos cabeçalhos de coluna
  sheet.getRange('A8:E8').setBorder(null, null, true, null, null, null, '#64748B', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange('A14:E14').setBorder(null, null, true, null, null, null, '#64748B', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // ── Resultado ─────────────────────────────────────────────────────────────
  const url = ss.getUrl();
  Logger.log('✅ Modelo criado com sucesso!');
  Logger.log('🔗 ' + url);
  // Para ver o link: menu Ver → Logs (ou Ctrl+Enter)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/** Define altura de uma linha. */
function _rowHeight(sheet, row, px) {
  sheet.setRowHeight(row, px);
}

/** Renderiza uma linha de cabeçalho de seção (Aquecimento, Treino Principal…). */
function _secao(sheet, row, nome) {
  _rowHeight(sheet, row, 36);
  sheet.getRange(row, 1, 1, 5).merge()
    .setValue(nome)
    .setBackground(COR.secaoBg)
    .setFontColor(COR.secaoText)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

/** Renderiza a linha de cabeçalhos de coluna. */
function _cabecalhos(sheet, row) {
  _rowHeight(sheet, row, 30);
  const LABELS = ['Exercício', 'Séries', 'Reps', 'Carga (kg)', 'RPE'];
  sheet.getRange(row, 1, 1, 5)
    .setValues([LABELS])
    .setBackground(COR.colBg)
    .setFontColor(COR.colText)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  // Exercício alinhado à esquerda
  sheet.getRange(row, 1).setHorizontalAlignment('left');
}

/**
 * Renderiza uma linha de exercício.
 * @param {Sheet} sheet
 * @param {number} row — número da linha (1-based)
 * @param {Array} dados — [nome, séries, reps, carga, rpe]
 * @param {number} idx — índice para alternância de cor (0-based)
 * @param {string|null} nota — observação do treinador (aparece como tooltip)
 */
function _exercicio(sheet, row, dados, idx, nota) {
  _rowHeight(sheet, row, 36);

  const isContinuacao = dados[0] === '';
  const isEven = idx % 2 === 0;
  const bg       = isEven ? COR.parBg   : COR.imparBg;
  const textoPad = isEven ? COR.parText : COR.imparText;

  // Valores
  sheet.getRange(row, 1, 1, 5)
    .setValues([dados])
    .setBackground(bg)
    .setFontColor(textoPad)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // Coluna A: nome do exercício
  const cellA = sheet.getRange(row, 1);
  cellA.setHorizontalAlignment('left');
  if (!isContinuacao) {
    cellA.setFontWeight('bold').setFontColor(COR.parText);
    if (nota) cellA.setNote(nota);
  } else {
    // Linha de continuação: texto mais suave para indicar que pertence ao exercício acima
    cellA.setFontColor(COR.continuacaoText);
  }

  // Coluna D: carga
  const carga = dados[3];
  if (carga === 'ESCOLHER') {
    sheet.getRange(row, 4)
      .setBackground(COR.escolherBg)
      .setFontColor(COR.escolherText)
      .setFontWeight('bold')
      .setNote('O aluno escolhe o peso pelo feel / RPE indicado');
  }

  // Coluna E: RPE
  const rpe = dados[4];
  if (rpe === 'PREENCHER') {
    sheet.getRange(row, 5)
      .setBackground(COR.escolherBg)
      .setFontColor(COR.escolherText)
      .setFontWeight('bold')
      .setNote('O aluno deve preencher o RPE percebido (1–10)');
  } else if (typeof rpe === 'number') {
    sheet.getRange(row, 5)
      .setFontColor(COR.rpeVerde)
      .setFontWeight('bold');
  }
}
