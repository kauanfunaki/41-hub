# 41 Hub

## 🎯 Visão Geral

O 41 Hub é uma solução de portal corporativo desenvolvida para centralizar o ecossistema de ferramentas internas de uma organização. O sistema resolve a fragmentação de acesso a aplicações e dados, atuando como um *Single Point of Entry* (Ponto Único de Entrada).

O diferencial arquitetural do projeto reside no seu sistema robusto de **RBAC (Role-Based Access Control)**, garantindo que a visibilidade de aplicativos e dashboards analíticos seja dinamicamente renderizada com base no Time (Squad) e Cargo (Role) do colaborador autenticado.

## ✨ Funcionalidades Key

### 🛡️ Gestão de Identidade e Acesso
* **Segregação Lógica de Dados:** Estrutura de banco de dados relacional desenhada para isolar contextos de times.
* **Permissões Granulares:** O *Frontend* reage às *Claims* do usuário, ocultando ou exibindo módulos sensíveis.

### 📊 Dashboards e Analytics
* Visualização de dados integrada diretamente no portal.

### 🎨 UX/UI e Personalização
* **Theme Engine:** Suporte nativo a temas (Dark/Light Mode) persistidos via **LocalStorage**.
* **Gestão de Perfil:** Upload e crop de imagem de perfil com armazenamento em **Pasta local**.

### 🤝 Integração de Comunicação (WhatsApp)
* **Direct Connect:** Funcionalidade que mapeia o número corporativo do colaborador e gera *Deep Links* dinâmicos (`wa.me`).
* Permite iniciar conversas de trabalho com um clique, sem necessidade de salvar contatos na agenda pessoal, agilizando a comunicação intra-equipes.

## 💻 Tech Stack

A arquitetura foi pensada para escalabilidade e manutenção:

**Frontend:**
* **Core:** React.js com TypeScript / Vite
* **Estilização:** Tailwind CSS

**Backend:**
* **API:** Node.js (Express)
* **Database:** PostgreSQL

**DevOps & Tools:**
* **Controle de Versão:** Git & GitHub
* **Containerização:** Docker

## 🔔 Notificações de chamados no Slack

Os usuários podem vincular voluntariamente suas contas no menu **Meu Perfil**. Quando uma alteração pública é feita em um chamado, o 41 Hub envia uma mensagem direta pelo bot para o solicitante, solicitantes adicionais e responsáveis vinculados, exceto para a pessoa que realizou a alteração.

Configure um Slack App com dois fluxos separados:

1. **Sign in with Slack (OpenID Connect):** adicione os escopos `openid`, `profile` e `email` e cadastre a URL de retorno.
2. **Bot do workspace:** instale o app no workspace com os escopos `chat:write` e `im:write`, gerando o bot token.

Defina as variáveis abaixo somente no ambiente onde o sistema for executado:

```env
SLACK_CLIENT_ID=<client-id-do-app>
SLACK_CLIENT_SECRET=<client-secret-do-app>
SLACK_REDIRECT_URI=https://seu-dominio/api/users/me/slack/callback
SLACK_BOT_TOKEN=xoxb-...
```

Para desenvolvimento local, use uma URL HTTPS pública temporária (por exemplo, um túnel) como `SLACK_REDIRECT_URI`; ela deve ser exatamente igual à URL cadastrada no painel do Slack.

O bot token determina o workspace permitido. O retorno OAuth valida assinatura, expiração, audiência, nonce e workspace. As notificações não dependem do projeto Bolt de testes nem de Socket Mode.

O primeiro acesso segue a ordem **troca de senha local obrigatória → tutorial → aviso Slack**. Administradores pulam o tutorial. Fechar o aviso o oculta até o próximo login; marcar **Não lembrar mais** grava a escolha na conta. É possível conectar ou desconectar depois em Meu Perfil.

Consulte [o runbook de publicação do Slack](docs/RUNBOOK_SLACK.md) para migração do banco, variáveis, publicação e validação. Testes isolados: `npm run test:slack` (sem mensagens reais ou acesso ao banco).

## 🗄️ Modelagem de Dados (Resumo)

O sistema baseia-se em três entidades principais para o controle de acesso:
1.  **Users:** Dados cadastrais e preferências.
2.  **Roles:** Definição de níveis de acesso (Admin, Coordenador, Usuário).
3.  **Squads:** Agrupamento lógico de times para distribuição de Dashboards e aplicativos.
