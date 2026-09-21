cat << 'EOF' > README.md
# Bot Bradesco - Integrador Telegram & Freshdesk

Bot do Telegram desenvolvido em Node.js para automação e criação de tickets no Freshdesk referente às migrações e atendimentos em campo/remoto do Bradesco.

## 🚀 Funcionalidades
- `/bradesco [Junção]` - Criação de ticket para atendimento remoto.
- `/campo [Junção]` - Criação de ticket para atendimento em campo.
- `/fase2 [Junção]` - Criação de ticket para atendimento Fase 2.
- Consulta automatizada nas planilhas de dados (`.csv`).

## 🛠️ Tecnologias
- Node.js
- Telegraf (Telegram Bot API)
- Axios (Integrador Freshdesk API v2)
- CSV Parser
- Docker & Docker Compose
EOF
