# QA — correção da janela do mercado aplicada

Alvo xgxbwqxjssxxuihuwmgy, sem Production. Migração local `20261101052804_touchline_fantasy_market_timing_forward_qa.sql` com SHA256 `9c4041136f568133fb79c881ab0c2cb871643e05d21e4662d3cd41eaf53782a1`. Aplicada por apply_migration como `touchline_fantasy_market_timing_forward_qa`; versão remota atribuída pelo serviço: **20261101053339**. Esta diferença de versão está mapeada aqui; não reaplicar nem reparar o histórico cegamente.

Removidas somente as margens artificiais de cinco minutos da projeção do mercado, mantendo início oficial e último apito confirmado. Sete grupos locais e revisão independente anterior à aplicação; sem DML ou execução do sincronizador neste lote.

Postflight remoto: projection OID477218; ownerpostgres; STABLE; SECURITY INVOKER; search_path vazio; ACL exclusivamente postgres. MD5 da projeção `e9776c6f9df37360660a3e56e4a827d8`; MD5 da sincronização inalterado `a54aed23cad04215235eeef009a7072d`. Migração registrada20261101053339.

Não prova UI publicada, fechamento de todas as rotas ou pontuação final. O banco já tinha gate de abertura artificial desligado e os testes de janela fechada separados; não confundir com esta correção de horário.
