# Teste local de sincronização

Execute `node experimentos/sincronizacao/servidor.mjs` na raiz do Atlas com Node.js 24 ou posterior. O servidor local usa SQLite e só aceita conexões neste computador.

1. Abra [Computador](http://127.0.0.1:4173/?dispositivo=computador) e [Celular](http://127.0.0.1:4173/?dispositivo=celular) em duas abas.
2. Na aba Celular, clique em **Simular sem conexão**. Marque um tópico com **Já estudei** e confira o Planejamento. O estudo fica salvo na aba Celular.
3. Clique em **Religar conexão**. O tópico aparece na outra aba em até alguns segundos.

As abas simulam dois dispositivos com progressos separados. O servidor guarda as operações no banco SQLite temporário do sistema. O teste compartilha uma agenda entre as duas abas e sincroniza os checks de matérias e tópicos e o histórico gerado por eles. Para testar com duas máquinas reais, seria necessário um servidor acessível por ambas e uma conta para separar o progresso de cada pessoa.
