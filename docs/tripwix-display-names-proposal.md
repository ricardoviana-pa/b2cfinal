# Nomes propostos para as casas Tripwix com código de catálogo

Estado: **proposta, não ativa**. Para ativar, copiar a linha aprovada para
`client/src/data/displayNames.json` (chave = slug). Até lá o site mostra o
nome do feed limpo por `sanitizePropertyName`.

Regra dos nomes curados: sem código de catálogo, sem "Lote", sem "3Br", com
acentos, e a localidade só quando o nome sozinho não situa a casa.

| Slug | Nome do feed | Proposta | Nota |
|---|---|---|---|
| `villa-19-monte-golf-qdl` | Villa 19 Monte Golf QDL | Casa Monte Golf, Quinta do Lago | "19" e "QDL" são referências internas do condomínio |
| `pt-a-sud` | PT-A-Sud | Casa A Sud, Comporta | Se a casa tiver nome próprio conhecido (ex.: "Casa das Bicas"), usar esse |
| `encosta-do-lago-5` | Encosta do Lago 5 | Casa Encosta do Lago, Quinta do Lago | "5" é o lote |
| `perogil-58` | Perogil 58 | Casa Perogil, Tavira | "58" é o número de porta; confirmar concelho (Algarve oriental) |
| `casa-da-palicada-lote-5` | Casa da Palicada Lote 5 | Casa da Paliçada, Comporta | Acento em Paliçada; sem "Lote 5" |
| `3br-cabana-villa` | 3Br Cabana Villa | Cabana Villa, Comporta | Os 3 quartos já aparecem na ficha |
| `mirante-1` | Mirante 1 | Casa Mirante, Albufeira | "1" é referência de unidade |

Outras que também merecem revisão (não estavam na auditoria):

| Slug | Nome do feed | Proposta |
|---|---|---|
| `diamante-azul-mansion` | Diamante Azul - Mansion | Diamante Azul |
| `quinta-do-merouco-casa-do-rio` | Quinta do Merouço - Casa do Rio | Casa do Rio, Quinta do Merouço |
| `loft-58` | Loft 58 | Loft 58, Lisboa |
| `4-serras` | 4 Serras | Quatro Serras, Comporta |
