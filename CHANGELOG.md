# Changelog

Wszystkie istotne zmiany w tym projekcie są dokumentowane w tym pliku.
Format oparty na [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersjonowanie zgodne z [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

## [0.3.0] - 2026-11-19

Wersja dogania dokumentację API dpay (OpenAPI 1.6.0) i działa z obecnym API - nie wymaga nowego wydania API.
Parytet z SDK PHP `0.3.0`: wspólne wektory `tests/fixtures/api_vectors.json` (9 sum `ordered_body`, 3 podpisy
IPN, 8 łańcuchów i 4 body `server_trim`), golden 29/29 żądań bajtowo identycznych (body rejestracji w CZK z `currency_code` sprawdzone SDK PHP 0.3.0),
592/592 wartości odpowiedzi zgodne.

### Breaking

- **BREAKING** `refunds.checkAvailability()` zwraca `RefundAvailability` (niedostępny) zamiast rzucać błąd
  dla każdej odpowiedzi 4xx z kluczem `refund`, w tym 404 (transakcja nie istnieje, wcześniej `NotFoundError`)
  i 423 (zwrot przez BOK dpay). Przyczynę rozróżnia `httpStatus`. Rozstrzyga treść odpowiedzi, nie lista kodów.
  Nadal rzucają: 401 "Unauthorized request" (`AuthenticationError`), każda odpowiedź bez klucza `refund` - tak API
  odpowiada na 422 (walidacja) i 429 (limit zapytań) - oraz każde 5xx.
- **BREAKING** Waluta kwoty trafia do `currency_code`: `Money` w walucie innej niż PLN wysyła `currency_code`
  bez `currencyCode` (wcześniej np. `Money.of(49900, 'CZK')` rejestrowało 499.00 w walucie domyślnej serwisu).
  `currencyCode` (także obok `phoneNumber`) rzuca `DPayValueError`, gdy waluta różni się od waluty kwoty - dla
  MB WAY użyj `Money.of(grosze, Currency.EUR)` zamiast `Money.pln()`. Kwota w PLN bez jawnego kodu wysyła body
  jak dotąd (bez `currency_code`).
- **BREAKING** `constructIpnEvent()` / `dpay.ipn.constructEvent()` przyjmuje IPN `alias_update` (wcześniej rzucał
  `SignatureVerificationError` "Invalid IPN payload"). Przychodzi on na adres IPN, gdy rejestracja nie miała
  `aliasIpnUrl` - obsługa, która oznacza zamówienie jako opłacone bez sprawdzenia `isTransfer`, potraktowałaby
  zmianę aliasu (np. `ALIAS_DECLINED`) jak wpłatę. Dla `alias_update` `amount` jest puste, a `email`, `custom`
  i `attempt` to null/0 (te pola nie są podpisane).

### Added

- IPN `alias_update` (BLIK OneClick i płatności cykliczne): weryfikacja podpisu `sha256(id . hash . type . version)`,
  `IpnType.ALIAS_UPDATE`, `IpnEvent.isAliasUpdate` i `aliasUpdate` (`AliasUpdate`; stałe `AliasChangeType`,
  `IpnAliasType`, statusy z `RecurringAliasStatus`).
- `CardError` (`code`, `declineCode`, `declineMessage`): `CardPaymentError.cardError` z obiektu `error` odmowy
  karty oraz `ApiError.cardError` i `ApiError.transactionId` z pól `cardError` i `transactionId` błędu Payments
  API (np. odrzucone pobranie na zapisanej karcie).
- `dpay.payouts.list()` i `iterate()` (`POST /api/v1/pbl/withdraws`, filtry `dateFrom`, `dateTo`, `state`, `type`,
  strony do 200; nieznany filtr lub wartość złego typu rzuca `DPayValueError`) oraz `detailsFull()` (`POST /api/v1/pbl/withdraws/details/full`: nagłówek, sumy całego
  rozliczenia i pozycje z `paymentId`, `custom`, `ipksef`, strony do 500); typy `PayoutPage`, `PayoutListItem`,
  `PayoutSettlement`, `SettlementPosition`, `PageMeta` i stałe `PayoutState`, `PayoutType`.
- `PayoutDetails.currency` (z `currency_code`, PLN gdy go brak), `exportDate` i `isPaysafecard` (prawda tylko
  dla liczby całkowitej JSON `1`, jak `PayoutListItem.isDeclined`).
- `refunds.create({ messageId })` - nagłówek `DigitalPayments-PSP-Message-ID` (tytuł przelewu
  `dpay.pl zwrot {messageId}`, poza sumą kontrolną), stała `REFUND_MESSAGE_ID_HEADER`.
- `RegisteredPayment.multibanco` (`MultibancoReference`: encja, referencja, kwota, ważność) i `paidTransaction`
  (`RegisteredTransaction` z odpowiedzi "Transaction paid", statusy `RegisteredTransactionStatus`: pending, paid,
  captured, canceled).
- Typowane obiekty webhooków: `WebhookEvent.payment`, `refund`, `recurringPayment`, `payout` (`PaymentObject`,
  `RefundObject`, `RecurringPaymentObject`, `PayoutObject`), `Failure`, `DeclineCode` (22 kody odmów dpay),
  `FailureCategory` i stałe statusów (`PaymentObjectStatus`, `RefundObjectStatus`, `RecurringPaymentStatus`,
  `PayoutObjectStatus`, `RecurringSequence`, `RecurringCanceledBy`).
- `RecurringRetryResult.isSuccess` i `RetryRefusal` (kody `errors.retry` odmowy ponowienia).
- `Transaction.rate`, `minimalFee`, `permanentFee` i `urls` (`TransactionUrls`).
- `ApplePayParams.email` i `CardPaymentResult.applePayMerchantSession` (sesja ApplePayMerchantSession
  z `redirectText` odpowiedzi APPLE_PAY_INIT).
- `RateLimitError.reset` (nagłówek `X-RateLimit-Reset`), `Currency.USD` i `Currency.RON`, `isValidPolishIban()`.
- `tests/fixtures/api_vectors.json`: wektory IPN transfer, dcb i alias_update, sum list i szczegółów wypłat
  oraz `server_trim` (przycinanie łańcuchów przez API panelu: wejście, wysłane body, suma kontrolna).

### Changed

- Walidacja przed wysłaniem tego, co API i tak odrzuca (422 lub 400):
  - etykieta `registerBlikAlias` i `recurringRegistration` do 35 znaków (limit BLIK, wcześniej 50);
  - `mb_way_direct` wymaga kanału (`channel: '373'`) i `deviceInfo` z `browserJavaEnabled`;
  - kanał bezpośredni wymaga emaila, imienia i nazwiska płatnika oraz `acceptTos`; kanały `tester`, `paypal`,
    `installment` i `paysafecard` są odrzucane; pusty `channel` (`''`) jest wysyłany jak dotąd i oznacza brak
    kanału;
  - `phoneNumber` 9-15 znaków, `aliasIpnUrl` do 500 znaków;
  - `efaktura` nie łączy się z `blikCode`, `blikAlias`, `registerBlikAlias`, płatnościami cyklicznymi ani
    aliasami kart;
  - pozycja wypłaty (`payout.positions`): IBAN `PL` + 26 cyfr z poprawną sumą kontrolną mod 97 (spacje i małe
    litery dozwolone) i kwota powyżej 0.
- `ApiError.transactionId` przeniesione z `PaymentRejectedError` do klasy bazowej (bez zmiany zachowania).
- Pusty identyfikator transakcji w `refunds.create()`, `refunds.checkAvailability()` i `payments.details()`
  rzuca `DPayValueError` (`transaction_id must not be empty`) zamiast wysyłać żądanie, które API odrzuca kodem
  422; identyfikator, który nie jest łańcuchem, rzuca `DPayValueError` (`transaction_id must be a string`).

### Fixed

- Żądania API panelu (`/api/v1/pbl/*`: zwroty, `payments.details()`, `banks.forService()`, wypłaty) wysyłają
  i podpisują każdy łańcuch przycięty tak jak API (globalne `TrimStrings` Laravel 13, `Str::trim()`: białe znaki
  ASCII, NUL, spacje Unicode i znaki niewidoczne, np. U+00A0, U+200B, U+FEFF - 65 punktów kodowych, inny zbiór
  niż `String.prototype.trim()`) - wcześniej identyfikator transakcji, powód zwrotu, adres webhooka zwrotu, nazwa
  serwisu lub data filtra z takim znakiem na brzegu kończyły się 401 "Unauthorized request" (daty filtrów były
  przycinane tylko z białych znaków ASCII). Powód, z którego nic nie zostaje, jest wysyłany jako `""` (API liczy go
  jako pusty segment); pusta po przycięciu nazwa serwisu, identyfikator transakcji lub data filtra rzucają
  `DPayValueError`. Żądania API płatności (`api-payments`) bez zmian.
- `PayoutDetails.isDirectSettlement`, `isDeclined` i `PayoutListItem.isDeclined` są prawdziwe tylko dla liczby
  całkowitej JSON `1` (tak wysyła API) - wcześniej także np. dla `"1"`, `"1abc"` czy `true`.
- `refunds.create()` sprawdza zdarzenia webhooka przed identyfikatorem zwrotu (`messageId`), jak SDK PHP.

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
