import * as oidc from 'openid-client';
import { config } from '../../shared/config.ts';

/** Identidade devolvida por um fornecedor, já validada (assinatura, emissor, audiência, nonce, PKCE). */
export interface ExternalIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

export interface OAuthStart {
  url: URL;
  state: string;
  nonce: string;
  verifier: string;
}

/** Um fornecedor de entrada (Google, Microsoft…). */
export interface OAuthProvider {
  readonly id: string;
  readonly name: string;
  start(): Promise<OAuthStart>;
  finish(callbackUrl: URL, checks: { state: string; nonce: string; verifier: string }): Promise<ExternalIdentity>;
}

interface ProviderDef {
  name: string;
  issuer: string;
  /** Se o email do token é de confiança para ligar à conta do clube */
  emailVerified(claims: Record<string, unknown>): boolean;
}

const DEFS: Record<string, ProviderDef> = {
  google: {
    name: 'Google',
    issuer: 'https://accounts.google.com',
    emailVerified: (c) => c['email_verified'] === true,
  },
  microsoft: {
    name: 'Microsoft',
    // Só contas pessoais (Outlook, Hotmail, Live): a Microsoft verifica o email destas contas.
    // As contas de empresa (Entra ID) ficam de fora, porque o email delas é definido pelo
    // administrador da empresa e não é verificado (falha conhecida como «nOAuth»).
    issuer: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
    emailVerified: (c) => typeof c['email'] === 'string',
  },
};

/** Fornecedor OpenID Connect (fluxo authorization code + PKCE + state + nonce). */
export class OidcProvider implements OAuthProvider {
  private config?: Promise<oidc.Configuration>;

  readonly id: string;
  readonly name: string;
  private readonly opts: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; emailVerified: (claims: Record<string, unknown>) => boolean };

  constructor(id: string, name: string, opts: OidcProvider['opts']) {
    this.id = id;
    this.name = name;
    this.opts = opts;
  }

  /** Descoberta (.well-known/openid-configuration) feita uma vez; repete se falhar. */
  private conf() {
    const insecure = !config.production && this.opts.issuer.startsWith('http://'); // só nos testes (fornecedor falso local)
    this.config ??= oidc
      .discovery(new URL(this.opts.issuer), this.opts.clientId, this.opts.clientSecret, undefined, insecure ? { execute: [oidc.allowInsecureRequests] } : undefined)
      .catch((err: unknown) => {
        this.config = undefined;
        throw err;
      });
    return this.config;
  }

  async start(): Promise<OAuthStart> {
    const conf = await this.conf();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(conf, {
      redirect_uri: this.opts.redirectUri,
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
      prompt: 'select_account',
    });
    return { url, state, nonce, verifier };
  }

  async finish(callbackUrl: URL, checks: { state: string; nonce: string; verifier: string }): Promise<ExternalIdentity> {
    const conf = await this.conf();
    const tokens = await oidc.authorizationCodeGrant(conf, callbackUrl, {
      pkceCodeVerifier: checks.verifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims || typeof claims['sub'] !== 'string') throw new Error('id_token sem «sub»');
    const email = typeof claims['email'] === 'string' ? claims['email'].trim().toLowerCase() : null;
    return { subject: claims['sub'], email, emailVerified: !!email && this.opts.emailVerified(claims) };
  }
}

/** Fornecedores configurados (com CLIENT_ID, CLIENT_SECRET e PUBLIC_URL). */
export function configuredProviders(): Map<string, OAuthProvider> {
  const out = new Map<string, OAuthProvider>();
  const { publicUrl } = config.oauth;
  if (!publicUrl) return out;
  for (const [id, def] of Object.entries(DEFS)) {
    const creds = config.oauth[id as 'google' | 'microsoft'];
    if (!creds.clientId || !creds.clientSecret) continue;
    out.set(id, new OidcProvider(id, def.name, { issuer: def.issuer, clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: callbackUrl(id), emailVerified: def.emailVerified }));
  }
  return out;
}

export function callbackUrl(provider: string) {
  return `${config.oauth.publicUrl}/api/v1/auth/oauth/${provider}/callback`;
}

export { DEFS as OAUTH_PROVIDERS };
