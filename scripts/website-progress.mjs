import { readFileSync, writeFileSync } from 'node:fs';
const folder = new URL('../docs/website-progress/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('tasks.json', folder), 'utf8'));
const labels = {
  por_iniciar: 'Por iniciar', em_execucao: 'Em execução',
  implementado_dev_validacao_pendente: 'Código em DEV; validação por fechar',
  rascunho_validacao_pendente: 'Rascunho; validação por fechar',
  aguarda_decisao_comercial: 'Aguarda decisão comercial',
  parcial_validado_local: 'Parte validada localmente',
  validado_local: 'Validado localmente; não publicado',
  publicado_dev: 'Publicado em DEV', publicado_producao: 'Publicado em produção',
  concluido: 'Concluído com evidência',
};
const ids = new Set();
for (const t of data.tasks) {
  if (ids.has(t.id) || !labels[t.status]) throw new Error(`Invalid progress record: ${t.id}`);
  if (t.status === 'concluido' && (!t.evidence.length || t.blockers.length)) throw new Error(`Missing completion evidence: ${t.id}`);
  ids.add(t.id);
}
const counts = Object.entries(labels).map(([key,label]) => [label,data.tasks.filter(t=>t.status===key).length]).filter(([,n])=>n);
let md = `# Website Portugal Active — progresso\n\nAtualizado: ${data.updated}. Fonte editável: [tasks.json](tasks.json). Gerar este mapa com \`node scripts/website-progress.mjs\`.\n\n`;
md += '## Regras\n\n' + data.rules.map(r=>`- ${r}`).join('\n') + '\n\n';
md += '## Estado\n\n' + counts.map(([label,n])=>`- **${n}** — ${label}`).join('\n') + '\n\n';
md += 'Não se atribui percentagem a uma tarefa só por existirem alterações de código. Cada ID conserva o critério de conclusão original.\n\n';
md += '| ID | Prioridade | Estado | Trabalho |\n| --- | --- | --- | --- |\n';
for (const t of data.tasks) md += `| [${t.id}](#${t.id.toLowerCase()}) | ${t.priority} | ${labels[t.status]} | ${t.task.replaceAll('|','/')} |\n`;
md += '\n## Detalhe e evidência\n';
for (const t of data.tasks) {
  md += `\n### ${t.id}\n\n**${t.task}**\n\nEstado: ${labels[t.status]}.\n\nCritério: ${t.acceptance}\n\nPróximo passo: ${t.next_step}\n`;
  if (t.evidence.length) md += '\nEvidência:\n\n' + t.evidence.map(e=>`- ${e}`).join('\n') + '\n';
  if (t.steps?.length) md += '\nEtapas:\n\n' + t.steps.map(s=>`- ${s.done ? '[x]' : '[ ]'} ${s.label}`).join('\n') + '\n';
  if (t.blockers.length) md += '\nDependências:\n\n' + t.blockers.map(e=>`- ${e}`).join('\n') + '\n';
}
md += '\n## Histórico\n\n' + data.history.map(h=>`- ${h.date}: ${h.event}`).join('\n') + '\n';
writeFileSync(new URL('PROGRESSO.md', folder), md);
console.log(`Mapped ${data.tasks.length} tasks; ${data.tasks.filter(t=>t.status==='concluido').length} fully complete.`);
