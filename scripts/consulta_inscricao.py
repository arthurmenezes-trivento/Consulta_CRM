"""Consulta uma inscricao e os dados do lead relacionado no CRM Educacional."""

import re
import sys
from xml.sax.saxutils import escape

import requests
import xmltodict

from crm_inscricoes import BASE_URL, AUTH_TYPE, PASSWORD, USERNAME


SEARCH_URL = f"{BASE_URL}/api/LocalizacaoAvancada"
PADRAO_INSCRICAO = re.compile(r"CAN-\d{6}-TRI")


def normalizar_numero_inscricao(numero):
    """Remove espacos, converte para maiusculas e valida o formato esperado."""
    numero_normalizado = re.sub(r"\s+", "", numero).upper()

    if not numero_normalizado:
        raise ValueError("Informe um numero de inscricao.")

    if not PADRAO_INSCRICAO.fullmatch(numero_normalizado):
        raise ValueError(
            "Numero de inscricao invalido. Use o formato CAN-000000-TRI."
        )

    return numero_normalizado


def obter_token(session):
    response = session.post(
        f"{BASE_URL}/api/token",
        data={
            "grant_type": "password",
            "username": USERNAME,
            "password": PASSWORD,
            "authentication_type": AUTH_TYPE,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def consultar(session, token, fetch_xml):
    response = session.post(
        SEARCH_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/xml",
            "Pagina": "1",
        },
        data=fetch_xml.encode("utf-8"),
        timeout=60,
    )
    response.raise_for_status()

    resultset = xmltodict.parse(response.text).get("resultset", {})
    registros = resultset.get("result", [])

    if isinstance(registros, dict):
        return [registros]
    return registros or []


def texto(campo):
    """Retorna o nome exibido de lookups ou o valor simples do campo."""
    if isinstance(campo, dict):
        return campo.get("@name") or campo.get("#text")
    return campo


def identificador(campo):
    """Retorna o GUID armazenado em um campo lookup."""
    if isinstance(campo, dict):
        return campo.get("#text")
    return campo


def buscar_por_numero(numero_inscricao):
    numero_xml = escape(numero_inscricao, {'"': "&quot;"})

    fetch_inscricao = f"""
<fetch version="1.0" mapping="logical">
  <entity name="cad_inscricaocandidato">
    <attribute name="cad_numeroinscricao" />
    <attribute name="cad_clientepotencialid" />
    <attribute name="cad_ofertaid" />
    <attribute name="cad_concursoid" />
    <filter type="and">
      <condition attribute="cad_numeroinscricao" operator="eq" value="{numero_xml}" />
    </filter>
  </entity>
</fetch>
"""

    with requests.Session() as session:
        token = obter_token(session)
        inscricoes = consultar(session, token, fetch_inscricao)

        if not inscricoes:
            return None

        inscricao = inscricoes[0]
        lead_id = identificador(inscricao.get("cad_clientepotencialid"))
        if not lead_id:
            raise ValueError("A inscricao foi encontrada, mas nao possui um lead relacionado.")

        lead_id_xml = escape(str(lead_id).strip("{}"), {'"': "&quot;"})
        fetch_lead = f"""
<fetch version="1.0" mapping="logical">
  <entity name="lead">
    <attribute name="fullname" />
    <attribute name="cad_cpf" />
    <attribute name="crmeduc_unidade" />
    <filter type="and">
      <condition attribute="leadid" operator="eq" value="{lead_id_xml}" />
    </filter>
  </entity>
</fetch>
"""
        leads = consultar(session, token, fetch_lead)

    if not leads:
        raise ValueError("O lead relacionado a inscricao nao foi encontrado.")

    lead = leads[0]
    return {
        "Numero da inscricao": texto(inscricao.get("cad_numeroinscricao")),
        "Nome": texto(lead.get("fullname")),
        "CPF": texto(lead.get("cad_cpf")),
        "Unidade": texto(lead.get("crmeduc_unidade")),
        "Curso": texto(inscricao.get("cad_ofertaid")),
        "Forma de ingresso": texto(inscricao.get("cad_concursoid")),
    }


def main():
    entrada = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Numero da inscricao: ")

    try:
        numero = normalizar_numero_inscricao(entrada)
    except ValueError as erro:
        print(f"Erro: {erro}", file=sys.stderr)
        return 1

    try:
        dados = buscar_por_numero(numero)
    except (requests.RequestException, KeyError, ValueError) as erro:
        print(f"Erro ao consultar o CRM: {erro}", file=sys.stderr)
        return 1

    if dados is None:
        print(f'Nenhuma inscricao encontrada para "{numero}".')
        return 1

    print("\nDados encontrados")
    print("-" * 40)
    for rotulo, valor in dados.items():
        print(f"{rotulo}: {valor or 'Nao informado'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
