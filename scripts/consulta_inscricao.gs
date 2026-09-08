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

const LINHA_CABECALHO = 1;
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
  const primeiraLinha = Math.max(intervalo.getRow(), LINHA_CABECALHO + 1);
  const ultimaLinha = intervalo.getLastRow();
  const colunaInicial = intervalo.getColumn();
  const colunaFinal = intervalo.getLastColumn();

  if (
    primeiraLinha > ultimaLinha ||
    COLUNA_INSCRICAO < colunaInicial ||
    COLUNA_INSCRICAO > colunaFinal
  ) {
    return;
  }

  const aba = intervalo.getSheet();
  const entradas = aba
    .getRange(primeiraLinha, COLUNA_INSCRICAO, ultimaLinha - primeiraLinha + 1, 1)
    .getDisplayValues();

  entradas.forEach(([numero], indice) => {
    if (!String(numero).trim()) {
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

  consultarEPreencherLinha_(aba, linha, numero, obterTokenDasPropriedades_());
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

  const token = obterTokenDasPropriedades_();
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
    const numero = normalizarNumeroInscricao_(entrada);
    const dados = buscarPorNumero_(numero, token);

    if (!dados) {
      limparResultadoLinha_(aba, linha);
      celulaInscricao.setValue(numero).setNote("Inscricao nao encontrada no CRM.");
      return;
    }

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
    limparResultadoLinha_(aba, linha);
    celulaInscricao.setNote(`Erro na consulta: ${erro.message || String(erro)}`);

    if ((erro.message || String(erro)) === MENSAGEM_PROPRIETARIO_VAZIO) {
      aba.getParent().toast(MENSAGEM_PROPRIETARIO_VAZIO, "CRM", 5);
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
    throw new Error(
      "O Lead referente a essa inscrição está sem proprietário. Favor preencher o campo proprietário Lead no CRM e tentar novamente"
    );
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
  };
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
