# Atlas de Estudos

[**Acessar o Atlas de Estudos**](https://gabrielherzer.github.io/atlas-de-estudos/)

Veja o [guia de contribuição](CONTRIBUTING.md) para criar branches, escrever commits e abrir pull requests.

Abra **index.html** no navegador para usar o Atlas. Todos os arquivos desta pasta precisam ficar juntos, incluindo a pasta **dados**. O funcionamento é offline, com acesso à internet necessário para abrir as fontes e provas externas.

## Onde editar

- **index.html** contém a estrutura da página, os botões de navegação e as janelas.
- **estilos.css** define cores, tamanhos, espaçamentos e a adaptação para celular. Procure um seletor como `.calendar-day` para encontrar as regras de um componente. Regras mais abaixo podem ajustar regras anteriores.
- **aplicativo.js** cria os cartões, responde aos cliques, calcula o progresso e controla o calendário. Os comentários indicam as principais partes.
- **dados/conteudos.js** guarda as matérias, os tópicos e os conteúdos do guia.
- **dados/vestibulares.js** guarda os recortes de provas, contagens e fontes.
- **simbolo.svg** é o símbolo usado no cabeçalho e na aba do navegador.

## Como as partes se conectam

O HTML carrega o CSS no começo da página. No final, carrega os dois arquivos de dados e depois o JavaScript do aplicativo. Essa ordem permite abrir o projeto diretamente pelo arquivo, sem servidor.

No JavaScript, `curriculum` representa o guia de conteúdos e `exams` representa os vestibulares. A função `node` cria elementos HTML. A função `save` salva o progresso no navegador. A função `changePage` escolhe a seção visível pelo endereço depois de `#`.

## Primeiro exercício

Abra **estilos.css**, procure `.calendar-day` e altere uma cor. Salve o arquivo e atualize a página no navegador. Depois, experimente mudar uma frase no **index.html**.

## Progresso da versão anterior

Antes de mudar para esta pasta, abra o Atlas anterior e use **Salvar backup**. Depois, abra **index.html** e use **Restaurar backup**. O navegador pode guardar o progresso separadamente conforme o caminho do arquivo.

Os identificadores `id` dos dados conectam os tópicos às marcações salvas. Mudar esses identificadores pode fazer as marcações anteriores deixarem de ser reconhecidas. Os PDFs e imagens anexados ficam no armazenamento do navegador e não são incluídos no backup JSON.

## Organização do código

Esta é uma separação dos arquivos da versão atual, com formatação e comentários para facilitar a leitura. Os estilos preservam a ordem de aplicação do projeto e ainda têm regras de ajustes posteriores. O aplicativo mantém a lógica em um arquivo, com funções identificadas por responsabilidade.

Esta pasta é uma versão editável independente. As alterações feitas aqui são aplicadas ao abrir este **index.html**.

## Registro de sessões em Python

O arquivo **atlas.py** contém o registro de sessões e tempo de estudo por matéria.

## Funcionalidades e prioridades

Roteiro proposto para evoluir o Atlas a partir do catálogo, do progresso local e da hospedagem estática já existentes. As fases indicam a ordem de entrega. **P0** é essencial para o piloto, **P1** vem logo após o piloto, **P2** depende dos resultados ou da infraestrutura e **P3** fica para expansão.

**Pontos** estimam esforço relativo de implementação, curadoria e validação. A escala é 1 e 2 para dificuldade baixa, 3 e 5 para média, 8 para alta e 13 para muito alta. Itens de 13 pontos devem ser divididos antes da execução.

### Produto e experiência de estudo

| Funcionalidade | Impacto | Dificuldade | Quando entregar | Pontos | Prioridade |
| --- | --- | --- | --- | ---: | --- |
| Catálogo e filtros por vestibular | Alto | Média | MVP. Revisar o recorte de Matemática para ENEM e Fuvest e testar filtros e busca. | 5 | P0 |
| Progresso por tópico | Alto | Baixa | MVP. Conferir persistência no navegador e preservar marcações ao trocar de prova. | 2 | P0 |
| Incidência com fontes | Alto | Alta | MVP. Mostrar edição, fase, fonte e cobertura da amostra para um recorte pequeno. | 8 | P0 |
| Piloto e feedback | Alto | Baixa | Fechamento do MVP. Testar com cinco estudantes durante sete dias. | 2 | P0 |
| Árvore de pré-requisitos | Alto | Média | Após o piloto. Validar um ramo na ficha do tópico e depois criar a visualização. | 5 | P1 |
| Revisões e estimativa de retenção | Médio | Média | Após registrar revisões e acertos. Começar com intervalos simples e faixas de revisão. | 5 | P1 |
| Planejador de estudos por regras | Alto | Média | Após validar prioridades e pré-requisitos. Gerar uma agenda editável que caiba no tempo disponível. | 5 | P1 |
| Conta e sincronização de progresso | Alto | Alta | Beta online, após validar a demanda e preparar API, banco e autenticação. Preservar os registros locais na primeira sincronização. | 8 | P2 |
| Planejador de estudos com IA | Alto potencial | Alta | Após validar o plano por regras. Oferecer ajustes sob demanda e conferir se cabem na agenda. | 8 | P2 |
| Banco de questões | Alto potencial | Muito alta | Expansão. Começar com links e gabaritos verificados e ampliar a classificação por tópico. | 13 | P3 |
| Simulados cronometrados | Médio | Alta | Expansão, após organizar questões e gabaritos do primeiro vestibular. | 8 | P3 |
| Resumos e materiais por tópico | Médio | Média | Expansão. Associar links e resumos aos tópicos antes de testar armazenamento de anexos. | 5 | P3 |

### Infraestrutura e operação

| Funcionalidade | Impacto | Dificuldade | Quando entregar | Pontos | Prioridade |
| --- | --- | --- | --- | ---: | --- |
| Hospedagem da versão estática | Alto | Baixa | MVP. Manter o GitHub Pages e conferir o acesso no celular e os caminhos dos arquivos. | 2 | P0 |
| CI e publicação | Alto | Média | MVP. Ampliar as verificações para validar dados do catálogo e links internos antes de publicar. | 3 | P0 |
| Servidor e API | Alto | Alta | Beta online, quando houver demanda por conta e sincronização. Subir primeiro em homologação. | 8 | P2 |
| Banco de dados relacional | Alto | Alta | Beta online, junto com a API. Versionar o esquema e testar a migração dos registros existentes. | 8 | P2 |
| Autenticação e controle de acesso | Alto | Alta | Beta online, antes de sincronizar dados reais. Verificar o isolamento dos dados por conta. | 8 | P2 |
| Docker e Docker Compose | Médio | Média | Beta online. Reproduzir API e banco no ambiente local antes de publicar o backend. | 5 | P2 |
| Backups e restauração | Alto | Média | Beta online, antes de receber dados reais. Testar restauração do banco em homologação. | 5 | P2 |
| Logs e monitoramento | Médio | Média | Beta online, junto com a publicação da API. Acompanhar disponibilidade e erros. | 3 | P2 |
| Domínio próprio, DNS e HTTPS | Médio | Baixa | Beta público. Configurar o endereço quando a publicação estiver estável e o domínio for escolhido. | 2 | P2 |
