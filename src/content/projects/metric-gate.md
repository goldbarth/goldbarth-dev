---
title: "MetricGate"
description: "Tenant-aware Quota- und Rate-Limiting-Backend für SaaS-APIs. Drei .NET 10 Microservices mit Redis, Redpanda und Keycloak — V1 released."
date: "2026-06-03"
draft: false
---

> V1 (Backend) released — drei Services, vollständig getestet und dokumentiert. V2 (Frontend mit Angular) in Arbeit — BFF Foundation läuft.

## Was es ist

MetricGate ist ein tenant-aware Quota- und Rate-Limiting-Backend für SaaS-APIs. Drei unabhängig deploybare .NET 10 Services setzen Planlimits in Echtzeit durch, persistieren Nutzungsereignisse für Billing und Audit und unterstützen mehrstufige Tenant-Hierarchien (Root, Reseller, Customer).

Drei Services, drei PostgreSQL-Datenbanken, ein Redis, ein Redpanda-Cluster (Kafka API), ein Keycloak-Realm — orchestriert lokal via Docker Compose.

```
                ┌──────────────────────────┐
                │    API Consumer (ext.)   │
                └────────────┬─────────────┘
                             │ API Key
                             ▼
                ┌──────────────────────────┐
                │   Enforcement Service    │  ◄── Redis (Counters, Plan Cache, Sessions)
                │   - Hot-path Check API   │
                │   - Token Bucket / Win.  │
                └─────┬──────────────┬─────┘
                      │              │
              HTTP    │              │  Kafka: usage.events
          (Cache Miss)│              │
                      ▼              ▼
                ┌──────────────┐   ┌──────────────────────────┐
                │    Plans     │   │     Usage Service        │
                │   Service    │   │   - Event Persistence    │
                │              │   │   - Aggregation Worker   │
                └─────┬────────┘   │   - Reports API (Admin)  │
                      │            └──────────────────────────┘
                      │
        Kafka: plans.changes (Broadcast)
                      │
                      └─► Enforcement (Cache Invalidation)
                      └─► Usage       (Denormalized Lookups)
```

## Problem / Motivation

Rate Limiting und Quota Enforcement klingen nach gelösten Problemen — bis man anfängt, die Grenzfälle durchzudenken: Was passiert, wenn ein Reseller die Limits seiner Sub-Tenants erhöht und alle ihre gecachten Plan-Resolutions ungültig werden? Wie schreibt man einen Redis-Counter atomar, ohne eine Race Condition unter Last zu erzeugen? Wie garantiert man, dass eine Nutzungsevent-Message den Consumer erst erreicht, nachdem die Database-Transaction committed ist?

Die Kombination aus Tenant-Hierarchie, Cache-Invalidierungskaskaden, Kafka-Delivery-Semantik und OIDC-basierter Resource-Authorization erzeugt genug Komplexität, dass jedes Pattern eine echte Rechtfertigung braucht. Das ist der Punkt des Projekts.

## Architecture / Wichtige Entscheidungen

Jeder Service folgt intern Clean Architecture (Domain, Application, Infrastructure, API). Die Domain-Logik in jedem Service — Hierarchie-Invarianten im Plans Service, Counter-Semantik im Enforcement Service, Aggregationsregeln im Usage Service — rechtfertigt den Layering-Overhead gegenüber einem Slice-basierten Ansatz.

Synchrone Kommunikation nur auf dem Cache-Miss-Pfad (Enforcement → Plans). Alles andere fließt asynchron via Kafka.

**Caching-Strategie:**

| Cache             | Zweck                                       | Invalidierung                                     |
|-------------------|---------------------------------------------|---------------------------------------------------|
| Plan Resolution   | API Key → Tenant + effektiver Plan + Limits | TTL + Pub/Sub auf `plans.changes`                 |
| Quota Counter     | Fixed-Window `INCR` pro Tenant pro Periode  | TTL aligned to Window Expiry                      |
| Rate-Limit Bucket | Token-Bucket-State pro Tenant               | Atomic Mutation via Lua Script                    |
| Tenant Hierarchy  | Resolved Parent Chains                      | Tag-basierte Kaskade auf `TenantHierarchyChanged` |

Der nicht-triviale Fall ist die Hierarchie-Kaskade: ein einzelnes `TenantHierarchyChanged`-Event invalidiert Plan-Resolutions, Hierarchy-Caches und Authorization-Decisions über einen gesamten Sub-Tree. Tag-basierte Eviction via Redis Sets.

**Authentication:**

