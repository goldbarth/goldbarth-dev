---
title: "What's missing"
description: "Thinking about what to build next - and why it's not another clean architecture project."
date: "2026-05-03"
readMin: 2
draft: false
---

Two backend projects in. Both lean heavily on Clean Architecture, both lean heavily on reliability patterns. A third one in the same shape wouldn't teach me much.

So I'm thinking about what's actually missing. Three things stand out:

Real auth. Not OIDC for a CI/CD pipeline - auth flows inside an application. JWT with refresh, cookie auth for a frontend, OAuth2/OIDC against a real provider, policy-based authorization. The kind of thing where "logged in yes/no" isn't enough and resource-based checks start to matter.

Caching that earns its place. Redis as more than a checkbox - output caching, cache-aside, and the part nobody likes talking about: invalidation. When a tenant config changes, when a permission flips, when a rate limit gets adjusted mid-flight.

A different architecture on purpose. Modular monolith with vertical slices inside the modules. Not because it's trendy, but because doing Clean Architecture a third time would be muscle memory, not learning.

What I'm not going to do: MassTransit (I want to understand the layer below before reaching for the abstraction), event sourcing (interesting, but overkill for what I want to demonstrate), or chase every item on last year's roadmap. Three deep projects beat seven shallow ones.

Domain still open. Probably something where multi-tenancy and caching aren't decoration - a feature flag service, or a notes API with sharing and full-text search. The tech is the same either way; what differs is the story I can tell about it later.

Letting it sit for a few days before committing.