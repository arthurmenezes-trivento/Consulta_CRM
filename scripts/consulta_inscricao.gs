/**
 * Consulta inscricoes no CRM Educacional e preenche a planilha ativa.
 *
 * Estrutura esperada (a linha 1 deve conter os cabecalhos):
 * A: CONSULTOR
 * B: DATA
 * C: Numero de Inscricao
 * D: NOME
 * E: CELULAR
 * F: CPF (somente numeros)
 * G: CURSO
 * H: FORMA DE INGRESSO
 *
 * Para consultar automaticamente ao editar a coluna C, execute uma vez:
 * CRM > Ativar preenchimento automatico.
 */

const CRM_BASE_URL = "https://trivento.api.crmeducacional.com";
const CRM_SEARCH_URL = `${CRM_BASE_URL}/api/LocalizacaoAvancada`;
const CRM_AUTH_TYPE = "APICRMEducacional";
const PADRAO_INSCRICAO = /^CAN-\d{6}-TRI$/;
const MENSAGEM_PROPRIETARIO_VAZIO =
  "O Lead referente a essa inscrição está sem proprietário. Favor preencher o campo proprietário Lead no CRM e tentar novamente";
const MENSAGEM_CONSULTOR_DIVERGENTE =
  "O Consultor selecionado não corresponde ao proprietário no CRM";
const PREFIXO_PROTECAO_DIVERGENCIA = "CRM_DIVERGENCIA_AUTOMATICA";
const TEXTO_VALIDACAO_BLOQUEIO =
  "Corrija a divergência entre consultor e proprietário e consulte novamente.";

const CONSULTOR_PROPRIETARIO = {
  "Gabriel Matos": "Gabriel",
  "Maria Eduarda Freire": "Duda",
  "Maria Rafaela da Rocha Tavares": "Maria Rafaela",
  "Adauri Marques Delfino Junior": "Adauri",
  "Karen Flávia": "Flávia",
  "Daniel Faria Santos": "Daniel",
  "Geovana Souza da Silva": "Geovana",
  "Agnata Pamela Silva Souza": "Agnata",
  "Giovanna Eduarda Do Carmo Braga": "Giovanna Braga",
  "Hailton Alves Júnior": "Hailton",
  "Karolaine de Oliveira Alves Souza": "Karolaine",
  "Thiago Oliveira da Cruz": "Thiago",
  "Maria Fernanda Luiz Monteiro": "Maria Fernanda",
  "Ana Carolina Guimarães": "Ana Carolina",
  "Lorena Viana Gonçalves Pereira": "Lorena",
  "Thalia Gabriela de Araújo Silva": "Thalia",
  "Thalia Costa": "Thalia Costa",
  "Camila Guimarães Santos": "Camila",
  "Breno Assis Ferreira": "Breno",
  "Alana Mileyde de Souza Pinto": "Alana",
  "Debora Soares": "Débora",
};

const LINHA_CABECALHO = 1;
const COLUNA_CONSULTOR = 1;
const COLUNA_DATA = 2;
const COLUNA_INSCRICAO = 3;
const COLUNA_NOME = 4;
const COLUNA_CELULAR = 5;
const COLUNA_CPF = 6;
const COLUNA_CURSO = 7;
const COLUNA_FORMA_INGRESSO = 8;


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CRM")
    .addItem("Consultar linha selecionada", "consultarLinhaSelecionada")
    .addItem("Consultar todas as inscricoes", "consultarInscricoes")
    .addItem("Remover bloqueios antigos do CRM", "removerBloqueiosCrm")
    .addSeparator()
    .addItem("Ativar preenchimento automatico", "instalarGatilhoEdicao")
    .addToUi();
}


/** Cria o gatilho instalavel necessario para consultar a API durante a edicao. */
function instalarGatilhoEdicao() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const jaExiste = ScriptApp.getProjectTriggers().some((gatilho) =>
    gatilho.getHandlerFunction() === "aoEditarNumeroInscricao" &&
    gatilho.getTriggerSourceId() === planilha.getId()
  );

  if (jaExiste) {
    planilha.toast("O preenchimento automatico ja esta ativo.", "CRM", 5);
    return;
  }

  ScriptApp.newTrigger("aoEditarNumeroInscricao")
    .forSpreadsheet(planilha)
    .onEdit()
    .create();

  planilha.toast("Preenchimento automatico ativado.", "CRM", 5);
}


