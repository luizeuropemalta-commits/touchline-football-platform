# TouchLine Codex Mission Template

## Regra Nº 1 — Tooling TouchLine

Classifique a tarefa, carregue a governança canônica, identifique e execute todas as ferramentas relevantes e decida somente com evidência inspecionada. Não execute ferramentas irrelevantes.

## Regra Nº 1B — Continuidade TouchLine

Não pare enquanto houver trabalho seguro e executável dentro do escopo. Registre bloqueios sem repetir tentativas sem evidência nova e avance para outra ação segura da mesma missão.

## Regra Nº 1C — Não reler evidência fechada

Não releia documentos ou evidências classificados como `GREEN` ou `CLOSED` salvo mudança, regressão, conflito ou nova evidência. Quando a causa estiver comprovada: implementar, testar, verificar e continuar.

## Missão

- Objetivo:
- Escopo:
- Não objetivos:
- Ambiente permitido:
- Produção permitida: NÃO, salvo autorização explícita e gate próprio.
- Ferramentas relevantes:
- Critérios de conclusão:
- Rollback:

## Rodapé obrigatório

<!-- TOUCHLINE_MISSION_FOOTER_START -->

# RODAPÉ OBRIGATÓRIO — TOUCHLINE MISSION COMPLETION GATE

Esta missão NÃO pode ser declarada concluída até que todos os itens relevantes abaixo sejam executados.

## 1. Classificação e ferramentas

- tarefa classificada;
- governança canônica carregada;
- plugins relevantes identificados;
- plugins relevantes executados;
- plugins irrelevantes não executados;
- resultados inspecionados;
- decisões baseadas em evidência.

## 2. Verificação funcional

- fluxo principal testado;
- fluxos secundários testados;
- loading testado;
- empty state testado;
- error state testado;
- unauthorized/forbidden testado quando aplicável;
- persistência após refresh;
- back/forward quando aplicável;
- logout/login quando aplicável;
- nenhuma regressão conhecida dentro do escopo.

## 3. Verificação estrutural

- arquitetura respeitada;
- módulos corretos;
- fronteiras server/client corretas;
- dados reais separados de dados TouchLine;
- nenhuma duplicação desnecessária;
- nenhuma dependência circular introduzida;
- nenhuma fonte de verdade paralela criada;
- nenhuma dívida estrutural conhecida deixada silenciosamente.

## 4. Verificação visual

Quando a missão tocar UI, página ou componente:

- inspeção visual real executada;
- layout organizado;
- cards renderizados completamente;
- nenhum elemento cortado;
- nenhum overflow inesperado;
- nenhuma sobreposição;
- nenhum texto ilegível;
- nenhuma tipografia excessivamente pequena;
- nenhuma cor fora do design system sem justificativa;
- loading e transições corretos;
- modal/overlay correto;
- hover, focus e touch corretos;
- estado atual preservado;
- nenhuma página piscando ou trocando sem necessidade.

## 5. Responsividade

Quando aplicável:

- desktop;
- laptop;
- wide desktop;
- telefone landscape;
- tablet landscape;
- orientação portrait bloqueada conforme regra TouchLine;
- conteúdo preservado ao girar o dispositivo.

## 6. Acessibilidade

Quando aplicável:

- teclado;
- foco visível;
- labels;
- ARIA;
- contraste;
- touch targets;
- reduced motion;
- screen-reader names;
- alternativa acessível ao drag-and-drop;
- suporte a gamepad/TV remote quando previsto.

## 7. Navegadores

Quando aplicável:

- Safari nativo;
- Chromium;
- WebKit;
- Firefox;
- console;
- network;
- request failures;
- hydration;
- runtime errors.

## 8. Dados e banco

Quando aplicável:

- Supabase QA correto;
- Production guard;
- RLS;
- foreign keys;
- idempotência;
- rollback;
- before/after counts;
- nenhum dado privado copiado;
- nenhuma duplicação;
- nenhuma alteração de Production.

## 9. Gates de código

Quando houver alteração:

- testes focados;
- suíte proporcional ou completa;
- TypeScript;
- ESLint;
- build;
- `git diff --check`;
- Security Scan quando relevante;
- Code Verification independente;
- commit isolado;
- worktree controlada.

## 10. QA remoto

- push somente para `qa`;
- deployment Git nativo;
- Vercel `READY`;
- alias permanente no commit correto;
- smoke test remoto;
- browser remoto;
- logs verificados;
- persistência remota comprovada.

## 11. Regra de correção imediata

Se durante a missão for encontrado um defeito funcional, visual, estrutural, responsivo, de acessibilidade, de dados, de segurança, de performance ou de integração, e a correção for segura, reversível e estiver dentro do escopo: CORRIGIR AGORA.

Se a correção não puder ser feita, registrar obrigatoriamente evidência, impacto, motivo do bloqueio, próxima ação exata e classificação `BLOCKED`, `EXTERNAL` ou `APPROVAL REQUIRED`.

## 12. Proibição de falso PASS

Não considerar concluído porque código foi alterado, teste unitário passou, build passou, deployment ficou READY, rota retornou 200 ou screenshot pareceu boa uma vez.

Concluído significa:

CODE → TEST → CODE VERIFICATION → QA DEPLOYMENT → REAL BROWSER → LOGS → PERSISTENCE → REGRESSION → EVIDENCE.

## 13. Relatório final obrigatório

Entregar:

**MISSION:**  
**SCOPE:**  
**QA BRANCH:**  
**QA COMMIT:**  
**QA DEPLOYMENT:**  
**STABLE QA URL:**  
**FILES CHANGED:**  
**FUNCTIONAL RESULT:**  
**VISUAL RESULT:**  
**RESPONSIVE RESULT:**  
**ACCESSIBILITY RESULT:**  
**SECURITY RESULT:**  
**BROWSER MATRIX:**  
**TESTS:**  
**BUILD:**  
**OBSERVABILITY:**  
**OPEN FINDINGS:**  
**PRODUCTION:** NOT TOUCHED

| TOOL / PLUGIN | RELEVANT | LOADED | EXECUTED | RESULT | EVIDENCE |
|---|---|---|---|---|---|

Nenhuma ferramenta pode ser marcada como executada apenas porque seu skill foi lido.

<!-- TOUCHLINE_MISSION_FOOTER_END -->
