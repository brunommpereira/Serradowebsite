/** Textos legíveis para as ações registadas na auditoria. */
const TYPES: Record<string, string> = { news: 'notícia', events: 'evento', pages: 'página', partners: 'parceiro' };
const VERBS: Record<string, string> = {
  create: 'criou',
  update: 'atualizou',
  publish: 'publicou',
  unpublish: 'despublicou',
  archive: 'arquivou',
  delete: 'apagou',
  restore: 'repôs uma versão de',
};

export function actionLabel(action: string): string {
  const [area, a, b] = action.split('.');
  if (area === 'cms') return `${VERBS[b] ?? b} ${TYPES[a] ?? a}`;
  const map: Record<string, string> = {
    'change_requests.approve': 'aprovou um pedido de alteração',
    'change_requests.reject': 'rejeitou um pedido de alteração',
    'documents.approve': 'aprovou um documento',
    'documents.reject': 'rejeitou um documento',
    'results.import': 'importou resultados',
    'users.roles': 'alterou papéis de um utilizador',
    'users.invite': 'enviou um convite por email',
    'roles.create': 'criou um papel',
    'roles.update': 'alterou as permissões de um papel',
    'roles.delete': 'apagou um papel',
    'auth.password_forgot': 'pediu para repor a password',
    'auth.password_reset': 'repôs a password',
    'auth.password_invite': 'definiu a password (convite)',
    'athletes.update': 'atualizou uma ficha de atleta',
    'athletes.confirm': 'confirmou uma ficha de atleta',
    'athletes.change_request': 'pediu alteração de identificação',
  };
  return map[action] ?? action;
}
