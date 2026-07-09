---
title: "Was ich baue"
description: "Die Entscheidung, nachdem es ein paar Tage gesackt ist."
date: "2026-05-05T16:24:00"
readMin: 3
draft: false
---

Ein paar Tage sacken lassen, und die Antwort kam klarer heraus, als ich erwartet hatte.

Es wird ein tenant-aware Quota- und Rate-Limiting-Backend. Drei .NET Microservices: einer besitzt Plans und Tenant-Hierarchie, einer führt die Hot-Path-Enforcement gegen Redis aus, einer persistiert Usage-Events aus Kafka und liefert Reports. Arbeitstitel: MetricGate.

Die Domain selbst ist nicht das Interessante. Quota-Enforcement ist gut verstandenes Terrain, jede API-Plattform hat irgendeine Version davon. Interessant ist, womit die Domain einen konfrontiert. Auth wird konkret, weil API-Keys, JWT für Admins, OIDC gegen Keycloak und resource-based Authorization über eine Tenant-Hierarchie hier zusammenkommen. Caching wird konkret, weil ein Hot Path unter 10 ms gegen drei unterschiedliche Sources of Truth ohne Cache nicht funktioniert. Und Cache-Invalidierung wird der schwierige Teil, sobald Redis Tag-Sets, Pub/Sub-Channels und TTL-Backstops koordinieren müssen, weil ein Reseller seine Sub-Tenants umstrukturiert und hundert gecachte Authorization-Entscheidungen auf einmal falsch werden.

Das ist genau die Form, die ich gesucht hatte, und sie hat sich mit der Domain fast ohne Zwang gedeckt.

## Warum drei Services und kein modularer Monolith

Angefangen bin ich mit dem modularen Monolithen als angenommener Architecture, weil das der fehlende Teil war, den ich am meisten lernen wollte. Ein paar Stunden lang habe ich versucht, ihn zum Passen zu bringen. Er hat nicht gepasst. Die drei Concerns innerhalb von MetricGate haben tatsächlich unterschiedliche Load-Profile, Failure-Modes und Skalierungsanforderungen. Plans ist konfigurationsintensiv und schreibselten. Enforcement ist latenz-kritisch und read-heavy. Usage ist write-heavy beim Ingest und query-heavy bei Reports. Sie in einen Deployable zu zwingen, hätte dem Projekt geschadet und dabei nach architektonischer Disziplin ausgesehen.

Also baue ich drei Microservices mit eigenen Datenbanken, async via Kafka wo es async sein kann, sync HTTP nur wo der Hot Path es braucht. Der modulare Monolith kommt auf die Liste für ein anderes Projekt, eines, wo die Load-Profile tatsächlich dafür sprechen.

Das war die schwierigere Lektion der Woche. Die Architecture folgt der Domain und nicht dem Lernziel. Wenn das Ziel ist, etwas zu lernen, muss das Projekt trotzdem zuerst für sich selbst Sinn ergeben. Sonst baut man ein Tutorial, das so tut, als wäre es ein System.

Dieselbe Logik gilt innerhalb jedes Services. Plans hat eine echte Domain: Tenant-Hierarchie mit Invarianten, Plan-Vererbung mit Constraints, API-Key-Lifecycle mit Grace Periods. Enforcement hat Token-Bucket-Semantik und Counter-Rollback-Regeln. Usage hat Aggregations-Logik. Also Clean Architecture innerhalb jedes Services, keine Vertical Slices. Einen anderen architektonischen Stil zu wählen, nur um anders zu sein als beim letzten Projekt, wäre eine Entscheidung fürs Portfolio statt fürs Projekt.

## Was drin ist, was draußen ist

Die Auth-Oberfläche ist vollständig. JWT mit Refresh-Tokens, OAuth2/OIDC gegen Keycloak in Compose, policy-based Authorization für Role-Gates, resource-based Authorization für den Tenant-Subtree. API-Keys für externe Consumer, internes JWT für Service-to-Service. Cookie-Auth stand auf der ursprünglichen Liste und wandert nach V2, wo das Admin-Frontend es ohnehin braucht.

Das Caching ebenso. Plan-Resolution gecacht per API-Key, Tenant-Hierarchie gecacht per Tenant, Fixed-Window-Counter für monatliche Quotas, Token-Bucket via Lua-Script für Rate-Limits. Drei Invalidierungsmechanismen arbeiten zusammen: TTL als Backstop, Pub/Sub für Single-Key-Eviction, tag-basierte Sets für Hierarchie-Kaskaden. Das ADR dafür habe ich zuerst geschrieben, weil dieser Teil mir am meisten Respekt eingeflößt hat.

Ein kleines Detail, das mehr bedeutet, als es klingt: das Mediator-Pattern innerhalb jedes Services ist handgeschrieben, ungefähr dreißig Zeilen Code, ohne Library-Dependency. Seit MediatR dieses Jahr kommerziell geworden ist, hat sich der Trade-off für mich verschoben. Bei einem derart kleinen Pattern kostet es mich weniger, es selbst zu schreiben, als eine Third-Party-Dependency zu tragen, die ich nicht kontrolliere. Es ist außerdem eine Gelegenheit zu verstehen, was darunter liegt.

Nicht drin sind ein Frontend in V1, echte Abrechnung, Multi-Region, Schema-Registry und Kubernetes. Das meiste davon landet im V2-Scope oder bleibt dauerhaft draußen. Ich will lieber drei Dinge in der Tiefe bauen als sieben an der Oberfläche, und daran hat sich nichts geändert.

## Womit ich noch nicht sicher bin

Die Counter-Strategie unter Grenzbedingungen. Fixed-Window-Quotas erlauben Burst-Verdopplung an Monatsgrenzen, ein Tenant kann seinen Plan in der letzten Stunde eines Monats erschöpfen und wieder in der ersten Stunde des nächsten. Der Trade-off ist im ADR dokumentiert, und Betreiber echter Plattformen akzeptieren ihn. Durchgerechnet habe ich die Zahlen unter anhaltender Last aber noch nicht. Das ist ein Phase-4-Problem, kein Problem von heute.

Service-to-Service-Auth ist ebenfalls offen. mTLS oder signiertes internes JWT, beides ist vertretbar. Ich treffe die Entscheidung in Phase 6, wenn ich mehr Kontext habe als jetzt. ADR-009 ist dafür reserviert.

Der 12-Wochen-Zeitplan ist für Einzelarbeit ambitioniert. Ich habe sechs Phasen geplant, jede mit einer expliziten Markierung, was rausfällt, wenn Phase 4 überläuft. Das ist kein Pessimismus, sondern der Versuch, mich im Voraus vom Haken zu lassen. Production-grade Scope plus Lernkurve plus Jobsuche passt nicht in 12 Kalenderwochen. Die tatsächliche Zeit wird länger sein, und das ist in Ordnung. Es geht um das Projekt.

## Das Repo

[github.com/goldbarth/MetricGate](https://github.com/goldbarth/MetricGate). Im Moment liegen dort Scope (DE und EN), vier ADRs, der Milestone- und Issue-Plan und keine einzige Zeile Production-Code. Der kommt als Nächstes. Die Architecture aufzuschreiben war für mich der Test, ob sie trägt, bevor ich anfange, sie zu bauen.

Phase 1 beginnt diese Woche.
