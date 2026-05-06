---
title: "What I'm building"
description: "The decision after sitting on it for a few days."
date: "2026-05-05T16:24:00"
readMin: 3
draft: false
---

A few days of letting it sit, and the answer turned out to be sharper than I expected.

It's a **tenant-aware quota and rate-limiting backend**. Three .NET microservices: one owns plans and tenant hierarchy, one runs the hot-path enforcement against Redis, one persists usage events from Kafka and serves reports. Working title: **MetricGate**.

The interesting part isn't the domain — quota enforcement is well-understood territory, every API platform has some version of it. The interesting part is **what the domain forces you to deal with**. Real auth, because API keys, JWT for admins, OIDC against Keycloak, and **resource-based authorization across a tenant hierarchy** aren't optional in this kind of system. Real caching, because a **sub-10ms hot path** against three different sources of truth doesn't work without it. And real cache invalidation — the hard part, the part where Redis tag sets, Pub/Sub channels, and TTL backstops have to coordinate when **a reseller restructures their sub-tenants and a hundred cached authorization decisions become wrong at once**.

That's the shape I wanted from the missing-piece list, and it lined up with the domain almost without forcing.

## Why three services and not a modular monolith

I'll be honest: I started this with **modular monolith as the assumed architecture**, because that was the missing piece I most wanted to learn. Spent a few hours trying to make it fit, and **it didn't**. The three concerns inside MetricGate have genuinely different load profiles, failure modes, and scaling needs. Plans is configuration-heavy, write-rare. Enforcement is latency-critical and read-heavy. Usage is write-heavy on ingest and query-heavy on reports. Forcing them into one deployable would be **the wrong call, dressed up as architectural discipline**.

So I'm building it as **three microservices with their own databases**, async via Kafka where it can be async, sync HTTP only where the hot path needs it. The modular monolith goes on the list for a different project — one where the load profiles actually argue for it.

This was the harder lesson of the week: **architecture follows the domain, not the learning goal**. If the goal is to learn something, the project still has to make sense on its own terms first. Otherwise it's a **tutorial in disguise**, and reviewers can smell that.

The same logic applies inside each service. Plans has a real domain — tenant hierarchy with invariants, plan inheritance with constraints, API key lifecycle with grace periods. Enforcement has token bucket semantics and counter rollback rules. Usage has aggregation logic. So **Clean Architecture inside each service**, not Vertical Slices. Picking a different architectural style just to be different from my last project would be exactly the kind of **portfolio-driven decision I'm trying to stop making**.

## What's in, what's out

**The auth surface is real.** JWT with refresh tokens, OAuth2/OIDC against Keycloak in Compose, policy-based authorization for role gates, **resource-based authorization for the tenant subtree**. API keys for external consumers, internal JWT for service-to-service. Cookie auth was on the original list and got pushed to V2 — the React admin frontend will pull it in naturally.

**The caching is real.** Plan resolution cached per API key, tenant hierarchy cached per tenant, fixed-window counters for monthly quotas, token bucket via Lua script for rate limits. **Three invalidation mechanisms** working together: TTL as backstop, Pub/Sub for single-key eviction, **tag-based sets for hierarchy cascades**. I wrote the ADR for this one first because it's the part that **actually scared me**.

A small detail that matters more than it sounds: **the mediator pattern inside each service is hand-written**, not MediatR. About thirty lines of code, no library dependency. With MediatR going commercial earlier this year, the trade-off shifted — for a pattern this trivial, **the cost of writing it yourself is lower than the cost of carrying a third-party dependency you don't fully control**. It's also a chance to actually understand what's underneath, instead of accepting it as magic.

What's not in: **a frontend in V1**, real billing, multi-region, schema registry, Kubernetes. Most of these will live in the V2 scope or just stay out for good. **Three deep things, not seven shallow ones** — that part of the thinking didn't change.

## What I'm not sure about yet

**Counter strategy under boundary conditions.** Fixed-window quotas allow burst doubling at month boundaries — a tenant can exhaust their plan in the last hour of one month and again in the first hour of the next. For a production-grade reference that's still defensible, the trade-off is documented in the ADR, and operators of real platforms accept it. But **I haven't actually run the numbers under sustained load yet**. That's a Phase 4 problem, not a today problem.

**Service-to-service auth is still open.** mTLS or signed internal JWT, both are defensible, and I'm going to make the call when I get there in Phase 6 with more context than I have now. ADR-009 is reserved for it.

The **12-week timeline is ambitious** for solo work. I planned six phases with explicit "what gets cut if Phase 4 overruns" markers. That's not pessimism, that's **letting myself off the hook in advance** — production-grade scope plus learning curve plus job search makes 12 calendar weeks unrealistic. Real elapsed time will probably be longer. **The point is the project, not the schedule.**

## The repo

[github.com/goldbarth/MetricGate](https://github.com/goldbarth/MetricGate). Right now it has scope (DE and EN), four ADRs, the milestone and issue plan, and **not a single line of production code**. That comes next. **The architecture has to be defensible before it's worth building**, and writing it down was the test for whether it actually was.

Phase 1 starts this week.
