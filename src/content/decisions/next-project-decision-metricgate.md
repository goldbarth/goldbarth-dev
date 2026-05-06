---
title: "Was ich baue"
description: "Die Entscheidung, nachdem es ein paar Tage gesackt ist."
date: "2026-05-05T16:24:00"
readMin: 3
draft: false
---

Ein paar Tage sacken lassen, und die Antwort war schärfer als erwartet.

Es ist ein **Tenant-aware Quota- und Rate-Limiting-Backend**. Drei .NET Microservices: einer besitzt Plans und Tenant-Hierarchie, einer führt die Hot-Path-Enforcement gegen Redis aus, einer persistiert Usage-Events aus Kafka und liefert Reports. Arbeitstitel: **MetricGate**.

Das Interessante ist nicht die Domain — Quota-Enforcement ist gut verstandenes Terrain, jede API-Plattform hat irgendeine Version davon. Das Interessante ist **womit die Domain einen konfrontiert**. Echtes Auth, weil API-Keys, JWT für Admins, OIDC gegen Keycloak und **resource-based Authorization über eine Tenant-Hierarchie** in diesem System nicht optional sind. Echtes Caching, weil ein **sub-10ms Hot Path** gegen drei unterschiedliche Sources of Truth nicht ohne es funktioniert. Und echte Cache-Invalidierung — der schwierige Teil, der Teil, wo Redis Tag-Sets, Pub/Sub-Channels und TTL-Backstops koordinieren müssen, wenn **ein Reseller seine Sub-Tenants umstrukturiert und hundert gecachte Authorization-Entscheidungen auf einmal falsch werden**.

Das ist genau die Form, die ich gesucht hatte, und sie hat sich mit der Domain fast ohne Zwang gedeckt.

## Warum drei Services und kein modularer Monolith

Ich bin ehrlich: Am Anfang stand **der modulare Monolith als angenommene Architecture**, weil das der fehlende Teil war, den ich am meisten lernen wollte. Ein paar Stunden versucht, es zum Passen zu bringen — **es hat nicht gepasst**. Die drei Concerns innerhalb von MetricGate haben tatsächlich unterschiedliche Load-Profile, Failure-Modes und Skalierungsanforderungen. Plans ist konfigurationsintensiv, schreibselten. Enforcement ist latenz-kritisch und read-heavy. Usage ist write-heavy beim Ingest und query-heavy bei Reports. Sie in einen Deployable zu zwingen wäre **die falsche Entscheidung, verkleidet als architektonische Disziplin**.

Also baue ich es als **drei Microservices mit eigenen Datenbanken**, async via Kafka wo es async sein kann, sync HTTP nur wo der Hot Path es braucht. Der modulare Monolith kommt auf die Liste für ein anderes Projekt — eines, wo die Load-Profile tatsächlich dafür sprechen.

Das war die schwierigere Lektion der Woche: **Architecture folgt der Domain, nicht dem Lernziel**. Wenn das Ziel ist, etwas zu lernen, muss das Projekt trotzdem zuerst für sich selbst Sinn ergeben. Sonst ist es ein **Tutorial in Verkleidung**, und Reviewer können das riechen.

Dieselbe Logik gilt innerhalb jedes Services. Plans hat eine echte Domain — Tenant-Hierarchie mit Invarianten, Plan-Vererbung mit Constraints, API-Key-Lifecycle mit Grace Periods. Enforcement hat Token-Bucket-Semantik und Counter-Rollback-Regeln. Usage hat Aggregations-Logik. Also **Clean Architecture innerhalb jedes Services**, keine Vertical Slices. Einen anderen architektonischen Stil zu wählen, nur um anders zu sein als beim letzten Projekt, wäre genau die Art von **portfolio-getriebener Entscheidung, die ich bewusst vermeide**.

## Was drin ist, was draußen ist

