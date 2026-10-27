/**
 * Conteúdo do site (tirado do site atual em www.asrosinhas.org).
 * Num projeto com servidor, isto vem da API/backoffice, como no site do Serrado FC; aqui fica num ficheiro.
 */

export interface Product {
  slug: string;
  ref?: string;
  name: string;
  kind: 'soutien' | 'merch';
  description: string;
  colors: string[];
  sizes: string[];
  price: number;
  image: string;
  /** Ponto onde a imagem deve ficar centrada (CSS object-position) */
  focus?: string;
}

export interface ClubEvent {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  body: string[];
  image: string;
  imageAlt: string;
  gallery?: string[];
  cta?: { label: string; link: string };
}

export const ORG = {
  name: 'As Rosinhas',
  tagline: 'Próteses mamárias artesanais para todas as mulheres que precisam.',
  email: 'info@asrosinhas.org',
  instagram: 'https://www.instagram.com/asrosinhas_/',
  instagramHandle: '@asrosinhas_',
  facebook: 'https://www.facebook.com/profile.php?id=61550489120447',
  since: 2020,
  annualFee: 24,
  siteUrl: 'https://www.asrosinhas.org',
};

/** Endereço público do protótipo (imagens de partilha precisam de URL absoluto). */
export const SITE_URL = 'https://brunommpereira.github.io/Serradowebsite/asrosinhas/';

export const ABOUT = {
  intro:
    'A falta de soluções de próteses provisórias externas para as mulheres mastectomizadas levou ao aparecimento do Projeto As Rosinhas, no final de 2020.',
  mission:
    'Este projeto tem como principal objetivo oferecer próteses mamárias artesanais, provisórias ou não, a todas as mulheres que necessitem, contribuindo para o aumento da sua autoestima e qualidade de vida.',
  family:
    'As Rosinhas são um projeto familiar, sem fins lucrativos, que conta também com a dedicação de voluntários.',
  materials: ['Meias de mousse', 'Sementes de milho alvo'],
  traits: ['Confortáveis', 'Discretas', 'Adaptáveis à fisionomia de cada mulher'],
  benefits: ['Sensação semelhante à mama', 'Simetria corporal'],
};

export const EVENTS: ClubEvent[] = [
  {
    slug: 'lancamento-catamaran',
    kicker: 'Lançamento oficial',
    title: 'Lançamento dos Soutiens As Rosinhas num Catamaran',
    summary:
      'O lançamento oficial dos Soutiens As Rosinhas a bordo de um catamaran, com a Lisbon Catamaran Tours.',
    body: [
      'Lançamento oficial dos Soutiens As Rosinhas a bordo de um Catamaran, com a Lisbon Catamaran Tours.',
      'Podes adquirir o teu soutien e desta forma ajudar para que continuemos a enviar de forma gratuita as Rosinhas e contribuir para a autoestima e qualidade de vida de tantas Mulheres! Estamos muito entusiasmadas e felizes por concretizar um sonho!',
    ],
    image: 'img/eventos/catamaran-grupo.webp',
    imageAlt:
      'Grupo de mulheres sorridentes na proa de um catamaran no rio Tejo, no lançamento dos soutiens',
    gallery: ['img/eventos/catamaran-colagem.webp', 'img/eventos/catamaran-retratos.webp'],
    cta: { label: 'Ver os soutiens', link: '/loja' },
  },
  {
    slug: 'soutiens-simel',
    kicker: 'Parceria Simel',
    title: 'Lançamento dos Soutiens As Rosinhas',
    summary:
      'Em parceria com a marca portuguesa Simel, soutiens para todas as Mulheres, pensando principalmente na Mulher mastectomizada que usa a Rosinha.',
    body: [
      'As Rosinhas em parceria com a Marca Portuguesa Simel acabam de lançar os soutiens para todas as Mulheres, pensando principalmente na Mulher Mastectomizada que usa a Rosinha!',
      'Como todos os soutiens Simel, têm três características que valorizamos muito: Super confortáveis, Lindos de Viver, Acessíveis a todas.',
      'Podes adquirir o teu soutien e desta forma ajudar para que continuemos a enviar de forma gratuita as Rosinhas e contribuir para a autoestima e qualidade de vida de tantas Mulheres!',
    ],
    image: 'img/eventos/simel-cartaz.webp',
    imageAlt:
      'Cartaz «Nova coleção de sutians» Simel e As Rosinhas, com um soutien e uma Rosinha cor-de-rosa',
    cta: { label: 'Encomendar agora', link: '/loja' },
  },
  {
    slug: 'voluntarias',
    kicker: 'Quem faz acontecer',
    title: 'As nossas voluntárias',
    summary:
      'As voluntárias que ajudam a produzir as próteses e fazem, de forma gratuita, as almofadinhas de coração e o saco para os drenos entregues em hospital.',
    body: [
      'As nossas voluntárias ajudam-nos a produzir as próteses e fazem, de forma gratuita, as almofadinhas de coração e o saco para os drenos que entregamos em hospital.',
      'São as @metrosdesolidariedade e o espaço é no @arcoirisametro.',
    ],
    image: 'img/eventos/voluntarias-arco-iris.webp',
    imageAlt: 'Voluntárias d’As Rosinhas à porta do espaço Arco-Íris a Metro',
    gallery: ['img/eventos/voluntarias-colagem.webp'],
  },
];

