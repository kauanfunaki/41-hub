# Slack — publicação e operação

## Comportamento

- Primeiro acesso: senha local obrigatória, depois tutorial concluído/pulado, depois aviso Slack. Admins pulam o tutorial.
- Fechar, Escape, clique fora ou Agora não: oculta o aviso na sessão de login, inclusive após recarregar a página.
- Não lembrar mais: checkbox; a preferência é salva por usuário ao fechar ou conectar. Ela continua válida em outros navegadores e novos logins.
- Conectar agora: inicia OAuth no workspace do bot. Meu Perfil mostra sucesso, cancelamento, erro ou conta já vinculada.
- Notificações: alterações do chamado, responsáveis, solicitantes adicionais, comentário público, anexo, solicitação de informações, aprovação/rejeição, pedido de reabertura e sua decisão.
- Destinatários: solicitante, solicitantes adicionais e responsáveis atuais; sem duplicatas, contas inativas, contas não vinculadas ou de outro workspace; nunca o autor da ação.
- Comentários internos não geram DM. Os envios são best effort, com timeout; falha no Slack não desfaz a operação no chamado. Não existe fila persistente de reenvio.
- Coordenadores acessam chamados; somente administradores podem ser atribuídos como responsáveis, conforme a regra existente.

## Antes da publicação

1. Use o app e workspace definitivos. Instale o bot com `chat:write`; mantenha `im:write` se houver abertura explícita de conversas no app existente. Habilite a aba Messages em App Home para ler as notificações.
2. Configure o fluxo OpenID com `openid profile email`, separado do fluxo de instalação do bot.
3. Cadastre no app exatamente `https://SEU_DOMINIO/api/users/me/slack/callback`.
4. Defina no servidor `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_BOT_TOKEN` (`xoxb-`) e `SLACK_REDIRECT_URI`. O Compose repassa essas variáveis do ambiente ou .env do host. O token `xapp-` não é utilizado pelo 41Hub.
5. Preserve a configuração existente de banco, sessão e Microsoft. Use HTTPS e `NODE_ENV=production` na publicação; o modo development contém login automático de administrador.

## Banco — aplicar antes do novo código

Faça backup e confira o banco de destino. A migração standalone `migrations/20261008_slack_notifications.sql` adiciona três colunas em users e um índice único, sem copiar usuários/dados de testes. Ela pode ser executada novamente.

Com o cliente PostgreSQL no host de publicação e DATABASE_URL apontando para o destino correto:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20261008_slack_notifications.sql
```

Se preferir uma ferramenta de administração de banco, execute o conteúdo completo do mesmo arquivo. O arquivo não é aplicado automaticamente na inicialização e não pertence a um journal de migrações Drizzle. O projeto atualmente utiliza db:push para mudanças gerais; para esta publicação aplique o SQL revisado, sem autorizar truncamento de tabelas.

Verificação:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
  AND column_name IN ('slack_user_id', 'slack_team_id', 'slack_connect_reminder_dismissed');

SELECT indexdef FROM pg_indexes
WHERE tablename = 'users' AND indexname = 'users_slack_user_id_unique';
```

Contas existentes começam desconectadas, com lembrete habilitado. Se trocar de workspace, seus usuários precisam conectar novamente; credenciais/identidades do workspace de testes não devem ser copiadas para produção.

## Código e GitHub

Inclua os arquivos do frontend e backend Slack, a coordenação do onboarding, shared/schema.ts, package.json, package-lock.json, script/build.ts, a migração, os testes, README, este runbook, docker-compose.yml, .gitignore, .dockerignore e .env.example.

Não inclua .env real, logs, executável cloudflared ou 41-hub-local-test-bot. Se .env ainda estiver rastreado, `git rm --cached -- .env` remove apenas o rastreamento e mantém o arquivo local. O próximo commit deve conter essa remoção. Isso não apaga credenciais do histórico: se credenciais reais já foram publicadas, substitua-as nos serviços correspondentes.

GitHub guarda o código; atualizar o repositório não aplica o SQL nem configura os segredos do servidor. Não foi identificado workflow GitHub Actions neste checkout.

Depois da migração e das variáveis, instale as dependências com `npm ci`, execute `npm run test:slack` e `npm run build`, e publique/reinicie o serviço pelo processo existente. Se a publicação usa este Compose:

```powershell
docker compose up -d --build hub
```

O projeto Bolt temporário não precisa rodar: o 41Hub envia notificações diretamente pela Web API. O Dockerfile mantém jose no bundle do backend, e .dockerignore exclui os arquivos locais sensíveis do contexto de build.

## Validação depois da publicação

1. Entrar com conta sem Slack: finalizar/pular tutorial e verificar que o aviso aparece somente depois dele. Em conta local com senha provisória, a senha vem primeiro.
2. Fechar sem marcar, recarregar e atualizar perfil: não reaparece. Sair/entrar novamente: reaparece.
3. Marcar Não lembrar mais e fechar: não reaparece em novo login/navegador. Confirmar que outra conta não herda essa preferência.
4. Conectar pelo workspace correto, cancelar e tentar workspace incorreto: verificar o retorno em Meu Perfil.
5. Com duas pessoas vinculadas, testar status, comentário público/interno, responsabilidade, solicitação de informações e decisões de reabertura. Apenas envolvidos diferentes do autor recebem DM.
6. Conferir logs `[slack]` para falhas de autenticação, escopos ou envio.

Para reverter o código, mantenha as colunas aditivas no banco. Desabilite a integração retirando as variáveis Slack do serviço e reinicie-o. Não é necessário excluir dados ou tabelas.
