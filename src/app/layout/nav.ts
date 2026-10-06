export interface NavLink {
  label: string;
  link: string;
  fragment?: string;
  queryParams?: Record<string, string>;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export interface NavItem {
  label: string;
  link: string;
  /** Colunas do mega menu (secção 5 da especificação) */
  groups?: NavGroup[];
  promo?: { title: string; text: string; link: string; cta: string };
}

export const MAIN_NAV: NavItem[] = [
  {
    label: 'Clube',
    link: '/clube',
    groups: [
      {
        title: 'Clube',
        links: [
          { label: 'O Serrado FC', link: '/clube' },
          { label: 'História', link: '/clube', fragment: 'historia' },
          { label: 'Missão e Valores', link: '/clube', fragment: 'missao' },
          { label: 'Órgãos Sociais', link: '/clube', fragment: 'orgaos-sociais' },
          { label: 'Estatutos e Documentos', link: '/clube', fragment: 'transparencia' },
          { label: 'Instalações', link: '/clube', fragment: 'instalacoes' },
          { label: 'Contactos', link: '/contactos' },
        ],
      },
      {
        title: 'Parceiros',
        links: [
          { label: 'Patrocinadores', link: '/parceiros' },
          { label: 'Torne-se Parceiro', link: '/parceiros', fragment: 'torne-se-parceiro' },
        ],
      },
      {
        title: 'Comunidade',
        links: [
          { label: 'Projetos e Solidariedade', link: '/comunidade' },
          { label: 'Voluntariado', link: '/comunidade', fragment: 'voluntariado' },
          { label: 'Descobrir Património', link: '/comunidade', fragment: 'patrimonio' },
        ],
      },
    ],
    promo: { title: 'Desde 1978', text: 'Uma história. Uma família. Várias modalidades.', link: '/clube', cta: 'Conhece o clube' },
  },
  {
    label: 'Modalidades',
    link: '/modalidades',
    groups: [
      {
        title: 'Modalidades',
        links: [
          { label: 'Atletismo', link: '/modalidades/atletismo' },
          { label: 'Futsal', link: '/modalidades/futsal' },
          { label: 'Rugby', link: '/modalidades/rugby' },
        ],
      },
      {
        title: 'Formação',
        links: [
          { label: 'Formação', link: '/modalidades/formacao' },
          { label: 'Escola de Desporto', link: '/modalidades/escola-de-desporto' },
          { label: 'Horários de treino', link: '/modalidades' },
        ],
      },
    ],
    promo: { title: 'Experimenta um treino', text: 'Inscrições abertas em todos os escalões.', link: '/contactos', cta: 'Fala connosco' },
  },
  {
    label: 'Notícias',
    link: '/noticias',
    groups: [
      {
        title: 'Conteúdos',
        links: [
          { label: 'Todas as notícias', link: '/noticias' },
          { label: 'Agenda', link: '/agenda' },
          { label: 'Resultados', link: '/resultados' },
          { label: 'Fotografias', link: '/multimedia' },
          { label: 'Vídeos', link: '/multimedia', queryParams: { tipo: 'video' } },
        ],
      },
      {
        title: 'Categorias',
        links: [
          { label: 'Clube', link: '/noticias', queryParams: { categoria: 'Clube' } },
          { label: 'Atletismo', link: '/noticias', queryParams: { categoria: 'Atletismo' } },
          { label: 'Futsal', link: '/noticias', queryParams: { categoria: 'Futsal' } },
          { label: 'Rugby', link: '/noticias', queryParams: { categoria: 'Rugby' } },
          { label: 'Comunicados', link: '/noticias', queryParams: { categoria: 'Comunicados' } },
        ],
      },
    ],
  },
  { label: 'Agenda', link: '/agenda' },
  {
    label: 'Sócios',
    link: '/socios',
    groups: [
      {
        title: 'Sócios',
        links: [
          { label: 'Ser Sócio', link: '/socios' },
          { label: 'Categorias e Quotas', link: '/socios', fragment: 'quotas' },
          { label: 'Benefícios', link: '/socios', fragment: 'beneficios' },
          { label: 'Registo de Sócio', link: '/socios/registo' },
          { label: 'FAQ', link: '/socios', fragment: 'faq' },
        ],
      },
      {
        title: 'Área de Sócio',
        links: [
          { label: 'Entrar', link: '/area-socio/entrar' },
          { label: 'Pagar Quota', link: '/area-socio' },
          { label: 'Cartão Digital', link: '/area-socio' },
        ],
      },
    ],
    promo: { title: 'Faz parte da família', text: 'Ser sócio é apoiar a formação de centenas de jovens.', link: '/socios/registo', cta: 'Torna-te sócio' },
  },
  {
    label: 'Eventos',
    link: '/eventos',
    groups: [
      {
        title: 'Eventos',
        links: [
          { label: 'Próximos eventos', link: '/eventos' },
          { label: 'Caminhadas', link: '/eventos', queryParams: { tipo: 'Caminhada' } },
          { label: 'Torneios', link: '/eventos', queryParams: { tipo: 'Torneio' } },
          { label: 'Corridas', link: '/eventos', queryParams: { tipo: 'Corrida' } },
        ],
      },
    ],
  },
  { label: 'Loja', link: '/loja' },
];
