# dpay Node.js SDK

Oficjalna biblioteka Node.js do integracji z API płatności [dpay.pl](https://dpay.pl).

## Wymagania

- Node.js 20 lub nowszy
- Zero zależności runtime
- Typy TypeScript dołączone do paczki - osobny pakiet `@types/*` nie jest potrzebny

## Instalacja

```bash
npm install @dpayglobal/dpay-node-sdk
```

Paczka jest budowana równolegle jako ESM i CJS, więc `import` i `require` działają
od razu, bez dodatkowej konfiguracji.

## Szybki start

```js
import { DPayClient, Money, TransactionType } from '@dpayglobal/dpay-node-sdk'

const dpay = new DPayClient({
  service: 'nazwa_serwisu',
  secretHash: 'twoj_secret_hash',
})

const payment = await dpay.payments.register({
  amount: Money.pln(1050),
  transactionType: TransactionType.TRANSFERS,
  urls: {
    success: 'https://twojsklep.pl/sukces',
    fail: 'https://twojsklep.pl/blad',
    ipn: 'https://twojsklep.pl/ipn',
  },
  description: 'Zamówienie #1234',
  custom: 'order-1234',
})

if (payment.redirectUrl !== null) {
  // przekieruj płatnika pod payment.redirectUrl
}
```

Adres `ipn` jest opcjonalny - bez niego IPN nie przychodzi, a wynik płatności dostajesz webhookiem.

## Płatności cykliczne

Rejestracja idzie razem z płatnością kodem BLIK klienta (kwota `0` - sama zgoda, więcej - opłata inicjalna).
Kolejne obciążenia wysyła Twój serwer, bez kodu.

```js
import { Money, RecurringModel, TransactionType } from '@dpayglobal/dpay-node-sdk'

const urls = { success: 'https://twojsklep.pl/sukces', fail: 'https://twojsklep.pl/blad' }

const registration = await dpay.payments.register({
  amount: Money.pln(0),
  transactionType: TransactionType.TRANSFERS,
  urls,
  blikCode: kodBlik,
  userAgent: req.headers['user-agent'],
  userIp: req.ip,
  recurringRegistration: {
    label: 'Abonament Premium',
    model: RecurringModel.O,
    termsUrl: 'https://twojsklep.pl/regulamin',
    alias: 'SUB-1234',
  },
})
registration.recurringAlias // 'SUB-1234'

const charge = await dpay.payments.register({
  amount: Money.pln(4999),
  transactionType: TransactionType.TRANSFERS,
  urls,
  recurringAlias: 'SUB-1234',
  description: 'Abonament Premium 10/2026',
})

const status = await dpay.recurring.status('SUB-1234') // status.status: ACTIVE, INACTIVE, UNREGISTERED, EXPIRED, DECLINED
const retry = await dpay.recurring.retry(charge.transactionId) // po odmowie, np. INSUFFICIENT_FUNDS
await dpay.recurring.cancel('SUB-1234', { reason: 'Rezygnacja klienta' })
```

Model `A` wymaga `frequency` (np. `1M`), `limitAmt`, `totLimitAmt` (w groszach), `initDate` i `expirationDate`;
model `O` nie przyjmuje częstotliwości ani limitów. SDK sprawdza to przed wysłaniem żądania.

Obciążenie wiąże alias z sumą kontrolną, a anulowanie ma własną sumę - SDK liczy obie.
Limity API: `status` do 60, `retry` i `cancel` do 30 zapytań na minutę (licznik wspólny z resztą API
płatności z tego adresu IP) - nie odpytuj statusu w pętli, wynik przychodzi webhookiem.

## Webhooki

Zdarzenia (`payment.succeeded`, `refund.failed`, `recurring_payment.canceled` i inne) są podpisane
(Standard Webhooks). **Weryfikuj je na surowych bajtach body**, przed parsowaniem JSON:

```js
import express from 'express'
import { SignatureVerificationError, WebhookVerifier } from '@dpayglobal/dpay-node-sdk'

app.post('/webhooks/dpay', express.raw({ type: 'application/json' }), (req, res) => {
  let event
  try {
    // sekret endpointu z panelu (whsec_...); w czasie rotacji tablica sekretów
    event = WebhookVerifier.constructEvent(req.body, req.headers, process.env.DPAY_WEBHOOK_SECRET)
  } catch (error) {
    if (error instanceof SignatureVerificationError) return res.status(400).end()
    throw error
  }

  if (event.type === 'payment.succeeded') {
    const payment = event.object // kwoty w groszach
  }
  res.status(200).end()
})
```

`constructEvent` przyjmuje body jako `Buffer` albo `string` i nagłówki jako obiekt Node (`req.headers`)
albo `Headers` (Next.js, Hono: `await request.text()` i `request.headers`). Deduplikuj zdarzenia po `event.id`.

Historię zdarzeń (np. po awarii endpointu) pobierzesz przez Events API:

```js
for await (const event of dpay.events.iterate({ types: ['payment.succeeded'] })) {
  // ...
}
```

Własny adres zdarzeń jednej płatności (podpisywany sekretem webhooków serwisu):

```js
import { WebhookTarget } from '@dpayglobal/dpay-node-sdk'

await dpay.payments.register({
  ...params,
  webhook: WebhookTarget.create('https://twojsklep.pl/webhooks', ['payment.succeeded', 'payment.failed']),
  reference: 'order-1234',
})
```

## Obsługa IPN

IPN przychodzi tylko wtedy, gdy podasz adres `ipn` w `urls`.

dpay uznaje IPN za dostarczony wyłącznie, gdy body odpowiedzi to dokładnie `OK`.
Kod HTTP nie jest sprawdzany. Zawsze porównaj kwotę z własnym zamówieniem -
payload IPN nie niesie waluty, więc `event.amount` to surowy string dziesiętny.

**Podpis liczy się z surowych bajtów żądania.** `express.json()` konsumuje strumień,
więc trasa IPN musi być zamontowana przed nim:

```js
import express from 'express'
import { DPayClient, IPN_ACK, SignatureVerificationError } from '@dpayglobal/dpay-node-sdk'

const app = express()
const dpay = new DPayClient({ service: 'moj_sklep', secretHash: process.env.DPAY_SECRET_HASH })

app.post('/ipn', express.raw({ type: '*/*' }), async (req, res) => {
  let event
  try {
    event = await dpay.ipn.constructEventFromRequest(req.body)
  } catch (error) {
    if (error instanceof SignatureVerificationError) return res.status(400).send('Invalid signature')
    throw error
  }

  if (event.isTransfer) {
    await oznaczZamowienieJakoOplacone(event.id, event.amount)
  }

  res.send(IPN_ACK)
})

app.use(express.json())
```

W Next.js (App Router) i Hono przekaż obiekt `Request` bezpośrednio:

```js
export async function POST(request) {
  const event = await dpay.ipn.constructEventFromRequest(request)
  return new Response(IPN_ACK)
}
```

## Zwroty

```js
import { Money, WebhookTarget } from '@dpayglobal/dpay-node-sdk'

await dpay.refunds.create({ transactionId: 'identyfikator-transakcji' })
await dpay.refunds.create({
  transactionId: 'identyfikator-transakcji',
  amount: Money.pln(500),
  reason: 'reklamacja',
})

// Odpowiedź oznacza przyjęcie zwrotu - wynik przychodzi zdarzeniem refund.succeeded / refund.failed
await dpay.refunds.create({
  transactionId: 'identyfikator-transakcji',
  amount: Money.pln(500),
  webhook: WebhookTarget.create('https://twojsklep.pl/webhooks/zwroty', ['refund.succeeded', 'refund.failed']),
})

const availability = await dpay.refunds.checkAvailability({ transactionId: 'identyfikator-transakcji' })
if (availability.isAvailable) {
  // ...
}
```

## Szczegóły transakcji i banki

```js
const transaction = await dpay.payments.details('identyfikator-transakcji')
transaction.isPaid
transaction.availableRefundAmount.toDecimal()
transaction.refunds

const banks = await dpay.banks.forService()
```

## Karty S2S

```js
import { CardData, CardEncryptor } from '@dpayglobal/dpay-node-sdk'

const publicKey = await dpay.cards.publicKey()
const encryptedCardData = new CardEncryptor().encrypt(
  new CardData({ pan: '4111111111111111', cvv: '123', expiry: '12/28' }),
  transactionId,
  publicKey,
)

// deviceInfo to fingerprint przeglądarki płatnika, patrz DeviceInfoParams
const result = await dpay.cards.payOtp(transactionId, { deviceInfo, encryptedCardData })

if (result.requiresThreeDsForm) {
  // zwróć result.threeDsFormHtml jako odpowiedź HTML
}
if (result.hasDccOffer) {
  const offer = result.dccOffer
}

// Preautoryzacja: pobranie (także częściowe) i anulowanie reszty; SDK dopina service i sumę kontrolną
await dpay.cards.capture(transactionId, { amount: Money.pln(2999) })
await dpay.cards.cancel(transactionId)
```

Klucz publiczny jest rotowany - pobieraj go przed każdą próbą płatności.

## Obsługa błędów

Wszystkie wyjątki SDK dziedziczą po `DPayError`.

```js
import { ApiError, DPayError, InvalidRequestError, TransportError } from '@dpayglobal/dpay-node-sdk'

try {
  const payment = await dpay.payments.register(params)
} catch (error) {
  if (error instanceof InvalidRequestError) {
    error.fieldErrors
  } else if (error instanceof ApiError) {
    error.httpStatus
    error.errorCode // np. CHECKSUM_REQUIRED, WEBHOOK_URL_INVALID
    error.reason // np. https_required przy WEBHOOK_URL_INVALID
  } else if (error instanceof TransportError) {
    // błąd sieci - status płatności nieznany, użyj payments.details()
  } else {
    throw error
  }
}
```

Każdy błąd niesie też pole `type` (na przykład `'invalid_request_error'`) - stabilny
dyskryminator do użycia w `switch`, gdy `instanceof` zawodzi.

| Wyjątek | Kiedy |
|---|---|
| `AuthenticationError` | 401 - niepoprawny lub brakujący checksum |
| `InvalidRequestError` | 400, 422 (np. `fieldErrors.retry` przy ponowieniu płatności cyklicznej) |
| `AccessDeniedError` | 403 |
| `NotFoundError` | 404 |
| `RateLimitError` | 429 |
| `ApiServerError` | 5xx |
| `PaymentRejectedError` | rejestracja odrzucona przy HTTP 200 (`errorCode`, `errorDescription`) |
| `CardPaymentError` | płatność kartą odrzucona przy HTTP 200 |
| `SignatureVerificationError` | niepoprawny podpis IPN lub webhooka, webhook spoza tolerancji czasu |
| `CardEncryptionError` | szyfrowanie danych karty nie powiodło się |
| `TransportError` | awaria sieci, timeout lub przerwanie przez `signal` |
| `DPayValueError` | niepoprawny argument - rzucany przed jakimkolwiek wywołaniem sieciowym |

## Konfiguracja

| Opcja | Typ | Opis |
|---|---|---|
| `service` | `string` | Nazwa Punktu Płatności z panel.dpay.pl (wymagane) |
| `secretHash` | `string` | Klucz Secret Hash (wymagane) |
| `timeout` | `number` | Timeout HTTP w milisekundach (domyślnie 30000) |
| `httpClient` | `HttpClient` | Własny transport (proxy, retry, testy) |
| `baseUrls` | `Record<string, string>` | Nadpisanie hostów `apiPayments`, `panel`, `gateway` |
| `onRequest` | `(context) => void` | Wywoływane przed każdym żądaniem - `checksum` i dane karty są już ukryte |
| `onResponse` | `(context) => void` | Wywoływane po każdej odpowiedzi, która dotarła do SDK |

## Anulowanie i timeouty

Każda metoda serwisu przyjmuje opcjonalny, ostatni argument `{ signal?, timeout? }`.

```js
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

await dpay.payments.details('identyfikator-transakcji', { signal: controller.signal })
```

Timeout jest w milisekundach i domyślnie wynosi 30000 (patrz konfiguracja). Wartość podana
per wywołanie nadpisuje go tylko dla tego jednego wywołania:

```js
await dpay.payments.details('identyfikator-transakcji', { timeout: 5000 })
```

`signal` i timeout są łączone - żądanie kończy się na to, co nastąpi pierwsze. Przerwanie
i przekroczenie czasu mapują się na `TransportError` z zachowanym `cause`.

## Testowanie integracji

```js
import { DPayClient, Money, TransactionType } from '@dpayglobal/dpay-node-sdk'
import { MockHttpClient } from '@dpayglobal/dpay-node-sdk/testing'
import assert from 'node:assert/strict'

const transport = new MockHttpClient()
transport.queueJson(200, { transactionId: 'tx-1', msg: 'https://secure.dpay.pl/pay/1' })

const dpay = new DPayClient({ service: 'test', secretHash: 'test', httpClient: transport })
const payment = await dpay.payments.register({
  amount: Money.pln(1050),
  transactionType: TransactionType.TRANSFERS,
  urls: {
    success: 'https://twojsklep.pl/sukces',
    fail: 'https://twojsklep.pl/blad',
    ipn: 'https://twojsklep.pl/ipn',
  },
})

assert.equal(transport.lastRequestBody.value, '10.50')
```

## Licencja

Apache-2.0