**Die Auth-Oberfläche ist real.** JWT mit Refresh-Tokens, OAuth2/OIDC gegen Keycloak in Compose, policy-based Authorization für Role-Gates, **resource-based Authorization für den Tenant-Subtree**. API-Keys für externe Consumer, internes JWT für Service-to-Service. Cookie-Auth stand auf der ursprünglichen Liste und wurde auf V2 verschoben — das React-Admin-Frontend wird es natürlich einbeziehen.

**Das Caching ist real.** Plan-Resolution gecacht per API-Key, Tenant-Hierarchie gecacht per Tenant, Fixed-Window-Counter für monatliche Quotas, Token-Bucket via Lua-Script für Rate-Limits. **Drei Invalidierungsmechanismen** arbeiten zusammen: TTL als Backstop, Pub/Sub für Single-Key-Eviction, **tag-basierte Sets für Hierarchie-Kaskaden**. Ich habe das ADR dafür zuerst geschrieben, weil es der Teil ist, der mich **tatsächlich erschreckt hat**.

Ein kleines Detail, das mehr bedeutet als es klingt: **das Mediator-Pattern innerhalb jedes Services ist handgeschrieben**, nicht MediatR. Ungefähr dreißig Zeilen Code, keine Library-Dependency. Mit MediatR, das dieses Jahr kommerziell wurde, hat sich der Trade-off verschoben — für ein derart triviales Pattern **ist der Aufwand, es selbst zu schreiben, geringer als der Aufwand, eine Third-Party-Dependency zu tragen, die man nicht vollständig kontrolliert**. Es ist auch eine Chance, tatsächlich zu verstehen, was darunter liegt, statt es als Magie zu akzeptieren.

Was nicht drin ist: **ein Frontend in V1**, echte Abrechnung, Multi-Region, Schema-Registry, Kubernetes. Die meisten davon werden im V2-Scope leben oder einfach dauerhaft draußen bleiben. **Drei tiefe Dinge, nicht sieben oberflächliche** — dieser Teil des Denkens hat sich nicht geändert.

## Womit ich noch nicht sicher bin

**Counter-Strategie unter Grenzbedingungen.** Fixed-Window-Quotas erlauben Burst-Verdopplung an Monatsgrenzen — ein Tenant kann seinen Plan in der letzten Stunde eines Monats erschöpfen und wieder in der ersten Stunde des nächsten. Für eine production-grade Referenz, die noch vertretbar ist, ist der Trade-off im ADR dokumentiert, und Betreiber echter Plattformen akzeptieren ihn. Aber **ich habe die Zahlen unter anhaltender Last noch nicht tatsächlich durchgerechnet**. Das ist ein Phase-4-Problem, kein Problem von heute.

**Service-to-Service-Auth ist noch offen.** mTLS oder signiertes internes JWT, beides ist vertretbar, und ich werde die Entscheidung treffen, wenn ich in Phase 6 mit mehr Kontext als jetzt dort ankomme. ADR-009 ist dafür reserviert.

Der **12-Wochen-Zeitplan ist ambitioniert** für Einzelarbeit. Ich habe sechs Phasen mit expliziten „Was fällt raus, wenn Phase 4 überläuft"-Markierungen geplant. Das ist kein Pessimismus, das ist **mich im Voraus vom Haken lassen** — production-grade Scope plus Lernkurve plus Jobsuche macht 12 Kalenderwochen unrealistisch. Die tatsächliche verstrichene Zeit wird wahrscheinlich länger sein. **Es geht um das Projekt, nicht den Zeitplan.**

## Das Repo

[github.com/goldbarth/MetricGate](https://github.com/goldbarth/MetricGate). Im Moment hat es Scope (DE und EN), vier ADRs, den Milestone- und Issue-Plan und **keine einzige Zeile Production-Code**. Das kommt als nächstes. **Die Architecture muss vertretbar sein, bevor sie es wert ist, gebaut zu werden**, und sie aufzuschreiben war der Test, ob sie es tatsächlich war.

Phase 1 beginnt diese Woche.
