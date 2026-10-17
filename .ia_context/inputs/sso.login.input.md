# Spec: m4-04.5 — SSO via Keycloak com Lazy Account Linking

## Contexto

A milestone **m4** já entregou login local completo (email/senha + verificação + reset), login direto via Google e GitHub, histórico de batalhas e inventário de unidades. O m4-04.5 **substitui os IdPs diretos por SSO via Keycloak** e adiciona vinculação automática de contas por e-mail verificado, com notificação ao usuário. Também introduz o botão "Apagar conta" e prepara o terreno para o m4-05 (política de privacidade).

## Decisões arquiteturais

### D1 — Keycloak substitui Google/GitHub direto

Os botões "Login com Google" e "Login com GitHub" na SPA são **removidos**. O Keycloak (em `sso.my-url.dev.br`, realm `homelab`) faz o brokering para Google/GitHub. A tela de login da SPA passa a ter apenas:

- Login local (email/senha) — mantido, sem alteração
- **"Login com SSO"** — novo, redireciona ao Keycloak

Os botões de provedor (Google, GitHub) aparecem na tela do Keycloak, não na SPA.

### D2 — Padrão SPA + Resource Server

- SPA faz o dance OAuth (Public + PKCE `S256`) com o Keycloak
- Backend NestJS valida o JWT via JWKS (lib `jose`)
- Nenhuma sessão server-side para SSO; o backend só emite um JWT local curto após validar o do Keycloak (para reutilizar a auth existente)

### D3 — Lazy linking por e-mail verificado

- No primeiro SSO, backend busca `identities` por `(keycloak, sub)`
- Se não achar, exige `email_verified === true` no token antes de prosseguir
- Se `email_verified`, busca `users` por e-mail
- **Achou** → cria vínculo + envia e-mail de notificação
- **Não achou** → cria user novo (sem senha) + vínculo (sem notificação)

### D4 — Preservar o login local

- O fluxo local (email/senha, verificação, reset) **não muda**
- Usuários criados via SSO nascem com `password_hash = NULL`
- Eles podem usar "esqueci a senha" para definir uma senha posteriormente

## Backend (NestJS)

### B1 — Migration: tabela `identities`

```sql
CREATE TABLE identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,              -- 'keycloak'
  provider_user_id VARCHAR(255) NOT NULL,     -- claim 'sub' do Keycloak
  email_at_provider VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_identities_user_id ON identities(user_id);
CREATE INDEX idx_identities_email ON identities(email_at_provider);
```

### B2 — Migration: remover colunas legadas

- Dropar `users.google_id` e `users.github_id` (se existirem em produção, migrar antes: para cada user com `google_id IS NOT NULL`, criar identity `(provider='google', provider_user_id=<google_id>)` **antes** de dropar — isso preserva histórico, mas **não** é usado no lookup SSO; o lookup SSO é sempre por `(keycloak, sub)`)
- Se não houver usuários em produção (estado atual relatado), simplesmente dropar as colunas

### B3 — `JwtAuthGuard` (validação do token do Keycloak)

