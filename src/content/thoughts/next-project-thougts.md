---
title: "Was fehlt"
description: "Gedanken darüber, was als nächstes gebaut wird — und warum es kein weiteres Clean Architecture Projekt ist."
date: "2026-05-03"
readMin: 2
draft: false
---

Zwei Backend-Projekte hinter mir. Beide stark auf Clean Architecture ausgerichtet, beide stark auf Reliability-Patterns ausgerichtet. Ein drittes in derselben Form würde mich nicht viel lehren.

Also denke ich darüber nach, was tatsächlich fehlt. Drei Dinge stechen heraus:

Echtes Auth. Nicht OIDC für eine CI/CD-Pipeline — Auth-Flows innerhalb einer Applikation. JWT mit Refresh, Cookie-Auth für ein Frontend, OAuth2/OIDC gegen einen echten Provider, policy-based Authorization. Das, wo „eingeloggt ja/nein" nicht reicht und resource-based Checks anfangen, relevant zu werden.

Caching, das seinen Platz verdient. Redis als mehr als eine Checkbox — Output-Caching, Cache-Aside, und der Teil, über den niemand gerne redet: Invalidierung. Wenn sich eine Tenant-Config ändert, wenn eine Permission kippt, wenn ein Rate-Limit mitten im Betrieb angepasst wird.

Eine andere Architecture, mit Absicht. Modularer Monolith mit Vertical Slices innerhalb der Module. Nicht weil es trendy ist, sondern weil Clean Architecture ein drittes Mal Muskelgedächtnis wäre, kein Lernen.

Was ich nicht machen werde: MassTransit (ich will die Layer darunter verstehen, bevor ich zur Abstraktion greife), Event Sourcing (interessant, aber overkill für das, was ich demonstrieren will), oder jedem Punkt auf dem Roadmap des letzten Jahres nachlaufen. Drei tiefe Projekte schlagen sieben oberflächliche.

Domain noch offen. Wahrscheinlich etwas, wo Multi-Tenancy und Caching keine Dekoration sind — ein Feature-Flag-Service, oder eine Notes-API mit Sharing und Full-Text-Search. Die Technik ist in beiden Fällen dieselbe; was sich unterscheidet, ist die Geschichte, die ich später darüber erzählen kann.

Ein paar Tage sacken lassen, bevor ich committe.