| Caller                | Mechanismus                                       |
|-----------------------|---------------------------------------------------|
| Externer API Consumer | API Key im Header                                 |
| Tenant Admin          | OIDC (Keycloak) → JWT mit Refresh                 |
| Service-to-Service    | Internes JWT (Enforcement → Plans auf Cache Miss) |

**Kein Mediator:** Application Services werden direkt injiziert — kein MediatR-Overhead, kein Magic. ([ADR-005](https://github.com/goldbarth/MetricGate/blob/main/docs/adrs/005-mediator-abstraction.md))

Alle Architekturentscheidungen sind als ADRs dokumentiert: [`docs/adrs/`](https://github.com/goldbarth/MetricGate/tree/main/docs/adrs).

**Performance (BenchmarkDotNet):** p95 Cache-Hit: **109 µs** (91× unter 10 ms Ziel); Latenz bei 50 Concurrent: **4 µs/Request** — Details: [`docs/benchmarks.md`](https://github.com/goldbarth/MetricGate/blob/main/docs/benchmarks.md).

→ [SELECT FOR UPDATE bei konkurrenten Tree-Mutationen](/decisions/select-for-update-tree-mutations)  
→ [Integrationstests mit Testcontainers](/decisions/integration-tests-testcontainers)  
→ [Redis Lua & atomare Ops](/decisions/redis-lua-and-atomar-ops)  
→ [KI-gestützte Entwicklung: gemessene Aufwandsrechnung](/decisions/ai-assisted-development-metric-gate)

## Entwicklungsstand

### M1: Plans Foundation — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Solution-Struktur, Plans-Schema, Tenant-Hierarchie (Adjacency List mit begrenzter Tiefe), Plan-Definitionen und -Zuweisungen, API Key Management, OIDC-Integration mit Keycloak, Policy-based und Resource-based Authorization.

18 Issues geschlossen

### M2: Plans Lifecycle & Events — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

API Key Rotation mit Grace Period, Tenant Move mit Hierarchie-Validierung, Outbox Pattern für zuverlässiges Kafka Publishing, `plans.changes`-Broadcast.

8 Issues geschlossen

### M3: Enforcement & Caching — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Check API (Hot-Path: *ist dieser API Key für diesen Call erlaubt?*), Redis Plan Cache mit TTL, Pub/Sub-basierte Cache-Invalidierung auf `plans.changes`, tag-basierte Eviction bei Hierarchie-Änderungen.

9 Issues geschlossen

### M4: Counters & Rate Limits — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Fixed-Window-Counter für monatliche Quotas, Token Bucket via Redis Lua Script für kurzfristige Rate Limits, Usage Event Publishing.

7 Issues geschlossen

### M5: Usage Service — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Kafka Consumer, Event Persistence mit Idempotency-Dedup-Window, Aggregation Worker, Reports API.

10 Issues geschlossen

### M6: Hardening & Documentation — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Trace Propagation, Failure Tests, Edge Cases, Runbook, README finalisieren.

9 Issues + 5 follow-ups geschlossen

---

## V2: Angular Frontend

### M7: BFF Foundation — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Duende.BFF als serverseitiger Auth-Proxy, OIDC Login/Logout gegen Keycloak, silent Token Refresh server-seitig, CSRF/Antiforgery-Schutz, Internal-JWT-Edge-Auth BFF → Plans, same-origin Serving des Angular Bundles.

7 Issues geschlossen

### M8: Angular Scaffold & Hierarchy — <span style="color:oklch(0.55 0.09 75)">abgeschlossen</span>

Angular 21 Scaffold (zoneless, signal-first), Auth Guard gegen BFF-Session, Login/Logout Wiring, Subtree-Laden via `httpResource`, Subtree-Navigation UI, Tenant-Erstellung mit Hierarchie-Validierung, BFF User-Authorization (Roles + Subtree).

7 Issues geschlossen

### M9: Move & Plans — <span style="color:oklch(0.80 0.13 75)">aktiv</span>

Tenant Move UI, Plan Definition Create/Edit, Plan Assignment mit Ceiling-Check, Overbooking Warning als non-blocking Notice, Plan-Vererbung entlang der Hierarchie visualisieren.

5 Issues

### M10: Check-Path Demo Widget — <span style="color:oklch(0.6 0 0)">ausstehend</span>

Demo API Key Seed in Keycloak Realm, `/check` Counter Remaining State, Demo Widget gegen `/check`, Live Request-History via RxJS Stream.

4 Issues

### M11: Hardening & Documentation — <span style="color:oklch(0.6 0 0)">ausstehend</span>

BFF Auth-Flow Integrationstests, UI Error-Path Coverage, README und Dokumentations-Update.

3 Issues