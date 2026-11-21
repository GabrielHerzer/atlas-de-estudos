# Contribuindo com o Atlas

`main` reúne as versões prontas para entrega. `develop` reúne as mudanças da próxima versão.

1. Atualize sua cópia de `develop` com `git switch develop` e `git pull`.
2. Crie uma branch de trabalho, como `git switch -c feature/reagendar-estudo`.
3. Comece a mensagem do commit com `feat:`, `fix:`, `docs:` ou `chore:`, seguido de espaço e descrição.
4. Envie sua branch e abra um pull request para `develop`. Use um merge commit para preservar o histórico.
5. Quando a próxima versão estiver pronta, abra um pull request de `develop` para `main` e deixe-o aberto para a dupla verificação.

Antes do merge em `main`, o Codex revisa as mudanças, roda as verificações e apresenta o resultado ao Gabriel. O merge exige a aprovação explícita do Gabriel para a revisão apresentada e a aprovação das verificações do GitHub. Se houver mudanças depois da revisão, o Codex confere a nova versão e pede uma nova aprovação.

Use `feature/` para funcionalidades, `fix/` para correções, `docs/` para documentação, `refactor/` para reorganização, `test/` para testes e `chore/` para manutenção. Escreva o nome em minúsculas com hífens, como `fix/calendario-mobile`.

Correções urgentes também passam por `develop` e seguem a mesma revisão antes de chegar a `main`.

Exemplos de mensagens:

- `feat: adiciona opção de reagendar`
- `fix: corrige o cálculo de progresso`
- `docs: explica como abrir o Atlas`
- `chore: simplifica o padrão de commits`

O GitHub Actions confere o nome da branch e a primeira linha de cada commit novo no pull request.

Para validar também antes de criar o commit, ative o verificador local após clonar o repositório. Ele usa Python 3.

```sh
git config --local core.hooksPath .githooks
```
