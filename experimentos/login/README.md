# Login do Atlas — protótipo

Na raiz da branch `Feat/login`, com Python 3.11 ou superior, execute:

```sh
python experimentos/login/servidor.py
```

Abra **http://127.0.0.1:8080/** e clique em **Login** no menu lateral. Escolha **Criar conta**, informe e-mail e senha e volte ao Atlas. Feche o navegador, abra novamente o mesmo endereço e clique em **Minha conta**. A sessão dura até 365 dias no mesmo perfil. Sair da conta, limpar os cookies ou redefinir a senha encerra o acesso daquela sessão. O modo privado descarta seus cookies ao fechar.

## Recuperação

Saia, clique em **Esqueci a senha** e informe seu e-mail. No modo de demonstração, encontre a mensagem mais recente em `~/.atlas-login/emails` (no Windows, pasta `.atlas-login\emails` dentro da sua pasta de usuário). Abra o arquivo .eml, leia o código e informe o e-mail, o código e a nova senha no formulário do Atlas. O código expira em 10 minutos, aceita cinco tentativas e perde a validade após o uso ou a emissão de outro código. A redefinição encerra todas as sessões daquela conta.

Para entrega em uma caixa real, configure no ambiente do servidor `ATLAS_SMTP_HOST`, `ATLAS_SMTP_PORT` (padrão 587), `ATLAS_MAIL_FROM` e, se o provedor exigir autenticação, `ATLAS_SMTP_USER` e `ATLAS_SMTP_PASSWORD`. Use um remetente autorizado pelo provedor e um servidor compatível com STARTTLS. Reinicie o processo após configurar. Em caso de falha, o terminal informa o tipo de erro.

## Executar com Docker

Na raiz, com Docker Desktop em execução:

```sh
docker compose -f experimentos/login/compose.yaml up --build -d
```

Acesse o mesmo endereço. Use apenas uma forma de execução por vez, pois ambas usam a porta 8080. O volume `contas` guarda o SQLite e as mensagens de demonstração entre reinicializações. Para copiar as mensagens para seu computador:

```sh
docker compose -f experimentos/login/compose.yaml cp atlas:/dados/emails ./emails-demo
docker compose -f experimentos/login/compose.yaml down
```

## Como reproduzir e entender

1. **Interface.** O servidor abre o index existente e ativa o botão lateral para a rota `/conta`. O formulário em `conta.html` envia e-mail e senha ao servidor. Abrir o HTML diretamente ou pelo GitHub Pages permite usar o Atlas estático, mas o experimento exige o processo Python.
2. **Cadastro.** Em `servidor.py`, a rota `/cadastro` gera um salt aleatório e calcula o hash da senha com scrypt. O SQLite guarda e-mail, salt e hash na tabela `users`.
3. **Sessão.** Após autenticar, o servidor cria um token aleatório. O navegador recebe o token em um cookie HttpOnly persistente. A tabela `sessions` guarda o hash e o vencimento, permitindo reconhecer a sessão depois de reiniciar o navegador ou o servidor.
4. **Recuperação.** A rota `/recuperar` gera o código, guarda sua assinatura na tabela `resets` e envia a mensagem. A rota `/redefinir` confere o código, atualiza a senha e invalida código e sessões.
5. **Verificação.** Execute `python experimentos/login/testar.py`. O teste cria contas, cookies e mensagens em uma pasta temporária e reinicia o servidor para verificar a persistência. Usa a biblioteca padrão do Python.

O SQLite é específico deste experimento local. Ao entrar na mesma conta em dois navegadores, marcações, notas, treinos e planejamento são sincronizados a cada três segundos com a página visível. Na primeira abertura, é possível importar os dados antigos do navegador. Anexos continuam locais. A apresentação com banco em outro contêiner e o deploy na AWS são etapas posteriores.
