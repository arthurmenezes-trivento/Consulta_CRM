"""
CRM Educacional -> Power BI
Script refatorado (template)

Preencha a lista `atributos` e o dicionário `rename_columns`
com os valores do seu projeto.
"""

import time
import requests
import xmltodict
import pandas as pd

BASE_URL = "https://trivento.api.crmeducacional.com"
URL = f"{BASE_URL}/api/LocalizacaoAvancada"

USERNAME = "IntegraçãoCRM"
PASSWORD = "IntegraçãoCRM"
AUTH_TYPE = "APICRMEducacional"

atributos = [
    "cad_situacao",
    'cad_numeroinscricao',
    "cad_clientepotencialid",
    "crmeduc_data_aprovacao",
    "cad_datapagamento",
    "cad_situacaoavaliacao",
    "cad_situacao",
    "cad_ofertaid",
    "trivento_unidadedeensinotrivento",
    "cad_concursoid",
    "coc_situacaopagamento",
]

rename_columns = {
    "cad_situacao": "Situação Inscrição",
    "cad_clientepotencialid": "Nome Completo",
    'cad_numeroinscricao': 'Numero Inscricao',
    "crmeduc_data_aprovacao": "Data Aprovação",
    "cad_datapagamento": "Data de Pagamento",
    "cad_situacaoavaliacao": "Situação de Avaliação",
    "cad_situacao": "Situação Inscrição",
    "cad_ofertaid": "Curso ID",
    "trivento_unidadedeensinotrivento": "Unidade Inscrito",
    "cad_concursoid": "Forma de Ingresso",
    "coc_situacaopagamento": "Situação Pagamento",
}


def get_token(session):
    payload = {
        "grant_type": "password",
        "username": USERNAME,
        "password": PASSWORD,
        "authentication_type": AUTH_TYPE,
    }

    response = session.post(
        f"{BASE_URL}/api/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def create_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/xml",
    }


def create_fetch_xml(attributes):
    tags = "\n".join(
        f'<attribute name="{c}"/>' for c in attributes
    )

    return f"""
<fetch version="1.0" output-format="xml-platform" mapping="logical">
  <entity name="cad_inscricaocandidato">
    {tags}
    <order attribute="createdon" descending="true"/>
  </entity>
</fetch>
"""


def post_retry(session, *args, retries=3, **kwargs):
    for i in range(retries):
        try:
            r = session.post(*args, **kwargs)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == retries - 1:
                raise
            time.sleep(5)


def get_page(session, page, headers, body):
    headers = headers.copy()
    headers["Pagina"] = str(page)

    response = post_retry(
        session,
        URL,
        headers=headers,
        data=body.encode("utf-8"),
        timeout=60,
    )

    doc = xmltodict.parse(response.text)

    resultset = doc["resultset"]
    records = resultset["result"]

    if isinstance(records, dict):
        records = [records]

    return records, resultset["@morerecords"] == "1"


def get_all_records(session, headers, body):
    page = 1
    rows = []

    while True:
        records, more = get_page(session, page, headers, body)
        rows.extend(records)
        print(f"Página {page}: {len(records)} registros")

        if not more:
            break

        page += 1

    return rows


def flatten_value(value):
    if not isinstance(value, dict):
        return value

    if "@name" in value:
        return value["@name"]

    if "#text" in value:
        return value["#text"]

    return value


def flatten_record(record):
    return {
        k: flatten_value(v)
        for k, v in record.items()
    }


def load_inscricoes():

    with requests.Session() as session:

        token = get_token(session)
        headers = create_headers(token)
        body = create_fetch_xml(atributos)

        records = get_all_records(
            session,
            headers,
            body,
        )
    
    df = pd.DataFrame(
        flatten_record(r)
        for r in records
    )

    for col in ["'createdon'", "modifiedon"]:
        if col in df.columns:
            df[col] = pd.to_datetime(
                df[col],
                format="%d/%m/%Y %H:%M",
                errors="coerce",
            )

    df.rename(
        columns={
            k: v
            for k, v in rename_columns.items()
            if k in df.columns
        },
        inplace=True,
    )

    map = {
        "Faculdade Serra Dourada de " : "",
        "Faculdade Alis" : "Itabirito",
        " dos Carajás" : ""}
    
    df['Unidade Inscrito'] = df['Unidade Inscrito'].map(map)
    return df