export const SOUTIENS: Product[] = [
  {
    slug: 'soutien-anita',
    ref: '0123883',
    name: 'Soutien Anita',
    kind: 'soutien',
    description:
      'Soutien bralette para prótese em renda floral no exterior, interior em algodão orgânico.',
    colors: ['Natural', 'Vison', 'Preto', 'Vermelho'],
    sizes: ['B32', 'B34', 'B36', 'B38', 'B40', 'B42'],
    price: 32.5,
    image: 'img/loja/0123883.webp',
    focus: '50% 40%',
  },
  {
    slug: 'soutien-anita-tanga',
    ref: '0123883',
    name: 'Soutien Anita + tanga',
    kind: 'soutien',
    description: 'Soutien bralette para prótese com interior em algodão, com tanga a condizer.',
    colors: ['Natural', 'Vison', 'Preto', 'Vermelho'],
    sizes: ['B32', 'B34', 'B36', 'B38', 'B40', 'B42'],
    price: 41.5,
    image: 'img/loja/0123883-tanga.webp',
  },
  {
    slug: 'soutien-desporto',
    ref: '01ROS04',
    name: 'Soutien de desporto',
    kind: 'soutien',
    description: 'Soutien de desporto moldado para prótese, com interior em algodão.',
    colors: ['Preto'],
    sizes: ['B32–B44', 'C32', 'C42', 'D40'],
    price: 35,
    image: 'img/loja/01ROS04.webp',
  },
  {
    slug: 'soutien-grande-cobertura',
    ref: '0115424',
    name: 'Soutien de grande cobertura',
    kind: 'soutien',
    description: 'Soutien para prótese de grande cobertura, interior em algodão.',
    colors: ['Vison', 'Preto'],
    sizes: ['B36–B48', 'C36–C46', 'D36–D44'],
    price: 26.9,
    image: 'img/loja/0115424.webp',
  },
  {
    slug: 'soutien-moldado-laize',
    ref: '0118703',
    name: 'Soutien moldado em laize',
    kind: 'soutien',
    description: 'Soutien moldado para prótese em algodão, forrado a laize.',
    colors: ['Natural'],
    sizes: ['B32–B44', 'C32–C42', 'D32–D40'],
    price: 25.9,
    image: 'img/loja/0118703.webp',
  },
  {
    slug: 'soutien-abrir-a-frente',
    ref: '0118702',
    name: 'Soutien de abrir à frente',
    kind: 'soutien',
    description: 'Soutien para prótese de abrir à frente e interior em algodão.',
    colors: ['Vison', 'Preto'],
    sizes: ['B32–B48', 'C32–C46', 'D32–D44'],
    price: 24.9,
    image: 'img/loja/0118702.webp',
  },
  {
    slug: 'soutien-moldado',
    ref: '0118692',
    name: 'Soutien moldado',
    kind: 'soutien',
    description: 'Soutien moldado para prótese com interior em algodão.',
    colors: ['Natural', 'Vison', 'Preto'],
    sizes: ['B34–B48', 'C34–C46', 'D34–D44'],
    price: 26.5,
    image: 'img/loja/0118692.webp',
  },
];

