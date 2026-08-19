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
    "cad_inscricaoatual",
    "cad_cpf",
    "trivento_tabulacaojafoirealizada",
    "crmeduc_ultimatabulacao",
    "fullname",
    "firstname",
    "lastname",
    "emailaddress1",
    "mobilephone",
    "telephone1",
    "leadid",
    "createdon",
    # "address1_city",
    # "address1_composite",
    # "address1_country",
    # "address1_county",
    # "address1_line1",
    # "address1_line2",
    # "address1_line3",
    # "address1_postalcode",
    # "address1_stateorprovince",


    "cad_nacionalidade",
    "cad_orgaoexpedidor",
    "cad_rg",

    "crmeduc_unidadeform",
    "crmeduc_detalhamentotabulacao",
    "crmeduc_idade",

    # "cad_dataaceitelgpd",
    # "cad_dataalteracaocadastrooferta",

    "cad_concursoatual",
    "cad_concursodeorigem",
    "cad_datanascimento",
    "cad_inscricaoatual",
    "cad_ofertaatual",
    "cad_situacaofunil",

    "cad_corraca",
    "cad_origemleadid",
    "cad_proprietariopro",

    "crmeduc_canal",
    "crmeduc_unidade",
    "crmeduc_tabulacaodolead",

    # "leadsourcecode",
    "new_sexo",
    "trivento_linhadenegociostrivento",

    "cad_estadocivil",

    # "cad_campaigncontent",
    # "cad_campaignmedium",
    # "cad_campaignname",
    # "cad_campaignsource",
    # "cad_campaignterm",
]

rename_columns = {
    "cad_inscricaoatual": "Inscrição Atual",
    "cad_cpf" : "cpf",
    "trivento_tabulacaojafoirealizada": "Tabulação Realizada",
    "crmeduc_ultimatabulacao": "Última Tabulação",
    "fullname": "Nome Completo",
    "firstname": "Nome",
    "lastname": "Sobrenome",
    "emailaddress1": "Email",
    "mobilephone": "Celular",
    "telephone1": "Telefone",
    "leadid": "ID Lead",
    "createdon": "Data Criação",
    "address1_city": "Cidade",
    "address1_composite": "Endereço Completo",
    "address1_country": "País",
    "address1_county": "Bairro",
    "address1_line1": "Endereço",
    "address1_line2": "Número",
    "address1_line3": "Complemento",
    "address1_postalcode": "CEP",
    "address1_stateorprovince": "UF",
    "cad_nacionalidade": "Nacionalidade",
    "cad_orgaoexpedidor": "Órgão Expedidor",
    "cad_rg": "RG",
    "crmeduc_unidadeform": "Unidade Form",
    "crmeduc_detalhamentotabulacao": "Detalhamento Tabulação",
    "crmeduc_idade": "Idade",
    "cad_dataaceitelgpd": "Data Aceite LGPD",
    "cad_dataalteracaocadastrooferta": "Data Alteração Cadastro Oferta",
    "cad_concursoatual": "Concurso Atual",
    "cad_concursodeorigem": "Concurso de Origem",
    "cad_datanascimento": "Data Nascimento",
    "cad_ofertaatual": "Oferta Atual",
    "cad_situacaofunil": "Situação Funil",
    "cad_corraca": "Cor/Raça",
    "cad_origemleadid": "Origem Lead",
    "cad_proprietariopro": "Proprietário",
    "crmeduc_canal": "Canal",
    "crmeduc_unidade": "Unidade Lead",
    "crmeduc_tabulacaodolead": "Tabulação Lead",
    "leadsourcecode": "Origem",
    "new_sexo": "Sexo",
    "trivento_linhadenegociostrivento": "Linha de Negócio",
    "cad_estadocivil": "Estado Civil",
    "cad_campaigncontent": "Campaign Content",
    "cad_campaignmedium": "Campaign Medium",
    "cad_campaignname": "Campaign Name",
    "cad_campaignsource": "Campaign Source",
    "cad_campaignterm": "Campaign Term",
    "address1_addressid": "ID Endereço 1",
    "cad_browser": "Browser",
    "address2_addressid": "ID Endereço 2"
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
  <entity name="lead">
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


def load_leads():

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

    for col in ["createdon", "cad_datanascimento"]:
        if col in df.columns:
            df[col] = pd.to_datetime(
                df[col],
                format="%d/%m/%Y",
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

    return df



