# Salgaderia: pedidos online e painel

Plataforma de pedidos para delivery e retirada, com duas interfaces:

- **Cardápio público** (`/`): o cliente navega por categorias, busca e personaliza itens com adicionais e observações. Depois finaliza com nome, WhatsApp e endereço e acompanha o status do pedido em `/pedido/<token>`.
- **Painel** (`/admin`): Kanban de pedidos, CRUD do cardápio, dashboard de vendas, gestão da equipe e configurações da loja.

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS v4 e [Neon](https://neon.com). O Neon fornece o Lakebase Postgres, acessado com `pg` em server actions e route handlers, e o Neon Auth (Better Auth gerenciado) para o login da equipe.

## Configuração

### 1. Projeto Neon

Pré-requisito: a [Neon CLI](https://neon.com/docs/cli/install) (`npm i -g neon`).

```bash
neon login                      # abre o navegador
neon init -y --org-id <org> --project-id <projeto> --branch production --services postgres,auth
neon deploy                     # ativa o Neon Auth e grava DATABASE_URL e NEON_AUTH_* no .env.local
```

O `neon.ts` declara os serviços do projeto (Postgres e Auth). O `.neon` guarda o projeto e o branch ligados e não vai para o git.

### 2. Variáveis de ambiente

O `neon deploy` grava `DATABASE_URL`, `DATABASE_URL_UNPOOLED` e `NEON_AUTH_BASE_URL` no `.env.local`. Acrescente à mão o segredo do cookie de sessão, com 32 caracteres ou mais:

```bash
node -e "console.log('NEON_AUTH_COOKIE_SECRET=' + require('crypto').randomBytes(32).toString('base64'))" >> .env.local
```

Veja `.env.example` para conferir o formato.

### 3. Banco, dados iniciais e primeiro gerente

```bash
npm install
npm run db:migrate                                              # cria as tabelas (db/schema.sql)
npm run seed                                                    # loja + cardápio de exemplo
npm run create-admin -- voce@email.com "senha-forte" "Seu Nome" # conta de gerente
```

No PowerShell, rode o `create-admin` em uma linha só e use aspas simples na senha se ela tiver `$`.

### 4. Rodar

```bash
npm run dev        # http://localhost:3000
npm run build
npm run lint
```

## Deploy (Vercel)

O app usa servidor (server actions, route handlers e cache), então **não funciona como export estático nem no GitHub Pages**.

1. **Repositório:** coloque esta pasta num repositório próprio no GitHub. Na Vercel, importe esse repositório; o framework Next.js é detectado sozinho.
2. **Variáveis de ambiente** (Production), copiando os valores do `.env.local`:
   - `DATABASE_URL`;
   - `NEON_AUTH_BASE_URL`;
   - `NEON_AUTH_COOKIE_SECRET`;
   - `NEXT_PUBLIC_SITE_URL` (opcional): o domínio próprio, usado na prévia do link, no `robots.txt` e no sitemap. Sem ele, vale o domínio de produção da Vercel.
3. **Domínio no Neon Auth:** cadastre o domínio do site como confiável. Sem isso, o login do painel falha.
   ```bash
   neon neon-auth domain add https://seu-dominio.vercel.app
   ```
4. **Cadastro de clientes:** **não** desligue o cadastro no Neon Auth, porque os clientes criam conta por ele. A equipe continua protegida: só quem está na tabela `staff` entra no painel.
5. **Loja:** no painel, em Loja, preencha:
   - o WhatsApp real;
   - o endereço;
   - os horários, as taxas e o agendamento.
6. **Pedidos de teste:** apague os que sobraram antes de divulgar o link.

O site já vem com:
- cabeçalhos de segurança (`next.config.ts`);
- `robots.txt`, que libera só o cardápio, e `sitemap.xml`;
- prévia do link para WhatsApp e Instagram (`public/brand/og.png`);
- páginas de erro e de "não encontrado" em português;
- `noindex` no painel.

## App Android do painel

O painel (`/admin`) também funciona como app Android. O projeto em `android/` é uma Trusted Web Activity (TWA): uma "casca" oficial do Google que abre `https://menu-salgaderia.vercel.app/admin` em tela cheia, usando o Chrome do aparelho. Não existe uma segunda base de código.

- **Atualizações:** cada deploy na Vercel já atualiza o app. Ao ser aberto, ele carrega a versão mais nova. Um painel que ficou aberto mostra o aviso "Nova versão do painel disponível", com o botão **Atualizar** (`src/components/admin/app-updates.tsx`).
- **Instalar:** mande o arquivo `android/Menu-Painel.apk` pelo WhatsApp ou pelo Drive e abra no celular. Quando o Android pedir, permita "instalar apps desconhecidos". O login é o mesmo do site.
- **Sem o APK:** no Chrome do Android, abra o painel e toque em "Instalar app". O painel tem um manifest próprio, `/admin.webmanifest`.

Peças no site:
- **Manifest e ícones:** `src/app/admin.webmanifest/route.ts` e `public/admin-icons/`. São só do painel; a loja não vira app.
- **Service worker:** `public/admin-sw.js`. Só mostra a tela "Sem conexão" e não guarda cache, então nunca serve uma versão velha.
- **Vínculo com o site:** `src/app/.well-known/assetlinks.json/route.ts` e `src/lib/android-app.ts` provam que o app pertence ao site. Sem isso, o app abre com a barra de endereço.
- **Versão do deploy:** `src/app/api/version/route.ts` e `src/lib/app-version.ts`, usadas no aviso de atualização.

### Quando gerar o APK de novo

Só quando mudar o nome, o ícone, as cores das barras ou o domínio. Nesses casos:
1. Ajuste `android/twa-manifest.json` e `android/app/build.gradle`. Aumente `appVersionCode` (por exemplo, 2) e `appVersion` (por exemplo, 1.0.1).
2. Na pasta do projeto, rode o script abaixo. Ele precisa do JDK 17 e do Android SDK (serve o do Android Studio). A senha da chave está em `android/keystore/LEIA-ME.txt`.
   ```powershell
   powershell -ExecutionPolicy Bypass -File android\build.ps1
   ```
3. Instale o novo APK por cima do antigo. Isso só funciona se ele for assinado com a mesma chave.

Se o domínio mudar (por exemplo, para um domínio próprio), troque `host` em `android/twa-manifest.json` e `hostName` em `android/app/build.gradle`. Depois, gere o APK de novo.

### A chave de assinatura

`android/keystore/menu-painel.keystore` assina o app e **fica fora do git**, na pasta do OneDrive. Guarde uma cópia da chave e da senha em lugar seguro.

Se a chave se perder:
1. Gere uma chave nova.
2. Troque a impressão SHA-256 em `src/lib/android-app.ts` e publique o site.
3. Desinstale o app antigo de cada aparelho e instale o novo.

Para ver a impressão SHA-256 da chave:
```bash
keytool -list -v -keystore android/keystore/menu-painel.keystore -alias painel
```

### Google Play (opcional)

O arquivo `android/app-release-bundle.aab` é o que vai para a Play Store.
1. Crie uma conta no Play Console (US$ 25, pagamento único) e um app com o pacote `com.menusalgaderia.painel`.
2. Publique em **Teste interno**, só para a equipe.
3. Em **Integridade do app**, copie a impressão SHA-256 da chave de assinatura do Google. Acrescente essa impressão em `ANDROID_APP.fingerprints`, em `src/lib/android-app.ts`. Sem isso, o app baixado da Play abre com a barra de endereço.

## Perfis de acesso (RBAC)

| Ação | Gerente | Funcionário |
|---|:-:|:-:|
| Pedidos (Kanban, mudar status, cancelar) | ✓ | ✓ |
| Cardápio (produtos, categorias, adicionais) | ✓ | ✓ |
| Estoque (itens, entradas, ajustes, histórico) | ✓ | ✓ |
| Dashboard e relatórios | ✓ | — |
| Equipe (criar, editar, desativar e excluir contas) | ✓ | — |
| Configurações da loja (aberta/fechada, taxa, mínimo) | ✓ | — |

As contas ficam no Neon Auth (schema `neon_auth`). O acesso ao painel vem da tabela `staff`, com as colunas `role` e `active`. Toda server action e todo route handler leem a sessão e conferem essa tabela a cada chamada.

Regras de acesso:

- Uma conta sem linha em `staff` não acessa nada. O cadastro público pelo app também está bloqueado (`/api/auth/sign-up`).
- Gerentes recebem o papel `admin` do Better Auth, necessário para criar e editar contas pela tela Equipe.
- Desativar uma conta faz um *ban* no Neon Auth, que bloqueia o login e encerra as sessões abertas.
- O sistema impede que um gerente remova o próprio acesso e que a loja fique sem nenhum gerente ativo.

## Como funciona

- **Criação de pedido** (`placeOrder` em `src/actions/orders.ts`): numa transação Postgres, recalcula todos os preços a partir do banco e ignora valores enviados pelo navegador. Valida adicionais (mínimo e máximo por grupo), disponibilidade, categoria ativa, loja aberta, pedido mínimo e troco. O número do pedido vem da sequência `order_code_seq`. A lógica pura está em `src/lib/order-logic.ts`.
- **Acompanhamento do cliente**: a página `/pedido/<token>` consulta `GET /api/track/<token>` a cada 5 segundos, enquanto a aba está visível. O token é aleatório e a resposta nunca inclui o telefone.
- **Kanban**: consulta `GET /api/orders` a cada 5 segundos (pedidos em aberto e os do dia). Toca um aviso sonoro em pedido novo e mostra a contagem no título da aba. Mudanças de status passam por `updateOrderStatus`, que valida a transição definida em `src/lib/order-status.ts`.
- **Cardápio público**: é lido no servidor e cacheado (`use cache`). O cache é invalidado na hora quando a equipe altera produtos ou a loja.
- **Histórico**: o pedido guarda nome, preço e adicionais de cada item (`orders.items`), então editar ou excluir produtos não altera pedidos antigos.
- **Fotos**: produtos e logo aceitam uma foto enviada do celular ou do computador, ou um link de imagem. Antes do envio, o navegador reduz a foto (no máximo 1200 px; logo, 512 px) e a converte para WebP. Ela fica na tabela `images` do Postgres e é servida por `GET /api/images/<id>` com cache imutável. As fotos que nenhum produto e nenhuma logo usam são apagadas sozinhas depois de 1 dia.
- **Estoque** (`/admin/estoque`): os itens do estoque têm categorias próprias (ex.: Salgados, Bebidas, Embalagens), que não aparecem no cardápio.
- **Horário automático** (Loja → Horário de funcionamento): no modo automático, a loja abre e fecha sozinha conforme os horários de cada dia (`store_settings.hours`, fuso de São Paulo). O switch do topo continua pausando tudo. A regra fica em `src/lib/hours.ts`, e o status aberto/fechado é calculado no navegador a cada minuto e conferido de novo no servidor ao criar o pedido.
- **Taxa por bairro** (Loja → Entrega): com bairros cadastrados (`delivery_zones`), o cliente escolhe o bairro e a taxa sai da lista. Um bairro fora dela paga a taxa padrão ou é recusado, conforme o switch "Entregar em outros bairros". A mesma função (`deliveryFeeFor`, em `src/lib/zones.ts`) calcula a prévia no checkout e o valor final no servidor.
- **Endereço, tempos e modos** (Loja): o endereço aparece no topo do cardápio, com link para o mapa, e para quem vai retirar. Os tempos estimados de entrega e de retirada (em minutos, "de/a") aparecem no cardápio, no checkout e no acompanhamento. Os switches "Fazer entregas" e "Aceitar retirada" ligam e desligam cada modo; o checkout mostra só os ativos e o `buildOrder` recusa o que estiver desligado.
- **Agendamento** (Loja → Agendamento): o cliente vê a agenda da loja no checkout, com os próximos dias (os dias fechados aparecem apagados) e os horários livres de 30 em 30 minutos. Ele marca o dia e o horário da retirada ou da entrega (`orders.scheduled_for`), mesmo com a loja fechada agora. Valem a antecedência mínima, o limite de dias e o horário de funcionamento (`scheduleDays` e `scheduleError`, em `src/lib/hours.ts`).
- **Reserva pelo cardápio e datas especiais:** com o agendamento ligado, o botão "Reservar para outro dia" abre a agenda direto no cardápio. O dia escolhido fica numa faixa no topo e vai pronto para o checkout (`src/lib/reservation-store.ts`).
  - A agenda destaca feriados e datas comemorativas (Natal, Páscoa, Dia das Mães, Carnaval…), calculados em `src/lib/special-dates.ts`.
  - As datas próprias da loja são cadastradas em Loja → Agendamento (tabela `special_dates`).
- **Contas de clientes** (`/conta`): o cliente cria conta com nome, WhatsApp, e-mail e senha (Neon Auth), e opcionalmente aniversário, como conheceu a loja e o aceite de ofertas (LGPD, com data), com o aceite da Política de Privacidade (`/privacidade`).
  - Logado, o checkout preenche os dados e oferece os endereços salvos; cada pedido fica ligado à conta (`orders.customer_user_id`).
  - Em "Meus pedidos" aparecem só os pedidos feitos com a conta, com "Pedir de novo".
  - A conta (`customer_accounts`) fica separada da base por telefone (`customers`): quem se cadastra com o número de outra pessoa não vê os pedidos dela.
- **Clientes no painel** (`/admin/clientes`, só gerente):
  - total gasto, pedidos, ticket médio, primeiro e último pedido e produto favorito;
  - os dados do cadastro, os endereços e o histórico;
  - anotações da equipe;
  - filtros (com/sem conta, aniversariantes do mês, aceitam ofertas, sumidos);
  - exportação em CSV;
  - "Redefinir senha", que gera uma senha temporária para o cliente que esqueceu a dele.
  - Com "Pedidos por horário" (`slot_capacity`), o horário cheio aparece como "Lotado". O `placeOrder` trava o horário (`pg_advisory_xact_lock`) e recusa quando ele lota.
  - A encomenda só baixa o estoque quando a loja aceita o pedido. Um produto esgotado hoje aparece como "Só por encomenda".
  - A página **Encomendas** do painel mostra os próximos dias e a lista de produção de cada dia.
- **Dashboard:**
  - indicadores com comparação ao período anterior;
  - fechamento de caixa por forma de pagamento, com o que falta receber e o troco a separar;
  - lucro bruto, com o custo dos itens do estoque registrado em cada movimentação (`unit_cost`) e a margem por produto;
  - mapa de horários de pico;
  - tempos de atendimento e cancelamentos;
  - clientes novos, recorrentes e sumidos, com botão de WhatsApp;
  - entregas por bairro.
  - **Vínculos:** no formulário do produto, a seção "Estoque" define o que cada unidade vendida baixa. Um produto pode baixar vários itens, e vários produtos podem usar o mesmo item. Exemplo: o "Combo lanche" baixa 2 Coxinhas. Uma opção de adicional também pode baixar um item (ícone de caixa na linha da opção). Os vínculos ficam na tabela `stock_links`. Um produto sem vínculo vende sem limite.
  - **Baixa:** acontece no `placeOrder`, na mesma transação do pedido. As linhas do estoque ficam travadas (`for update`) para que dois clientes não comprem a última unidade. Se faltar estoque, o pedido é recusado com aviso ("Só restam N de …").
  - **Cancelamento:** cancelar devolve exatamente o que o pedido baixou, com base em `stock_movements`. Reabrir baixa de novo e é recusado se faltar estoque.
  - **Esgotado automático:** a vitrine mostra "Esgotado" quando o estoque não cobre uma unidade. Uma opção de adicional sem estoque some da lista.
  - **Movimentações:** toda mudança de quantidade (venda, cancelamento, entrada, ajuste) fica registrada em `stock_movements`, com o usuário e a observação. O dashboard mostra um alerta quando há itens no estoque mínimo ou abaixo dele.

## Estrutura

```
neon.ts            serviços Neon do projeto (Postgres + Auth)
db/schema.sql      tabelas, índices e sequência (idempotente)
scripts/           migrate, seed e create-admin (leem o .env.local)
src/
  proxy.ts         redireciona /admin para o login quando não há sessão
  app/
    (store)/       cardápio, checkout e acompanhamento do pedido
    admin/         login e painel (dashboard, pedidos, cardápio, equipe, loja)
    api/           auth (proxy do Neon Auth), orders (Kanban), track (cliente)
  actions/         server actions: login, pedidos, cardápio, loja, equipe, dashboard
  components/
    ui/            design system: botão, campos, sheet/dialog, switch, badges…
    store/         componentes do cardápio público
    admin/         componentes do painel
  lib/
    db.ts          pool do Postgres (só servidor)
    neon-auth.ts   instância do Neon Auth (só servidor)
    auth.ts        requireStaff / requireAdmin
    order-logic.ts regras de preço e validação do pedido
```

## Design system

Os tokens ficam em `src/app/globals.css`:

- escala de marca lilás (`brand-50…950`);
- neutros;
- cores semânticas (`primary`, `surface`, `muted-foreground`, `danger`…);
- tons de status.

Cada token tem valor próprio para o tema claro e o escuro, e os componentes usam só esses tokens. O botão no topo de cada tela alterna o tema entre claro, escuro e o do sistema.

## Limitações conhecidas

- `placeOrder` é público: qualquer pessoa com o link pode pedir. Se houver abuso, adicione limite de requisições (por exemplo, Upstash Ratelimit) ou o Firewall da Vercel.
- As atualizações chegam por consulta periódica (5 s), não por push. Para tempo real instantâneo, o caminho é o [Neon Realtime](https://neon.com/docs/realtime/overview), hoje em beta e só em algumas regiões.
- O endpoint de cadastro do Neon Auth continua aberto fora do app. Contas criadas por ali não têm linha em `staff` e não acessam nada. Para fechá-lo de vez, rode `neon neon-auth config email-password update --disable-sign-up true` depois de criar o primeiro gerente. A criação de contas pelo painel usa a API de admin e continua funcionando.