/** Gatilho instalavel: consulta os numeros digitados ou colados na coluna C. */
function aoEditarNumeroInscricao(evento) {
  if (!evento || !evento.range) {
    return;
  }

  const intervalo = evento.range;
  const aba = intervalo.getSheet();
  const primeiraLinha = Math.max(intervalo.getRow(), LINHA_CABECALHO + 1);
  const ultimaLinha = intervalo.getLastRow();
  const colunaInicial = intervalo.getColumn();
  const colunaFinal = intervalo.getLastColumn();

  const colunasAjustadas = [COLUNA_CONSULTOR, COLUNA_INSCRICAO];
  if (
    primeiraLinha > ultimaLinha ||
    !colunasAjustadas.some((coluna) => coluna >= colunaInicial && coluna <= colunaFinal)
  ) {
    return;
  }

  const entradas = aba
    .getRange(primeiraLinha, COLUNA_INSCRICAO, ultimaLinha - primeiraLinha + 1, 1)
    .getDisplayValues();

  entradas.forEach(([numero], indice) => {
    if (!String(numero).trim()) {
      desbloquearCamposResultado_(aba, primeiraLinha + indice);
      limparResultadoLinha_(aba, primeiraLinha + indice);
      aba.getRange(primeiraLinha + indice, COLUNA_INSCRICAO).clearNote();
    }
  });

  if (!entradas.some(([numero]) => String(numero).trim())) {
    return;
  }

  let token;
  try {
    token = obterTokenDasPropriedades_();
  } catch (erro) {
    entradas.forEach(([numero], indice) => {
      if (String(numero).trim()) {
        desbloquearCamposResultado_(aba, primeiraLinha + indice);
        limparResultadoLinha_(aba, primeiraLinha + indice);
        aba.getRange(primeiraLinha + indice, COLUNA_INSCRICAO)
          .setNote(`Erro na consulta: ${erro.message || String(erro)}`);
      }
    });
    return;
  }

  entradas.forEach(([numero], indice) => {
    if (String(numero).trim()) {
      consultarEPreencherLinha_(aba, primeiraLinha + indice, numero, token);
    }
  });
}


function consultarLinhaSelecionada() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getActiveSheet();
  const linha = aba.getActiveRange().getRow();

  if (linha <= LINHA_CABECALHO) {
    planilha.toast("Selecione uma linha de dados.", "CRM", 5);
    return;
  }

  const numero = aba.getRange(linha, COLUNA_INSCRICAO).getDisplayValue();
  if (!String(numero).trim()) {
    planilha.toast("Preencha o numero de inscricao na coluna C.", "CRM", 5);
    return;
  }

  let token;
  try {
    token = obterTokenDasPropriedades_();
  } catch (erro) {
    desbloquearCamposResultado_(aba, linha);
    aba.getRange(linha, COLUNA_INSCRICAO)
      .setNote(`Erro na consulta: ${erro.message || String(erro)}`);
    return;
  }
  consultarEPreencherLinha_(aba, linha, numero, token);
}


function consultarInscricoes() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getActiveSheet();
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha <= LINHA_CABECALHO) {
    planilha.toast("Insira ao menos uma inscricao na coluna C.", "CRM", 5);
    return;
  }

  const entradas = aba
    .getRange(LINHA_CABECALHO + 1, COLUNA_INSCRICAO, ultimaLinha - LINHA_CABECALHO, 1)
    .getDisplayValues();

  if (!entradas.some(([numero]) => String(numero).trim())) {
    planilha.toast("Insira ao menos uma inscricao na coluna C.", "CRM", 5);
    return;
  }

  let token;
  try {
    token = obterTokenDasPropriedades_();
  } catch (erro) {
    entradas.forEach(([numero], indice) => {
      if (String(numero).trim()) {
        const linha = LINHA_CABECALHO + 1 + indice;
        desbloquearCamposResultado_(aba, linha);
        aba.getRange(linha, COLUNA_INSCRICAO)
          .setNote(`Erro na consulta: ${erro.message || String(erro)}`);
      }
    });
    return;
  }
  entradas.forEach(([numero], indice) => {
    if (String(numero).trim()) {
      consultarEPreencherLinha_(
        aba,
        LINHA_CABECALHO + 1 + indice,
        numero,
        token
      );
    }
  });

  SpreadsheetApp.flush();
  planilha.toast("Consulta concluida.", "CRM", 5);
}


