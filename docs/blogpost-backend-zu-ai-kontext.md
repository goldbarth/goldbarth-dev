# Blogpost "Vom Backend Richtung AI/LLM Engineering" - Arbeitsstand

Kontext-Übergabe für einen neuen Chat.
Der Post ist eine Reflexion für Felix selbst, und damit andere die Entwicklung und Motivation nachvollziehen können.

## Regeln, die vorher gelten

Maßstab für den Ton sind ausschließlich `~/.claude/CLAUDE.md`, `~/VOICE.md` und `~/OPINIONS.md`.
Nicht an bestehenden Blogposts im Repo orientieren, weder am Ton noch an Aufbau- oder Schlussmustern.
Die alten Posts sind der Stil, von dem Felix bewusst weg will.
`src/content/thoughts/working-with-it.md` ist das Gegenbeispiel: viel Fettschrift, urteilende Pointen wie "Beides altert schlecht" und "Angst verkleidet als Plan".
VOICE.md führt genau diese Sätze als abschreckende Beispiele.

Der praktische Test für jeden Satz ist der Aufenthaltsraum-Test aus VOICE.md.
Wenn ein Satz ein Gespräch unter Kollegen abrupt beenden würde oder unecht klingt, gehört er nicht in den Text.
Verdichten statt verurteilen.
Kaum Fettschrift.
Keine Ehrlichkeits-Signale wie "um ehrlich zu sein".
Keine Em-Dashes, nur Hyphens.

## Die These

AI Engineering ist kein Bruch mit Backend Engineering.
Es ist Backend Engineering, bei dem eine nichtdeterministische Komponente am Rand sitzt.
Der Grund zu wechseln ist nicht, dass das Alte langweilig wurde, sondern dass am Rand dieses Systems eine Klasse von Problemen auftaucht, die es vorher nicht gab.

Der Beleg dafür steckt in Felix' eigenem RAG-ADR (`src/content/decisions/semantic-ticket-search-rag.md`).
Das Feature bestand zu vier Fünfteln aus Backend-Entscheidungen: wo die Vektoren wohnen, ob der Schreibpfad eine Netzwerk-Abhängigkeit bekommt, was Eventual Consistency kostet, ob ein Index sich lohnt.
Genau eine Frage darin war wirklich neu: wer entscheidet, wann gesucht wird.

Das eine wirklich neue Problem: Ein Tool, das eine leere Trefferliste zurückgibt, sagt dem Modell "es gibt keine Duplikate".
Das Modell gibt das an den Nutzer weiter, obwohl niemand nachgesehen hat.
Deshalb sagt das Tool stattdessen "nicht verfügbar in diesem Deployment".
Result-Pattern, State Machine, Idempotency Keys und `select for update` setzen alle voraus, dass ein korrekt ausgeführter Aufruf ein korrektes Ergebnis liefert.
Bei einem Sprachmodell meldet sich der Fehler nicht, er formuliert sich aus.

## Die Konstante im Werdegang

Nicht "mein Interesse wandert".
Das ist die Lesart, die nach Launenhaftigkeit klingt, und sie stimmt nicht.

Zwei Konstanten, ohne Jahreszahl:
Felix will wissen, was eine Ebene tiefer passiert.
Und er baut Werkzeuge, die anderen Arbeit abnehmen.

Drei Belege:
Im Studium hat ihn weniger Gameplay interessiert als die Frage, was die Engine eigentlich macht.
In der Anstellung hat er Tools für das Art Department gebaut, um den Workflow der Artists zu verbessern.
In ServiceDeskLite hat er einen Assistenten integriert, der dem Team Arbeit abnimmt.

Was sich ändert, ist nie das Motiv, sondern die Ebene.
Engine, dann System, dann Backend, jetzt AI.

## Was bewusst nicht in den Post kommt

Das Alter (43) kommt nirgends vor.
Es steht zwar in OPINIONS.md, hat aber keinen Bezug zum Thema und keinen Nutzen für Felix.

Das Vor-Programmier-Leben kommt nicht vor: Fahrradkurier, Designstudium, Tätowierer.
Auch nicht als Nebensatz.

Kindheit, Therapie und persönliche Schicksalsschläge kommen nicht vor.
VOICE.md zieht diese Linie klar: Privates bleibt draußen, fachliche Offenheit ist davon ausgenommen.

Der ursprüngliche Grund "KI ist nicht mehr wegzudenken und wird eine immer größere Rolle spielen" ist gestrichen.
Den Satz schreibt gerade jeder, und er sagt nichts über Felix.

Der ursprüngliche Grund "ein reines Backend wird mir zu eintönig" wird nicht so formuliert.
Er liest sich als "mir war langweilig" und verletzt Felix' eigene Linie aus OPINIONS.md: "Ich verurteile das nicht und rede niemanden schlecht."
Was Felix ablehnt, ist Stillstand, nicht Backend.

