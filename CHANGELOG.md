# Changelog

Wszystkie istotne zmiany w tym projekcie są dokumentowane w tym pliku.
Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie zgodne z [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

## [0.2.0] - wydanie razem z wdrożeniem API dpay

Wersja wymaga API dpay z tym samym wydaniem (wspólne API płatności cyklicznych, suma kontrolna capture
i anulowania kart). Zmiany łamiące zgodność są oznaczone jako **BREAKING**. Parytet z SDK PHP `0.2.0`
potwierdzony golden vectorami: 29/29 żądań bajtowo identycznych, 592/592 wartości odpowiedzi zgodne.

### Added

- `dpay.recurring` (`RecurringService`): `status()`, `retry()` i `cancel()` płatności cyklicznej
  (`/api/v1_0/payments/recurring/*`), modele `RecurringStatus`, `RecurringRegistrationInfo`, `RecurringRetryResult`
  i stałe `RecurringModel`, `RecurringMethod`, `RecurringAliasStatus`, `RecurringRetryStatus`.
- `payments.register({ recurringRegistration })` - rejestracja płatności cyklicznej (modele O, A i M, `termsUrl`
  wymagany) z kodem BLIK klienta.
- `payments.register({ recurringAlias })` - obciążenie zapisanej płatności cyklicznej bez kodu BLIK; alias wchodzi
  do sumy kontrolnej. `userAgent` i `userIp` są przy obciążeniu opcjonalnym kontekstem klienta (IP walidowane).
- Webhooki: `WebhookVerifier.constructEvent()` i `verify()` (Standard Webhooks, podpis `v1`, tolerancja czasu, kilka
  podpisów i sekretów w czasie rotacji; surowe body jako `string` albo `Buffer`, nagłówki jako `IncomingHttpHeaders`
  albo `Headers`), `WebhookEvent`, `WebhookEventType`.
- `dpay.events` (`EventService`): historia zdarzeń z filtrami, `list()` i `iterate()` (asynchroniczny iterator
  po stronach).
- `WebhookTarget` - własny adres zdarzeń w rejestracji płatności (`webhook`), zwrocie (`refunds.create({ webhook })`)
  i capture karty (`cards.capture(id, { amount, webhook })`); pole `reference` w rejestracji płatności.
- `ApiError.reason`, `PaymentRejectedError.errorDescription`, `RegisteredPayment.recurringAlias`
  i `recurringMethods`.
- `tests/fixtures/api_vectors.json` - wspólne wektory sum kontrolnych i podpisów webhooków wszystkich SDK dpay.

### Changed

- **BREAKING** `cards.capture()` i `cards.cancel()` wysyłają `service` i sumę
  `sha256(operacja|service|transaction_id|amount|hash)` - API odrzuca je bez sumy (401). `cards.capture()` wymaga
  kwoty: `cards.capture(id, { amount })`.
- **BREAKING** `ReturnUrls.ipn` jest opcjonalny; bez niego `url_ipn` nie jest wysyłany, a IPN nie przychodzi
  (wynik przychodzi webhookiem).
- Kod błędu API jest czytany z pola `code` (np. `CHECKSUM_REQUIRED`, `WEBHOOK_URL_INVALID`), potem z `errorcode`.
- Suma kontrolna API PBL (zwroty, szczegóły transakcji, banki, wypłaty) jest liczona z całego body, a obiekty
  zagnieżdżone (np. `webhook`) są spłaszczane w kolejności wysyłki.

### Removed

- **BREAKING** `blik.recurringStatus()`, typy `BlikRecurringStatus`, `BlikRecurringRegistrationInfo`,
  `BlikRecurringRegistrationParams` i pole `registerBlikRecurringAlias` - API usunęło te endpointy i pole; użyj
  `dpay.recurring` i `recurringRegistration`.
- **BREAKING** `BlikAliasType.PAYID` (aliasy OneClick są tylko `UID`), `TransactionType.BLIK_RECURRING`
  i `TransactionType.BIZUM_DIRECT` (API odrzuca je kodem 422).

### Deprecated

- `IpnType.CAPTURE`, `IpnEvent.isCapture` i `IpnEvent.capturePaymentId` - dpay nie wysyła już IPN typu `capture`;
  użyj zdarzenia `payment.captured`.

## [0.1.0] - 2026-07-22

Pierwsze wydanie. Parytet wire-protocol z SDK PHP `0.1.1` potwierdzony golden vectorami:
23/23 żądania bajtowo identyczne, 503/503 wartości odpowiedzi zgodne.