const CLOTHES = ['S', 'M', 'L', 'XL', 'XXL'];
const merch = (
  slug: string,
  name: string,
  price: number,
  colors: string[],
  sizes: string[],
  image: string,
  description: string,
): Product => ({
  slug,
  name,
  kind: 'merch',
  description,
  colors,
  sizes,
  price,
  image,
});

export const MERCH: Product[] = [
  merch(
    't-shirt',
    'T-Shirt',
    15,
    ['Branco', 'Preto', 'Rosa', 'Cinzento'],
    CLOTHES,
    'img/loja/tshirt.webp',
    'T-shirt com a rosa d’As Rosinhas.',
  ),
  merch(
    't-shirt-cintada',
    'T-Shirt cintada',
    15,
    ['Branco', 'Preto', 'Rosa', 'Cinzento'],
    CLOTHES,
    'img/loja/tshirt.webp',
    'T-shirt de corte cintado com a rosa d’As Rosinhas.',
  ),
  merch(
    'sweatshirt',
    'Sweatshirt',
    30,
    ['Branco', 'Preto', 'Rosa', 'Cinzento'],
    CLOTHES,
    'img/loja/sweatshirt.webp',
    'Sweatshirt com a rosa d’As Rosinhas.',
  ),
  merch(
    'camisola',
    'Camisola',
    25,
    ['Rosa claro', 'Rosa', 'Azul escuro'],
    CLOTHES,
    'img/loja/camisola.webp',
    'Camisola d’As Rosinhas.',
  ),
  merch(
    'casaco',
    'Casaco',
    35,
    ['Preto'],
    CLOTHES,
    'img/loja/casaco.webp',
    'Casaco preto d’As Rosinhas.',
  ),
  merch(
    'lenco-rose',
    'Lenço Rose',
    45,
    ['Única'],
    ['Único'],
    'img/loja/lenco.webp',
    'Lenço Rose d’As Rosinhas.',
  ),
  merch(
    'bone',
    'Boné',
    15,
    ['Preto', 'Rosa'],
    ['Único'],
    'img/loja/bone.webp',
    'Boné d’As Rosinhas.',
  ),
  merch(
    'panama',
    'Panamá',
    15,
    ['Preto'],
    ['Único'],
    'img/loja/panama.webp',
    'Chapéu panamá d’As Rosinhas.',
  ),
  merch(
    'bolsa',
    'Bolsa',
    15,
    ['Preto', 'Rosa'],
    ['Único'],
    'img/loja/bolsa.webp',
    'Bolsa d’As Rosinhas.',
  ),
  merch('leque', 'Leque', 7, ['Única'], ['Único'], 'img/loja/leque.webp', 'Leque d’As Rosinhas.'),
  merch(
    'brincos',
    'Brincos',
    7,
    ['Rosa', 'Azul', 'Laranja', 'Verde', 'Dourado', 'Branco', 'Preto'],
    ['Único'],
    'img/loja/brincos.webp',
    'Brincos com a rosa d’As Rosinhas.',
  ),
];

export const ALL_PRODUCTS = [...SOUTIENS, ...MERCH];

export const POLICIES = {
  delivery: 'Os artigos são enviados através dos CTT, podendo a entrega demorar mais de 15 dias.',
  returns:
    'Todos os artigos podem ser trocados nos primeiros 14 dias após o recebimento da encomenda. Os custos do envio para troca são assegurados pelo cliente. Só são aceites artigos em perfeitas condições (sem uso, marcas, manchas, odores e com etiquetas).',
  payment:
    'Depois de fazeres a encomenda recebes por email os dados para pagamento por transferência. Envia o comprovativo para info@asrosinhas.org.',
};

export const PARTNERS = [
  { name: 'Simel', text: 'Marca têxtil portuguesa, parceira nos soutiens As Rosinhas.' },
  {
    name: 'Metros de Solidariedade',
    text: 'As voluntárias que ajudam a produzir as próteses.',
    link: 'https://www.instagram.com/metrosdesolidariedade/',
  },
  {
    name: 'Arco-Íris a Metro',
    text: 'O espaço onde as voluntárias trabalham.',
    link: 'https://www.instagram.com/arcoirisametro/',
  },
  {
    name: 'SHIA',
    text: 'Brincos, pregadeiras e ímanes solidários: parte do valor reverte para a associação.',
    link: 'https://www.instagram.com/p/C5gkpaoM-al/',
  },
];

export const euro = (v: number) =>
  v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