function consultarEPreencherLinha_(aba, linha, entrada, token) {
  const celulaInscricao = aba.getRange(linha, COLUNA_INSCRICAO);

  try {
    desbloquearCamposResultado_(aba, linha);
    const numero = normalizarNumeroInscricao_(entrada);
    const dados = buscarPorNumero_(numero, token);

    if (!dados) {
      limparResultadoLinha_(aba, linha);
      celulaInscricao.setValue(numero).setNote("Inscricao nao encontrada no CRM.");
      return;
    }

    const consultorLinha = aba
      .getRange(linha, COLUNA_CONSULTOR)
      .getDisplayValue()
      .trim();

    if (!consultorLinha) {
      throw new Error(MENSAGEM_CONSULTOR_DIVERGENTE);
    }

    const proprietarioEsperado = CONSULTOR_PROPRIETARIO[dados.proprietario] ||
      dados.proprietario;

    if (normalizarTexto_(consultorLinha) !== normalizarTexto_(proprietarioEsperado)) {
      throw new Error(MENSAGEM_CONSULTOR_DIVERGENTE);
    }

    limparDestaqueLinha_(aba, linha);

    aba.getRange(linha, COLUNA_DATA)
      .setValue(dataAtualSemHora_())
      .setNumberFormat("dd/MM/yyyy");
    celulaInscricao.setValue(numero).clearNote();
    aba.getRange(linha, COLUNA_NOME).setValue(dados.nome || "");
    aba.getRange(linha, COLUNA_CELULAR)
      .setNumberFormat("@")
      .setValue(dados.celular || "");
    aba.getRange(linha, COLUNA_CPF)
      .setNumberFormat("@")
      .setValue(somenteNumeros_(dados.cpf));
    aba.getRange(linha, COLUNA_CURSO).setValue(dados.curso || "");
    aba.getRange(linha, COLUNA_FORMA_INGRESSO).setValue(dados.formaIngresso || "");
  } catch (erro) {
    const mensagemErro = erro.message || String(erro);
    if (mensagemErro === MENSAGEM_PROPRIETARIO_VAZIO ||
        mensagemErro === MENSAGEM_CONSULTOR_DIVERGENTE) {
      limparResultadoLinha_(aba, linha);
    }

    // Registra a falha na inscrição e sinaliza visualmente a linha.
    celulaInscricao.setNote(`Erro na consulta: ${mensagemErro}`);
    destacarLinhaErro_(aba, linha);

    if (mensagemErro === MENSAGEM_PROPRIETARIO_VAZIO) {
      aba.getParent().toast(MENSAGEM_PROPRIETARIO_VAZIO, "CRM", 5);
    }

    if (mensagemErro === MENSAGEM_CONSULTOR_DIVERGENTE) {
      aba.getParent().toast(MENSAGEM_CONSULTOR_DIVERGENTE, "CRM", 5);
    }
  }
}


function dataAtualSemHora_() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}


function limparResultadoLinha_(aba, linha) {
  aba.getRange(linha, COLUNA_DATA).clearContent();
  aba.getRange(linha, COLUNA_NOME, 1, COLUNA_FORMA_INGRESSO - COLUNA_NOME + 1)
    .clearContent();
}


/** Remove somente os bloqueios antigos criados por este script na linha. */
function desbloquearCamposResultado_(aba, linha) {
  const protecoes = obterProtecoesDivergenciaLinha_(aba, linha);
  protecoes.forEach((protecao) => protecao.remove());
  limparValidacoesBloqueioLinha_(aba, linha);
}


