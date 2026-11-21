# Atlas de Estudos

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