**Arquivo**: `src/auth/sso/jwt-auth.guard.ts`

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL(process.env.KC_JWKS_URL));

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing_token');
    try {
      const { payload } = await jwtVerify(header.slice(7), JWKS, {
        issuer: process.env.KC_ISSUER,
        audience: process.env.KC_AUDIENCE,
        clockTolerance: 30,
      });
      req.keycloakUser = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException({ error: 'invalid_token', detail: err.message });
    }
  }
}
```

Env necessárias:

```env
KC_URL=https://sso.my-url.dev.br
KC_REALM=homelab
KC_AUDIENCE=eldritch-alley
KC_JWKS_URL=${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/certs
KC_ISSUER=${KC_URL}/realms/${KC_REALM}
```

### B4 — `SsoLinkingService`

**Arquivo**: `src/auth/sso/sso-linking.service.ts`

```ts
async resolveOrLink(payload: KeycloakPayload): Promise<User> {
  // 1) Vínculo existente
  const identity = await this.identities.findOne({
    where: { provider: 'keycloak', providerUserId: payload.sub },
    relations: ['user'],
  });
  if (identity) return identity.user;

  // 2) Email precisa estar verificado
  if (payload.email_verified !== true) {
    throw new UnauthorizedException({ error: 'email_not_verified' });
  }

  // 3) Match por email
  const existing = await this.users.findOne({ where: { email: payload.email } });
  if (existing) {
    await this.identities.insert({
      userId: existing.id,
      provider: 'keycloak',
      providerUserId: payload.sub,
      emailAtProvider: payload.email,
    });
    await this.mailer.sendAccountLinkedEmail(existing, 'SSO (Keycloak)');
    return existing;
  }

  // 4) Novo usuário SSO-only
  const user = await this.users.insert({
    email: payload.email,
    emailVerified: true,
    passwordHash: null,
    displayName: payload.name ?? payload.preferred_username,
  });
  await this.identities.insert({
    userId: user.id,
    provider: 'keycloak',
    providerUserId: payload.sub,
    emailAtProvider: payload.email,
  });
  return user;
}
```

### B5 — Endpoint `POST /auth/sso/exchange`

**Arquivo**: `src/auth/sso/sso.controller.ts`

- Body: `{ access_token: string }`
- Valida via `JwtAuthGuard` (ou validação inline antes de chamar o service)
- Chama `resolveOrLink(payload)`
- Emite JWT local curto (mesmo mecanismo do login local, para reutilizar `JwtStrategy` existente)
- Retorna `{ user, token }`
- Se lançar `email_not_verified`, retornar `401 { error: 'email_not_verified', hint: 'use_local_login' }`

### B6 — Template de e-mail `account-linked.hbs`

**Arquivo**: `src/auth/sso/templates/account-linked.hbs`

```
Assunto: Sua conta Eldritch Alley foi vinculada ao login SSO

Olá {{displayName}},

Sua conta Eldritch Alley ({{email}}) foi vinculada ao login via SSO (Keycloak) em {{date}}.

Se você não reconhece esta ação:
- Altere sua senha imediatamente em {{appUrl}}/settings/security
- Contate suporte@heronoa.com.br

Você pode revisar seus métodos de login em {{appUrl}}/settings/security.
```

Reutiliza o transport SMTP já configurado para o `suporte@heronoa.com.br`.

### B7 — Endpoint `DELETE /auth/account`

**Arquivo**: `src/auth/account.controller.ts`

- Requer autenticação (JWT local)
- Body: `{ password?: string, confirm?: 'DELETE' }`
  - Se `user.passwordHash !== null` → exige `password` válido
  - Se `user.passwordHash === null` (SSO-only) → exige `confirm === 'DELETE'`
- Cascade em transação:
  - `DELETE FROM identities WHERE user_id = ?`
  - `DELETE FROM user_sessions WHERE user_id = ?` (se existir)
  - `DELETE FROM battle_history WHERE user_id = ?`
  - `DELETE FROM unit_inventory WHERE user_id = ?`
  - `DELETE FROM users WHERE id = ?`
- Envia e-mail de confirmação "Sua conta foi apagada permanentemente"
- Retorna `204`

### B8 — Remover integração direta Google/GitHub

- Remover dependências `passport-google-oauth20`, `passport-github2` (se instaladas)
- Remover rotas `/auth/google`, `/auth/github`, `/auth/google/callback`, `/auth/github/callback`
- Remover `GoogleStrategy`, `GithubStrategy` e configs associadas
- Manter `passport-local` (email/senha) intacto
- Após B2, remover referências a `google_id`/`github_id` no código

## Frontend (SPA)

### F1 — Botão "Login com SSO"

- Substitui os botões Google/GitHub na tela de login
- Usa `oidc-client-ts`:

```ts
export const userManager = new UserManager({
  authority: import.meta.env.VITE_KC_AUTHORITY,        // https://sso.my-url.dev.br/realms/homelab
  client_id: import.meta.env.VITE_KC_CLIENT_ID,         // 'eldritch-alley'
  redirect_uri: import.meta.env.VITE_KC_REDIRECT_URI,   // https://eldritch-alley.my-url.dev.br/auth/sso/callback
  post_logout_redirect_uri: import.meta.env.VITE_APP_URL,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
});
```

### F2 — Página `/auth/sso/callback`

- Chama `userManager.signinRedirectCallback()`
- Envia `access_token` para `POST /auth/sso/exchange`
- Armazena o JWT local (mesmo local que o login local usa hoje — `sessionStorage`)
- Redireciona para `/`
- Se `401 email_not_verified`, redireciona para `/login?error=email_not_verified` com aviso

### F3 — Armazenamento de tokens

| Token | Armazenamento |
| :--- | :--- |
| Access token do Keycloak | `sessionStorage` (efêmero) |
| Refresh token do Keycloak | `sessionStorage` |
| JWT local do backend | `sessionStorage` (mesmo do login local) |

Chamadas à API sempre usam `Authorization: Bearer <jwt-local>`.

### F4 — Página `/settings/security`

- Listar identidades vinculadas (Google via Keycloak, GitHub via Keycloak, local)
- Se `passwordHash === null`: botão "Definir senha" (usa fluxo de reset existente)
- Botão vermelho "Apagar conta" → abre modal

### F5 — Modal "Apagar conta"

- Aviso em destaque: **"Esta ação é permanente e irreversível. Todos os seus dados serão apagados."**
- Campo de senha (se tiver senha) ou input com confirmação textual `DELETE` (se SSO-only)
- Botão vermelho "Apagar conta permanentemente"
- Chama `DELETE /auth/account`
- Em sucesso: faz logout e redireciona para `/` com toast "Sua conta foi apagada"

## Privacy policy (m4-05 — pode ser PR separado)

### P1 — Seção "Login via SSO"

- Mencionar Keycloak (`sso.my-url.dev.br`) explicitamente
- Dados coletados no login SSO: `sub` (identificador interno), `email`, `name`, `groups`
- Finalidade: autenticação federada entre os serviços do ecossistema
- Base legal: consentimento (LGPD art. 7º, I) e execução de contrato (art. 7º, V)

### P2 — Seção "Compartilhamento de dados"

- Não há venda de dados
- Compartilhamento com o Keycloak limitado a autenticação
- Provedores de IdP (Google, GitHub) recebem apenas o necessário para login

### P3 — Seção "Exclusão de dados"

- Ao apagar a conta, **todos os dados são apagados automaticamente**
- Inclui: identidades vinculadas, histórico de batalhas, inventário de unidades
- **Ação irreversível e sem recuperação**
- Confirmação enviada por e-mail

## Client Keycloak necessário

**Client ID**: `eldritch-alley`

| Campo | Valor |
| :--- | :--- |
| Client type | OpenID Connect |
| Client authentication | Off (public) |
| Standard flow | On |
| Direct access grants | Off |
| PKCE Code Challenge Method | **S256** |
| Valid redirect URIs | `https://eldritch-alley.my-url.dev.br/auth/sso/callback` |
| Valid post logout redirect URIs | `https://eldritch-alley.my-url.dev.br/*` |
| Web origins | `https://eldritch-alley.my-url.dev.br` |
| Client scopes (Default) | `groups` |

## Testes

| # | Cenário | Resultado esperado |
| :--- | :--- | :--- |
| **T1** | SSO — usuário novo (sem conta local) | User criado sem senha + identity; **sem** e-mail |
| **T2** | SSO — usuário existente (mesmo e-mail) | Identity criada; **e-mail de notificação enviado** |
| **T3** | SSO — `email_verified=false` | Vinculo **rejeitado**; SPA redireciona com aviso |
| **T4** | SSO repetido | Lookup por identity; **sem** e-mail |
| **T5** | Apagar conta com senha | Cascade + e-mail de confirmação; logout |
| **T6** | Apagar conta SSO-only | Exige `confirm='DELETE'`; cascade |
| **T7** | Login local após SSO | Continua funcionando normalmente (sem regressão) |
| **T8** | "Esqueci a senha" para SSO-only | Funciona (e-mail no banco local) |
| **T9** | Login local após apagar conta | Credenciais não funcionam; SSO recria conta nova |
| **T10** | Regressão: login local + verificação + reset | Todos passam (sem alteração) |

## Critérios de aceitação

- [ ] Botão "Login com SSO" presente; botões Google/GitHub diretos removidos
- [ ] Backend valida JWT do Keycloak via JWKS com `iss`, `aud`, `exp`
- [ ] Lazy linking cria `identities` e envia e-mail só quando vincula a user existente
- [ ] `email_verified=false` bloqueia vínculo automático
- [ ] Apagar conta limpa `identities`, `battle_history`, `unit_inventory`, `users`
- [ ] Privacy policy (m4-05) menciona Keycloak, dados coletados, exclusão irreversível
- [ ] Testes T1–T10 passando
- [ ] Sem regressão no login local

## Fora de escopo

- Autorização por roles/grupos do Keycloak (futuro)
- Multi-realm ou federação além de Google/GitHub (o Keycloak já configura)
- Migração de sessões ativas (usuários re-logam naturalmente)
- MFA próprio (Cloudflare Zero Trust cobre o admin do Keycloak)
- Logout federado (Single Logout) — o logout local encerra a sessão do backend; o Keycloak mantém a sessão SSO para outros serviços (comportamento esperado em SSO)

## Notas para Claude Code

### Ordem de execução sugerida

1. Migrations B1 + B2
2. `JwtAuthGuard` (B3)
3. `SsoLinkingService` (B4)
4. Endpoint `/auth/sso/exchange` (B5)
5. Template de e-mail (B6)
6. Endpoint `DELETE /auth/account` (B7)
7. Remover Google/GitHub direto (B8)
8. Frontend F1 + F2
9. Frontend F4 + F5
10. Privacy policy (m4-05, PR separado)

### Arquivos provavelmente tocados

**Backend**:
- `src/auth/sso/*` (novo módulo)
- `src/auth/*` (refactor: remover Google/GitHub)
- `src/users/*` (cascade delete, password-less handling)
- `src/mail/*` (novo template)
- `migrations/*` (2 novas)
- `prisma/schema.prisma` (se usar Prisma)

**Frontend**:
- `src/auth/*` (OIDC client)
- `src/pages/Login/*` (botão SSO)
- `src/pages/Auth/SsoCallback/*` (novo)
- `src/pages/Settings/Security/*` (nova página)
- `src/components/DeleteAccountModal/*` (novo)

**Docs**:
- `docs/privacy-policy.md`

### Env vars

**Backend** (novas): `KC_URL`, `KC_REALM`, `KC_AUDIENCE`, `KC_JWKS_URL`, `KC_ISSUER`, `APP_URL`
**Frontend** (novas): `VITE_KC_AUTHORITY`, `VITE_KC_CLIENT_ID`, `VITE_KC_REDIRECT_URI`, `VITE_APP_URL`

### Ordem de PRs

- **PR1**: Backend (B1–B8) + testes T1–T10
- **PR2**: Frontend (F1–F5) + testes de integração
- **PR3**: Privacy policy (m4-05)

### Pegadinhas que valem lembrar

- **Full group path do mapper `groups`**: deve estar **OFF**, senão as claims chegam como `/grupo` e o lookup falha.
- **`aud` no token**: o Keycloak 26 inclui o `client_id` no `aud` por padrão; se mudar, adicionar `Audience Mapper` no client scope.
- **CORS**: o preflight `OPTIONS` não carrega `Authorization`; garantir que `cors()` responda antes do guard.
- **Cascade de deleção**: cobrir **todas** as tabelas que referenciam `users` (senão o `DELETE` falha por FK).
- **`confirm='DELETE'`**: case-sensitive; validar no backend.
- **`email_verified` do Keycloak**: só confiável se o IdP do Google/GitHub estiver com `Trust Email: ON` no realm `homelab`. Verificar antes de rodar T2.
- **Domínio**: `sso.my-url.dev.br` é o que está configurado; se mudar, ajustar `KC_URL` no backend e `VITE_KC_AUTHORITY` no frontend.