/** Remove também validações deixadas por uma execução interrompida. */
function limparValidacoesBloqueioLinha_(aba, linha) {
  [aba.getRange(linha, COLUNA_DATA),
    aba.getRange(linha, COLUNA_NOME, 1, COLUNA_FORMA_INGRESSO - COLUNA_NOME + 1)]
    .forEach((intervalo) => {
      intervalo.getDataValidations()[0].forEach((validacao, indice) => {
        if (validacao &&
            validacao.getCriteriaValues()[0] === "=FALSE" &&
            validacao.getHelpText() === TEXTO_VALIDACAO_BLOQUEIO) {
          intervalo.getCell(1, indice + 1).clearDataValidations();
        }
      });
    });
}


/** Limpa proteções legadas em todas as abas da planilha. */
function removerBloqueiosCrm() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  planilha.getSheets().forEach((aba) => {
    const linhas = new Set(
      aba.getProtections(SpreadsheetApp.ProtectionType.RANGE)
        .filter((protecao) =>
          (protecao.getDescription() || "").indexOf(
            `${PREFIXO_PROTECAO_DIVERGENCIA}:${aba.getSheetId()}:`
          ) === 0
        )
        .map((protecao) => protecao.getRange().getRow())
    );
    linhas.forEach((linha) => desbloquearCamposResultado_(aba, linha));
    for (let linha = LINHA_CABECALHO + 1; linha <= aba.getLastRow(); linha += 1) {
      if (!linhas.has(linha)) {
        limparValidacoesBloqueioLinha_(aba, linha);
      }
    }
  });
  planilha.toast("Bloqueios antigos do CRM removidos.", "CRM", 5);
}


/** Localiza somente as proteções de divergência da linha informada. */
function obterProtecoesDivergenciaLinha_(aba, linha) {
  return aba.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((protecao) => {
      const descricao = protecao.getDescription() || "";
      const intervaloProtegido = protecao.getRange();

      return descricao.indexOf(
        `${PREFIXO_PROTECAO_DIVERGENCIA}:${aba.getSheetId()}:`
      ) === 0 &&
        intervaloProtegido.getRow() === linha &&
        intervaloProtegido.getLastRow() === linha;
    });
}


function destacarLinhaErro_(aba, linha) {
  aba.getRange(linha, 1, 1, aba.getLastColumn())
    .setBackground("#FDECEC");
}


function limparDestaqueLinha_(aba, linha) {
  aba.getRange(linha, 1, 1, aba.getLastColumn())
    .setBackground(null);
}


function normalizarNumeroInscricao_(numero) {
  const normalizado = String(numero).replace(/\s+/g, "").toUpperCase();

  if (!normalizado) {
    throw new Error("Informe um numero de inscricao");
  }

  if (!PADRAO_INSCRICAO.test(normalizado)) {
    throw new Error("Formato invalido. Use CAN-000000-TRI");
  }

  return normalizado;
}


function somenteNumeros_(valor) {
  return String(valor || "").replace(/\D/g, "");
}


function obterTokenDasPropriedades_() {
  const credenciais = obterCredenciais_();
  return obterToken_(credenciais.usuario, credenciais.senha);
}


function obterCredenciais_() {
  const propriedades = PropertiesService.getScriptProperties();
  const usuario = propriedades.getProperty("CRM_USERNAME");
  const senha = propriedades.getProperty("CRM_PASSWORD");

  if (!usuario || !senha) {
    throw new Error(
      "Configure CRM_USERNAME e CRM_PASSWORD nas Propriedades do script."
    );
  }

  return { usuario, senha };
}


function obterToken_(usuario, senha) {
  const resposta = UrlFetchApp.fetch(`${CRM_BASE_URL}/api/token`, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "password",
      username: usuario,
      password: senha,
      authentication_type: CRM_AUTH_TYPE,
    },
    muteHttpExceptions: true,
  });

  validarRespostaHttp_(resposta, "autenticar no CRM");

  const conteudo = JSON.parse(resposta.getContentText());
  if (!conteudo.access_token) {
    throw new Error("O CRM nao retornou um token de acesso");
  }

  return conteudo.access_token;
}


