# Desafio Técnico - Full Stack Sênior

Serviço desenvolvido em **Node.js + TypeScript** para integração com a plataforma do desafio.

A aplicação recebe lotes de SKUs, responde rapidamente às mensagens recebidas, realiza o enriquecimento de forma assíncrona, controla concorrência e duplicidades e envia o resultado consolidado através do callback.

## Arquitetura

Fluxo simplificado:

```text
POST /process
     │
     ├── validação
     ├── deduplicação (run_id + seq)
     └── ACK imediato
              │
              ▼
        Fila em memória
              │
       concorrência = 3
              │
              ▼
       GET /enrich/:sku
              │
        retry / backoff
              │
              ▼
          RunManager
              │
       consolida o lote
              │
              ▼
        POST /callback
```

O recebimento foi desacoplado do processamento para que o `/process` não espere o `/enrich`, mantendo o ACK dentro do limite de 600 ms.

Como a entrega é **at-least-once**, mensagens duplicadas são identificadas por `run_id + seq` e não são processadas novamente.

O `/enrich` é limitado a **3 requisições simultâneas**. Erros transitórios (`500` e `429`) possuem retry com backoff, enquanto erros `401` e `404` são tratados como não recuperáveis.

Os resultados são armazenados por execução e enviados ao callback somente quando o lote está completo.

## Como executar

### Instalação

```bash
npm install
```

Crie o `.env` a partir do `.env.example`:

```env
PORT=4000
PLATFORM_BASE_URL=
PLATFORM_CID=
PLATFORM_TOKEN=
```

### Desenvolvimento

```bash
npm run dev
```

A aplicação será iniciada por padrão na porta `4000`.

Para disponibilizar o webhook publicamente, pode ser utilizado um túnel HTTPS:

```bash
ngrok http 4000
```

A URL HTTPS gerada deve ser utilizada no `POST /register` da plataforma.

Após o registro, configure o `cid` e `token` retornados no `.env` e reinicie a aplicação.

Para iniciar uma execução:

```text
POST http://localhost:4000/runs
```

`/runs` é apenas um endpoint auxiliar para execução local do desafio. Os endpoints exigidos pela integração são `/check` e `/process`.

### Build

```bash
npm run build
npm start
```

### Testes

```bash
npm run test
```

Resultado atual:

```text
Test Files  2 passed
Tests       13 passed
```

Os testes cobrem principalmente deduplicação, consolidação do lote, controle de concorrência e comportamento de retry.

## Melhor resultado

Melhor execução registrada:

```text
Score:              100/100
Tempo total:        1727 ms

ACK target:         600 ms
ACK p50:            345 ms
ACK p95:            395 ms
Pior ACK:           408 ms

Resultados:         20/20
Duplicata:          processada 1 vez
Erros 500 forçados: 4
Erros recuperados:  4/4
Limite concorrência: 3
Erros 429:          0
Callback attempts:  1
```

| Critério | Resultado |
|---|---:|
| Resultado | 30/30 |
| ACK | 30/30 |
| Idempotência | 15/15 |
| Retry | 15/15 |
| Concorrência | 10/10 |
| **Total** | **100/100** |

Relatório completo: [melhor execução](docs/best-run-report.json).

## Decisões e trade-offs

Foi utilizada uma **fila em memória**, pois o cenário do desafio trabalha com apenas 20 SKUs e não exige infraestrutura adicional.

Essa abordagem mantém a solução simples, mas significa que filas e estados em andamento são perdidos caso o processo seja reiniciado.

O controle de concorrência também é local ao processo. Para a carga atual isso é suficiente, mas não funcionaria da mesma forma com múltiplas instâncias da aplicação.

O retry utiliza backoff dentro do próprio worker. Para apenas 20 itens é uma solução simples e suficiente; em maior escala seria preferível reagendar o processamento através de uma fila.

## E se fossem 20.000 SKUs?

Para 20.000 SKUs, eu substituiria o estado e a fila em memória por componentes persistentes.

Uma possível evolução seria:

```text
API
 │
 ▼
Fila persistente
 │
 ├── Worker
 ├── Worker
 └── Worker
       │
       ▼
Rate limiter compartilhado
       │
       ▼
   /enrich
       │
       ▼
Estado persistente
       │
       ▼
Callback
```

As principais mudanças seriam:

- fila persistente, como Redis/BullMQ ou RabbitMQ;
- idempotência `run_id + seq` armazenada de forma persistente;
- estado dos lotes compartilhado entre instâncias;
- retries reagendados pela fila em vez de manter workers aguardando;
- controle de concorrência distribuído para continuar respeitando o limite do `/enrich`;
- mecanismo persistente para garantir a entrega do callback após a conclusão.

Adicionar mais workers por si só não resolveria o problema, pois o serviço de enriquecimento continua limitado a três requisições simultâneas.