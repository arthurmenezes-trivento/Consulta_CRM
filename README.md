# Consulta de inscrições no CRM Educacional

O arquivo [`scripts/consulta_inscricao.gs`](scripts/consulta_inscricao.gs) é um script do Google Apps Script para uma planilha do Google Sheets. Ele consulta uma inscrição no CRM Educacional, confere se o consultor da planilha corresponde ao proprietário do lead no CRM e preenche os dados encontrados.

## Estrutura da planilha

A linha 1 contém os cabeçalhos. Os dados começam na linha 2.

| Coluna | Conteúdo | Origem |
| --- | --- | --- |
| A | CONSULTOR | Informado na planilha |
| B | DATA | Data da consulta bem-sucedida |
| C | Número de Inscrição | Informado na planilha; formato `CAN-000000-TRI` |
| D | NOME | Nome do lead no CRM |
| E | CELULAR | Celular do lead; usa o telefone alternativo quando o celular está vazio |
| F | CPF | CPF do lead, somente números |
| G | CURSO | Oferta vinculada à inscrição |
| H | FORMA DE INGRESSO | Concurso vinculado à inscrição, com o texto tratado pelo script |

O script consulta a inscrição pelo número, obtém o lead relacionado e lê o campo `cad_proprietariopro` (proprietário do lead). A consulta só preenche B e D:H quando esse proprietário corresponde ao consultor escolhido em A. A comparação ignora diferenças de maiúsculas, acentos e espaços repetidos.

## Configuração e uso

1. Coloque o conteúdo de `scripts/consulta_inscricao.gs` no projeto Apps Script vinculado à planilha e salve as alterações.
2. Nas **Propriedades do script** do projeto Apps Script, configure `CRM_USERNAME` e `CRM_PASSWORD` com as credenciais da API do CRM. Não coloque credenciais no código nem neste repositório.
3. Reabra a planilha para carregar o menu **CRM** e autorize o script quando solicitado.
4. Use **CRM → Ativar preenchimento automatico** uma vez para instalar o gatilho de edição. Ao editar a coluna A ou C, o script consulta novamente as linhas com número de inscrição preenchido. Também é possível usar **Consultar linha selecionada** ou **Consultar todas as inscricoes** no menu.

Se apagar o número da coluna C, o preenchimento automático limpa os resultados da linha. O script registra falhas em uma nota na célula C e destaca a linha em vermelho claro. Erros de proprietário ausente ou consultor divergente limpam os campos de resultado; outros erros de consulta podem deixar os valores anteriores visíveis, por isso confira a nota antes de usar os dados. O script atual não cria bloqueios de edição. A opção **CRM → Remover bloqueios antigos do CRM** remove proteções e validações criadas por versões anteriores deste script.

## Manutenção e diagnóstico de erros

Comece lendo a **nota na célula C** da linha afetada. Confira o número da inscrição, o consultor da coluna A e os dados da inscrição e do lead no CRM. Depois de corrigir a causa, edite A ou C ou use **Consultar linha selecionada** para consultar novamente.

| Mensagem ou situação | O que verificar e corrigir |
| --- | --- |
| `Formato invalido. Use CAN-000000-TRI` | Corrija o número em C para o formato exigido. |
| `Inscricao nao encontrada no CRM` | Confira o número em C e se a inscrição existe no CRM. |
| `Inscricao sem lead relacionado` ou `Lead relacionado nao encontrado` | Confira o vínculo entre a inscrição e o lead no CRM. |
| Lead sem proprietário | Preencha o campo de proprietário do lead no CRM e consulte novamente. |
| `O Consultor selecionado não corresponde ao proprietário no CRM` | Confira A, o proprietário do lead no CRM e o mapeamento `CONSULTOR_PROPRIETARIO` descrito abaixo. |
| Erro ao autenticar ou consultar, inclusive `HTTP 401` ou `HTTP 403` | Confira `CRM_USERNAME`, `CRM_PASSWORD`, as permissões da conta e o acesso à API. |
| Outro erro HTTP, resposta inesperada ou falha de XML | Confira a disponibilidade da API e se os endpoints ou campos retornados pelo CRM mudaram. Consulte os registros de execução do Apps Script para obter detalhes. |
| O preenchimento automático não ocorre | Confirme que o gatilho `aoEditarNumeroInscricao` foi instalado pelo menu e que o projeto Apps Script está vinculado à planilha correta. |

### Cadastrar um novo consultor

O objeto `CONSULTOR_PROPRIETARIO`, perto do início de `scripts/consulta_inscricao.gs`, relaciona o **nome exibido no campo de proprietário do lead no CRM** (chave) ao **nome escolhido na coluna A da planilha** (valor). Por exemplo:

```javascript
const CONSULTOR_PROPRIETARIO = {
  "Gabriel Matos": "Gabriel",
  "Nome completo exibido no CRM": "Nome usado na planilha",
};
```

Para cadastrar alguém:

1. Abra no CRM um lead cujo proprietário seja o novo consultor e copie exatamente o nome exibido no campo de proprietário. Não use o nome do aluno ou um nome presumido.
2. Confira como o consultor aparece na coluna A da planilha.
3. Adicione ao `CONSULTOR_PROPRIETARIO` uma entrada `"nome no CRM": "nome na planilha"`, mantendo a vírgula final e sem duplicar uma chave existente.
4. Salve a alteração no projeto Apps Script vinculado à planilha e consulte uma inscrição de teste desse consultor.

Quando um nome do CRM não está no objeto, o script compara diretamente o nome do CRM com o da coluna A. Portanto, a ausência de uma entrada só causa divergência se os nomes usados nos dois lugares forem diferentes. Se o CRM alterar a grafia do proprietário, atualize a chave correspondente. Se a planilha alterar o nome exibido do consultor, atualize o valor.

### Mudanças no CRM ou na planilha

- Se o endereço da API ou o tipo de autenticação mudar, revise `CRM_BASE_URL`, `CRM_SEARCH_URL` e `CRM_AUTH_TYPE`.
- Se o formato das inscrições mudar, revise `PADRAO_INSCRICAO` e a mensagem de formato inválido.
- Se nomes de entidades ou campos do CRM mudarem, revise as consultas XML em `buscarPorNumero_()` e a leitura dos resultados.
- Se a ordem das colunas da planilha mudar, revise as constantes `COLUNA_*` e a tabela acima.
- Se surgirem novos nomes de unidade ou uma nova forma de ingresso, revise `limparFormaIngresso_()`.

Após qualquer manutenção, salve o script no Apps Script e teste pelo menos uma inscrição válida e um caso de erro para verificar a nota, os dados preenchidos e a correspondência do consultor.