function consultarCrm_(token, fetchXml) {
  const resposta = UrlFetchApp.fetch(CRM_SEARCH_URL, {
    method: "post",
    contentType: "application/xml; charset=utf-8",
    headers: {
      Authorization: `Bearer ${token}`,
      Pagina: "1",
    },
    payload: fetchXml,
    muteHttpExceptions: true,
  });

  validarRespostaHttp_(resposta, "consultar o CRM");

  const raiz = XmlService.parse(resposta.getContentText()).getRootElement();
  return raiz.getChildren("result");
}


function buscarPorNumero_(numeroInscricao, token) {
  const numeroXml = escaparXml_(numeroInscricao);
  const fetchInscricao = `
<fetch version="1.0" mapping="logical">
  <entity name="cad_inscricaocandidato">
    <attribute name="cad_numeroinscricao" />
    <attribute name="cad_clientepotencialid" />
    <attribute name="cad_ofertaid" />
    <attribute name="cad_concursoid" />
    <filter type="and">
      <condition attribute="cad_numeroinscricao" operator="eq" value="${numeroXml}" />
    </filter>
  </entity>
</fetch>`;

  const inscricoes = consultarCrm_(token, fetchInscricao);
  if (inscricoes.length === 0) {
    return null;
  }

  const inscricao = inscricoes[0];
  const leadId = identificadorCampo_(inscricao, "cad_clientepotencialid");

  if (!leadId) {
    throw new Error("Inscricao sem lead relacionado");
  }

  const leadIdXml = escaparXml_(leadId.replace(/[{}]/g, ""));
  const fetchLead = `
<fetch version="1.0" mapping="logical">
  <entity name="lead">
    <attribute name="fullname" />
    <attribute name="cad_cpf" />
    <attribute name="mobilephone" />
    <attribute name="telephone1" />
    <attribute name="cad_proprietariopro" />
    <filter type="and">
      <condition attribute="leadid" operator="eq" value="${leadIdXml}" />
    </filter>
  </entity>
</fetch>`;

  const leads = consultarCrm_(token, fetchLead);
  if (leads.length === 0) {
    throw new Error("Lead relacionado nao encontrado");
  }

  const lead = leads[0];
  const proprietario = textoCampo_(lead, "cad_proprietariopro");
  if (!proprietario) {
    throw new Error(MENSAGEM_PROPRIETARIO_VAZIO);
  }

  return {
    nome: textoCampo_(lead, "fullname"),
    celular:
      textoCampo_(lead, "mobilephone") || textoCampo_(lead, "telephone1"),
    cpf: textoCampo_(lead, "cad_cpf"),
    curso: textoCampo_(inscricao, "cad_ofertaid"),
    formaIngresso: limparFormaIngresso_(
      textoCampo_(inscricao, "cad_concursoid")
    ),
    proprietario,
  };
}


function normalizarTexto_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}


function limparFormaIngresso_(valor) {
  let formaIngresso = String(valor || "")
    .replace("Faculdade Serra Dourada", "")
    .trim();

  ["Altamira", "Canaã", "Itabirito", "Lorena"].forEach((unidade) => {
    formaIngresso = formaIngresso.replace(unidade, "");
  });

  return formaIngresso.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}


function textoCampo_(registro, nomeCampo) {
  const campo = registro.getChild(nomeCampo);
  if (!campo) {
    return "";
  }

  const nomeExibido = campo.getAttribute("name");
  return nomeExibido ? nomeExibido.getValue() : campo.getText().trim();
}


function identificadorCampo_(registro, nomeCampo) {
  const campo = registro.getChild(nomeCampo);
  return campo ? campo.getText().trim() : "";
}


function escaparXml_(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


function validarRespostaHttp_(resposta, operacao) {
  const status = resposta.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Falha ao ${operacao} (HTTP ${status})`);
  }
}
