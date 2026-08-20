/**
 * Consulta inscricoes no CRM Educacional e preenche a planilha ativa.
 *
 * Estrutura esperada:
 * A: Numero da inscricao
 * B: Nome
 * C: CPF
 * D: Unidade
 * E: Curso
 * F: Forma de ingresso
 * G: Status
 */

const CRM_BASE_URL = "https://trivento.api.crmeducacional.com";
const CRM_SEARCH_URL = `${CRM_BASE_URL}/api/LocalizacaoAvancada`;
const CRM_AUTH_TYPE = "APICRMEducacional";
const PADRAO_INSCRICAO = /^CAN-\d{6}-TRI$/;


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CRM")
    .addItem("Consultar inscricoes", "consultarInscricoes")
    .addToUi();
}


function consultarInscricoes() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getActiveSheet();
  const ultimaLinha = aba.getLastRow();

  aba.getRange(1, 1, 1, 7).setValues([[
    "Numero da inscricao",
    "Nome",
    "CPF",
    "Unidade",
    "Curso",
    "Forma de ingresso",
    "Status",
  ]]);

  if (ultimaLinha < 2) {
    planilha.toast("Insira ao menos uma inscricao na coluna A.", "CRM", 5);
    return;
  }

  const credenciais = obterCredenciais_();
  const token = obterToken_(credenciais.usuario, credenciais.senha);
  const entradas = aba.getRange(2, 1, ultimaLinha - 1, 1).getDisplayValues();
  const resultados = [];

  entradas.forEach(([entrada]) => {
    if (!String(entrada).trim()) {
      resultados.push(["", "", "", "", "", ""]);
      return;
    }

    try {
      const numero = normalizarNumeroInscricao_(entrada);
      const dados = buscarPorNumero_(numero, token);

      if (!dados) {
        resultados.push(["", "", "", "", "", "Inscricao nao encontrada"]);
        return;
      }

      resultados.push([
        dados.nome || "Nao informado",
        dados.cpf || "Nao informado",
        dados.unidade || "Nao informado",
        dados.curso || "Nao informado",
        dados.formaIngresso || "Nao informado",
        "OK",
      ]);
    } catch (erro) {
      resultados.push(["", "", "", "", "", erro.message || String(erro)]);
    }
  });

  aba.getRange(2, 2, resultados.length, 6).setValues(resultados);
  SpreadsheetApp.flush();
  planilha.toast("Consulta concluida.", "CRM", 5);
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
    <attribute name="crmeduc_unidade" />
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
  return {
    nome: textoCampo_(lead, "fullname"),
    cpf: textoCampo_(lead, "cad_cpf"),
    unidade: textoCampo_(lead, "crmeduc_unidade"),
    curso: textoCampo_(inscricao, "cad_ofertaid"),
    formaIngresso: textoCampo_(inscricao, "cad_concursoid"),
  };
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
