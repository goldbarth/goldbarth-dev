---
title: "Idempotency Key Strategy"
description: "Deterministische Idempotency Keys für eine Import-Pipeline entwerfen — warum SHA256 über File-Content, was der Unique Index durchsetzt und wie HTTP-Clients davon profitieren."
date: "2026-05-02"
readMin: 3
draft: false
---

Import-Pipelines und Retries sind untrennbar. Netzwerke fallen aus. Clients haben Timeouts und retrien. Ops-Teams reichen Dateien erneut ein. Ohne Idempotency erstellt jeder Retry einen doppelten Job. Mit ihr sind Retries standardmäßig sicher.

## Das Key-Format

Ingestor berechnet Idempotency Keys als:

```
"{supplierCode}:{SHA256(fileBytes)}"
```

Beispiel: `"ACME:a3f8c2...d91b"`

Zwei Komponenten, jede mit einer spezifischen Aufgabe:

**`SHA256(fileBytes)`** identifiziert den File-Content. Gleiche Bytes, gleicher Hash. Wenn ein Client dieselbe Datei zweimal hochlädt — andere Verbindung, anderer Timestamp, anderer Dateiname — ist der Hash identisch. Der Datenbank-Unique-Index lehnt das zweite Insert ab und gibt den bestehenden Job zurück.

**`supplierCode`** begrenzt den Hash auf einen Supplier. Zwei Supplier können legitimerweise identischen Content hochladen (eine gemeinsame Template-Datei, zum Beispiel). Ohne den Supplier-Scope würden ihre Jobs kollidieren. Mit ihm sind `ACME:a3f8...` und `GLOBEX:a3f8...` unterschiedlich.

## Warum kein Client-provided Key

Die Alternative ist, den Client den Idempotency Key als Request-Header bereitstellen zu lassen. Manche APIs tun das — Stripe zum Beispiel. Der Vorteil ist explizite Client-Kontrolle: Der Client entscheidet, was als „derselbe Request" gilt.

Für eine Import-Pipeline wollte ich, dass der Key aus dem Content abgeleitet wird, nicht vom Client behauptet. Ein client-seitig bereitgestellter Key kann falsch sein — gleicher Key, anderer File-Content. Content-abgeleitete Keys sind immer korrekt: gleicher Content bedeutet gleicher Job, unabhängig davon, was der Client sagt.

Der Trade-off: Clients können kein Re-Import derselben Datei mit einem neuen Key erzwingen. Wenn der Content einer Datei neu verarbeitet werden muss (Datenkorrektur, Bug-Fix), muss sich die Datei selbst ändern. Das ist eine bewusste Einschränkung.

## Durchsetzen auf Datenbankebene

Die Idempotency-Prüfung findet an zwei Stellen statt:

1. **Application Layer** — der `CreateImportJobHandler` prüft vor dem Insert auf einen bestehenden Job. Falls gefunden, gibt er HTTP 200 mit der ID und dem Status des bestehenden Jobs zurück.

2. **Datenbank-Unique-Index** — ein Unique Constraint auf `idempotency_key` fängt concurrent Requests ab, die an der Application-Prüfung vorbeirennen. Das zweite Insert schlägt mit einer Unique-Constraint-Verletzung fehl, die der Handler fängt und in dieselbe HTTP-200-Response umwandelt.

```sql
CREATE UNIQUE INDEX uq_import_jobs_idempotency_key
ON import_jobs (idempotency_key);
```

Die Doppelprüfung ist wichtig. Ohne den Datenbank-Constraint könnten zwei concurrent Requests für dieselbe Datei beide die Application-Prüfung bestehen (bevor einer von beiden committed hat), was zu doppelten Jobs führt. Mit ihm gewinnt nur einer.

## Was der Client sieht

Eine doppelte Einreichung gibt HTTP 200 mit dem State des ursprünglichen Jobs zurück — kein 409 Conflict, kein 422. Der Client bekommt eine gültige Response mit einer Job-ID, mit der er den Status prüfen kann. Aus Sicht des Clients war der Upload erfolgreich; er war zufällig ein No-op.

Das macht Retry-Logik auf der Client-Seite trivial: hochladen, Job-ID bekommen, Status pollen. Retries bei Netzwerkfehlern sind sicher. Versehentliche Doppeleinreichungen sind sicher. Die Pipeline absorbiert sie still.

## Grenzen

SHA256 über rohe File-Bytes ist schnell genug für Delivery-Advice-Dateien (typischerweise unter einigen MB). Für sehr große Dateien würde man einen Streaming-Read hashen wollen, statt den gesamten Payload zuerst in den Speicher zu laden. Ingestor lädt den vollständigen Payload ohnehin für die Validation, also ist das kein praktisches Problem bei der aktuellen Größe.

Das Design geht auch davon aus, dass der File-Content die kanonische Identität ist. Wenn derselbe physische Content mehrfach verarbeitbar sein soll (Batch-Reprocessing, Korrekturen), ist eine andere Keying-Strategie nötig — time-scoped Keys, explizite Versionsfelder oder client-kontrollierte Keys mit Content-Validierung.
