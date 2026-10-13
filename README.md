# Iara Curtidas — projeto inicial

Site responsivo para Android/Chrome, backend Node.js, catálogo de serviços, pedidos, integração preparada para Pix do Mercado Pago e WhatsApp Cloud API oficial.

A Iara vende **serviços de conteúdo, planejamento e divulgação/campanhas legítimas**. Ela não automatiza curtidas, não vende interação falsa e não promete números garantidos.

## Requisitos
- Node.js 20+
- Hospedagem com HTTPS e armazenamento persistente
- Conta Meta for Developers e WhatsApp Cloud API
- Conta Mercado Pago com credenciais Pix
- Configure `.env` com base no `.env.example`

## Rodar localmente
1. Instale Node.js 20+.
2. Extraia o ZIP.
3. No terminal, abra a pasta e execute `npm install`.
4. Copie `.env.example` para `.env` e configure as variáveis.
5. Execute `npm start` e abra `http://localhost:3000`.

Sem credenciais, o site abre e registra pedidos, mas não cria cobrança Pix real nem envia WhatsApp.

## Android: opção simples
O jeito mais simples é editar e publicar pelo celular usando um host com editor web ou um serviço de deploy que conecte a um repositório Git. Um backend Node.js não roda como site estático puro; precisa de um host que execute Node e mantenha o arquivo SQLite persistente.
1. Baixe o ZIP no Android e extraia com o gerenciador de arquivos.
2. Faça upload dos arquivos para um repositório Git privado usando a interface web do seu provedor.
3. Crie um serviço web Node.js em um host compatível (ex.: Render/Railway/VPS). Build: `npm install`; Start: `npm start`.
4. Configure as variáveis do `.env.example` no painel do host; não suba `.env` para Git.
5. Ative HTTPS e armazenamento persistente para `iara.sqlite`.
6. Teste `/api/health` e depois faça um pedido de teste.

Se preferir usar terminal no Android, Termux pode ser usado para testes locais, mas a disponibilidade de dependências nativas como `better-sqlite3` varia; para publicar para clientes, prefira hospedagem Node com armazenamento persistente.

## WhatsApp Cloud API
1. Crie um app no Meta for Developers e adicione WhatsApp.
2. Configure token, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`.
3. Configure callback `https://SEU-DOMINIO/webhooks/whatsapp`, inscrevendo o campo `messages`.
4. Configure `BASE_URL` para o domínio HTTPS.
5. Respeite opt-in, templates aprovados e as regras de janela de atendimento da Meta. O token deve ficar somente no backend.

## Mercado Pago Pix
1. Obtenha credenciais de teste primeiro.
2. Defina `MERCADOPAGO_ACCESS_TOKEN` e `BASE_URL`.
3. Configure notificação para `https://SEU-DOMINIO/webhooks/mercadopago`.
4. Faça um pagamento de teste ponta a ponta. A notificação consulta o pagamento na API e compara valor e referência antes de marcar como pago.
5. Antes de produção, confira a documentação vigente do Mercado Pago para validação de assinatura das notificações, campos obrigatórios e requisitos da conta.

## Personalizar
- Edite textos e preços em `src/server.js` e `public/index.html`.
- Configure `BUSINESS_WHATSAPP` no `.env`.
- Acrescente termos, política de privacidade, política de reembolso e contato de suporte antes de vender.
- O endpoint `/api/campaigns` guarda rascunhos de campanhas; não publica anúncios automaticamente nem cobra orçamento de anúncios.
- Adicione autenticação administrativa antes de criar painel interno; o projeto inicial não inclui um painel de administração.
- Para produção, configure backups, monitoramento, controle de acesso e processo de exclusão de dados.