Ein Unsicherheits-Abschnitt am Ende ist gestrichen.
Der Post beantwortet die Frage "warum", und darauf antwortet man mit Gründen und einem Beleg, nicht mit einer angehängten Selbstbefragung.
Der Post endet auf einer Position.

## Was in den Post kommt

Der Science-Fiction-Bezug bleibt, in genau einem Satz, unaufgeregt.
Felix' Formulierung sinngemäß: so kann er in der Zukunft leben und ein Teil davon sein.
Das ist der einzige Satz an der Stelle, den nur er schreiben kann, und er ersetzt den gestrichenen Grund.

Der Auslöser war nicht ein Moment, sondern die dauerhafte binäre Diskussion in den Medien.
Sie hat Felix zuerst verunsichert, und zwar durch Medien, nicht durch eigene Erfahrung.
Gleichzeitig ist als Science-Fiction-Fan das Interesse gewachsen.
Daraus folgte der Entschluss, eigene Erfahrung zu machen und AI nicht nur zu nutzen, sondern zu entwickeln.
Als der AI-Assistent in ServiceDeskLite lief und benutzbar war, war die Sache klar.

Der Stack-Punkt, falls er gebraucht wird, lautet nicht "mir fehlt Erfahrung", sondern:
Die WPF-Legacy-Projekte im Beruf haben den Stack nicht auf dem aktuellen Stand gehalten.
Deshalb hat Felix sich den modernen Stack in sechs Monaten selbst erarbeitet.

## Gerüst

1. Einstieg über das "nicht verfügbar"-Tool aus ServiceDeskLite. Der Leser ist im Thema, bevor das Wort Karriere fällt.
2. Rückblick: eine Ebene tiefer wollen, Werkzeuge bauen. Engine, System, Backend, AI. Ohne Jahreszahl, ohne Biografie.
3. Was gebaut wurde. **Wartet auf Material.**
4. Was daran neu war: vier Fünftel Backend, ein Fünftel Nichtdeterminismus. **Wartet auf Material.**
5. Schluss: die Position, warum diese Richtung. Kein Fazit-Verzicht als Pflichtübung.

## Probe für Abschnitt 1

Noch nicht freigegeben, Ton war zuletzt nicht bestätigt.
Sie ist außerdem am RAG-ADR ausgerichtet worden, also am falschen Maßstab, und sollte gegen VOICE.md neu geprüft werden.

> Es gibt in ServiceDeskLite eine Stelle, die mir mehr über die letzten Monate erzählt als alles andere, was ich gebaut habe.
>
> Der Intake-Assistent kann nach ähnlichen Tickets suchen, bevor er ein neues anlegt.
> Wenn diese Suche nicht verfügbar ist, weil der Embedding-Key fehlt, könnte das Tool eine leere Trefferliste zurückgeben.
> Technisch wäre das korrekt: keine Treffer.
> Nur bedeutet eine leere Liste für das Modell "es gibt keine Duplikate", und genau das würde es dem Nutzer sagen.
> Zuversichtlich, freundlich formuliert, und falsch, weil niemand nachgesehen hat.
>
> Also sagt das Tool stattdessen "nicht verfügbar in diesem Deployment".
>
> Der Unterschied ist ein Dutzend Zeichen im Code.
> Dahinter liegt eine Annahme, die in meinem bisherigen Handwerk nirgends zur Debatte stand.
> Result-Pattern, State Machine, Idempotency Keys, `select for update` - all diese Werkzeuge setzen voraus, dass ein Aufruf, der korrekt ausgeführt wurde, auch ein korrektes Ergebnis liefert.
> Der Fehler ist der Ausnahmefall, und er meldet sich.
> Bei einem Sprachmodell meldet er sich nicht.
> Er formuliert sich aus.
>
> Das ist die Klasse von Problemen, wegen der ich meine Richtung ändere.

## Nächster Schritt

Felix schließt die aktuelle Phase von ServiceDeskLite ab und erstellt eine Zusammenfassung aller Neuerungen, eine Liste der aufgetretenen Probleme und eine ausführliche Benutzeranleitung.

Erst danach lassen sich Abschnitt 3 und 4 schreiben.
Dafür werden zwei Dinge gebraucht, die noch fehlen:

Erstens das konkrete Vorher und Nachher.
Nicht "erleichtert den Arbeitsalltag erheblich", sondern: welcher Handgriff fällt weg, welche Entscheidung trifft der Assistent selbst, wo fragt er zurück statt zu handeln.

Zweitens, was schiefgegangen ist.
Was wurde unterschätzt, was hat beim ersten Live-Test nicht funktioniert, was hat Zeit gekostet.
Das ist erfahrungsgemäß der Absatz, den Leser zitieren.
