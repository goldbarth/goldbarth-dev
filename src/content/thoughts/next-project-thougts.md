---
title: "Was fehlt"
description: "Gedanken darüber, was als nächstes gebaut wird - und warum es kein weiteres Clean Architecture Projekt ist."
date: "2026-05-03"
readMin: 2
draft: false
---

Zwei Backend-Projekte hinter mir. Beide stark auf Clean Architecture ausgerichtet, beide stark auf Reliability-Patterns. Ein drittes in derselben Form würde mir wenig beibringen.

Also überlege ich, was tatsächlich fehlt. Drei Dinge stechen heraus.

Echtes Auth. Bisher hatte ich OIDC für eine CI/CD-Pipeline, was etwas anderes ist als Auth-Flows innerhalb einer Applikation. JWT mit Refresh, Cookie-Auth für ein Frontend, OAuth2/OIDC gegen einen echten Provider, policy-based Authorization. Der Bereich, wo „eingeloggt ja/nein" nicht mehr reicht und resource-based Checks anfangen, relevant zu werden.

Caching, das seinen Platz verdient. Redis als mehr als eine Checkbox: Output-Caching, Cache-Aside, und Invalidierung. Der letzte Punkt macht die meiste Arbeit. Wenn sich eine Tenant-Config ändert, wenn eine Permission kippt, wenn ein Rate-Limit mitten im Betrieb angepasst wird.

Eine andere Architecture, mit Absicht. Modularer Monolith mit Vertical Slices innerhalb der Module. Clean Architecture ein drittes Mal wäre bei mir Muskelgedächtnis geworden, und Muskelgedächtnis ist nicht das, wonach ich gerade suche.

Was ich weglasse: MassTransit, weil ich die Layer darunter verstehen will, bevor ich zur Abstraktion greife. Event Sourcing, weil es interessant ist, aber mehr wäre, als dieses Projekt trägt. Und den Rest meiner Roadmap aus dem letzten Jahr, weil mir drei Dinge in der Tiefe mehr bringen als sieben an der Oberfläche.

Domain noch offen. Wahrscheinlich etwas, wo Multi-Tenancy und Caching keine Dekoration sind. Ein Feature-Flag-Service, oder eine Notes-API mit Sharing und Full-Text-Search. Die Technik ist in beiden Fällen dieselbe. Was sich unterscheidet, ist die Geschichte, die ich später darüber erzählen kann.

Ein paar Tage sacken lassen, bevor ich committe.
