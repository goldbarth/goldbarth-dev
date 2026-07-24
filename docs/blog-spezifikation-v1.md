# Blog-Spezifikation — goldbarth.dev

Gegenstück zu `kachel-spezifikation-v4.md`. Dort steht das GitHub-Profil, hier der Blog.
Gemeinsam sind beiden: die Amber- und Teal-Rampen, IBM Plex Mono als Signatur, die Rollentrennung Amber gleich Identität und Teal gleich System.

Unterschiedlich sind: Serif als Leseschrift (auf Kacheln unmöglich), der Zustands-Begriff (Kacheln kennen aktiv und in Arbeit, der Blog kennt drei Zustände), und die Light-Mode-Mechanik (Kacheln stufen über Rahmenstärke, der Blog über Fläche plus Farbe).

Sprache des Blogs: Englisch. Diese Spezifikation ist Deutsch, die Beispieltexte darin sind Englisch.

---

## 1. Haltung

Alles Weitere folgt aus zwei Texten. Sie sind entschieden und stehen fest.

**Blog-Kachel auf dem GitHub-Profil**

```
FIELD NOTES
Everything is an experiment
LLM systems in .NET and Python. Experiments, partial answers, open questions.
www.goldbarth.dev →
```

**Kopfzeile der Blog-Startseite**

```
~/goldbarth $ whoami

Felix Wahl, backend engineer in Hamburg, working toward AI engineering in .NET and Python.
Posts go up while the experiment is still running. They carry a status, and they change when the result does.
```

Der zweite Satz der Kopfzeile ist kein Schmuck. Er erklärt Statuspunkt und Datumsprotokoll, bevor der Leser sie zum ersten Mal sieht.

Was daraus folgt und was nicht:

- Keine Urteils-Labels. `DECISION` entfällt ersatzlos, weil es das Gegenteil von "still open" behauptet.
- Kein `failed`. Wenn alles ein Experiment ist, ist ein Ergebnis kein Scheitern. Was nicht funktioniert hat, steht im Text, nicht im Etikett.
- Keine Zweiteilung mit Negation in Überschriften. Die Figur `X, not Y` gehört Chartula (`Grounded, not guessed`) und bleibt dort.

---

## 2. Datenmodell

Zwei Objekte, klar getrennt. Das ist die wichtigste Entscheidung der ganzen Spezifikation.

**Experiment** ist die Einheit. Es hat einen Zustand, ein Datumsprotokoll und eine Rahmenfrage, aber keinen langen Fließtext.

| Feld | Typ | Anmerkung |
|---|---|---|
| `slug` | string | URL-Segment |
| `title` | string | Aussage oder Frage, kein Produktname |
| `frame` | 2 bis 3 Sätze | worum es geht und was offen ist |
| `status` | enum | `running` · `partial answer` · `concluded` |
| `log` | Liste aus Zustand und Datum | siehe Abschnitt 3 |
| `tags` | Liste | nur Stack-Achse, siehe Abschnitt 8 |

**Eintrag** ist die Veröffentlichung. Er hat ein Datum, eine eigene URL und **keinen eigenen Zustand**.

| Feld | Typ | Anmerkung |
|---|---|---|
| `slug` | string | URL-Segment |
| `title` | string | |
| `date` | Datum | einmalig, wird nicht überschrieben |
| `teaser` | 1 Satz | für Liste und Experiment-Seite |
| `experiment` | slug oder leer | leer heißt: freie Notiz |
| `body` | Text | |

Zwei Regeln, die daran hängen:

1. **Alte Einträge werden nie umgeschrieben.** Neue Erkenntnis heißt neuer Eintrag, nicht Überarbeitung. Das hält den Aufwand klein und die Chronologie ehrlich.
2. **Ein Eintrag darf ohne Experiment existieren.** Eine offene Frage gehört per Definition noch zu keinem Versuch. Ohne diese Möglichkeit würden genau die Texte nicht geschrieben, die die Kachel verspricht.

**URLs, flach**

```
/experiments/<experiment-slug>
/log/<entry-slug>            jeder Eintrag, mit oder ohne Experiment
```

Der Pfad enthält das Experiment bewusst **nicht**. Ein verschachtelter Pfad schreibt die Zugehörigkeit fest: eine freie Notiz, die später einem Experiment zugeordnet wird, bekäme eine neue URL, und jeder bestehende Link sowie die RSS-GUID zeigen ins Leere. Flach bleibt `experiment` ein Frontmatter-Feld, und Umhängen kostet nichts.

Umsetzung in Astro: zwei Content Collections, `experiments` und `log`. Die alten Collections `projects`, `decisions` und `thoughts` entfallen.

**RSS** enthält Einträge, nicht Zustandswechsel. Ein Zustandswechsel ohne neuen Eintrag ist eine stille Änderung und soll niemanden benachrichtigen.

---

## 3. Zustände

Drei, nicht mehr. Sie hängen am Experiment, nie am Eintrag.

| Zustand | Bedeutung |
|---|---|
| `running` | wird gerade bearbeitet |
| `partial answer` | ein Teil ist beantwortet, der Rest liegt |
| `concluded` | abgeschlossen, unabhängig vom Ergebnis |

`running` und nicht `active`: `active` ist auf der Chartula-Kachel bereits mit "wird gepflegt" belegt. Projekte sind aktiv, Experimente laufen. `partial answer` steht wörtlich in der Kachel und verklammert beide Kanäle ohne Erklärung.

**Der Zustand ändert sich über die Zeit.** Jeder Wechsel wird mit Datum protokolliert, kein Zustand wird überschrieben:

```
started 2026-04-02   ·   partial answer 2026-06-30   ·   concluded  open
```

Noch nicht erreichte Zustände stehen mit, gedämpft, mit `open` statt leerem Feld. Das ist die Stelle, an der die Seite ihre eigene Haltung vorführt: offen ist ein Zustand, kein Mangel.

Sortierung der Startseite nach **letzter Zustandsänderung**, nicht nach Anlage. Sonst rutschen wiederbelebte Experimente nicht nach oben.

---

## 4. Seitenaufbau

### 4a. Startseite, drei Schichten

1. **Haltung.** Prompt-Zeile plus die zwei Sätze aus Abschnitt 1.
2. **Laufende Experimente.** Nur `running`, als gerahmte Blöcke. Das ist die Antwort auf "woran arbeitet der gerade", und sie pflegt sich selbst.
3. **Die Linie.** Alle Einträge chronologisch, neueste zuerst, rahmenlos, nur Haarlinien dazwischen. Darüber die Filterzeile.

Die zwei unteren Schichten müssen sich **im Format** unterscheiden, nicht nur in der Farbe: Experimente sind Objekte mit Rahmen und Padding, Einträge sind eine Liste. Ohne diesen Unterschied liest die zweite Schicht wie eine Fortsetzung der ersten.

Jede Zeile der Linie nennt ihr Experiment in Mono unter dem Titel. Freie Notizen schreiben `no experiment · note`. Erst dadurch wird die Trennung aus Abschnitt 2 für den Leser sichtbar, ohne dass sie erklärt werden muss.

Es gibt **keinen** separaten Now- oder About-Bereich. Beides würde veralten, Schicht 1 und 2 tun es nicht.

### 4b. Experiment-Seite

Reihenfolge: Prompt-Breadcrumb, Titel mit Identitätspunkt und Status, Rahmentext, Tags, Datumsprotokoll, dann die Einträge.

**Einträge aufsteigend, ältester oben.** Die Startseite ist neueste zuerst, weil sie Neuigkeit zeigt. Die Experiment-Seite ist eine Geschichte, und eine Geschichte liest man von vorn. Der neueste Eintrag trägt als einziger eine Teal-Trennlinie und den Zusatz `latest`, damit das Auge den aktuellen Stand trotzdem sofort findet.

Die Einträge stehen hier mit Datum, Titel und Teaser, nicht im Volltext. Volltext liegt auf der Eintragsseite, weil jeder Eintrag eine eigene URL braucht.

### 4c. Eintragsseite

Reihenfolge: Prompt-Breadcrumb, Zugehörigkeit zum Experiment als Mono-Kicker mit Statuspunkt, Titel, Meta, Fließtext, Navigation.

**Die Navigation unten führt zum vorigen und nächsten Eintrag innerhalb desselben Experiments**, nicht durch den ganzen Blog. Wer in einem Faden liest, bleibt im Faden. Darunter eine Zeile zurück zum Experiment.

Beim neuesten Eintrag eines laufenden Experiments bleibt das rechte Feld stehen, gestrichelt, mit `not written yet`. Das Feld wegzulassen würde die Symmetrie kippen und die Seite mit einem halben Kasten enden lassen.

**Zahlenblock.** Fester Baustein für Messwerte: Mono, linksbündig, mit 2px Teal-Linie links, kein Rahmen, keine Tabelle. Zahlen sind der Ort, an dem der Ton konkret wird, deshalb sehen sie überall gleich aus.

### 4d. Prompt-Zeile nur auf der Startseite

```
~/goldbarth $ whoami
```

Sie steht einmal, oben auf der Startseite, und nirgends sonst. Als Breadcrumb auf jeder Unterseite wiederholt getestet und verworfen: die Figur wird dadurch zur Dekoration, und sie wäre außerdem die einzige Stelle, an der der Pfad das Experiment enthält, obwohl die URL das bewusst nicht tut.

Den Rückweg tragen stattdessen zwei vorhandene Elemente:

- Auf der Eintragsseite ist der Mono-Kicker mit dem Experimentnamen der Link zurück zum Experiment.
- Am Fuß steht zusätzlich `← back to the experiment · 4 entries · running`.

Damit bleibt der Seitenkopf ruhig, und der Rückweg steht dort, wo der Leser ihn braucht, nämlich am Ende des Textes.

---

## 5. Typografie

| Rolle | Familie | Einsatz |
|---|---|---|
| Sans | **IBM Plex Sans** | Titel, Zwischenüberschriften, UI-Text, Teaser |
| Serif | **IBM Plex Serif** | ausschließlich Fließtext auf der Eintragsseite |
| Mono | **IBM Plex Mono** | Prompt, Kicker, Status, Datum, Meta, Tags, Zahlen |

Mono ist die Konstante über GitHub und Blog. Die Sans-Ebene darf abweichen, deshalb hier Plex Sans statt Inter. Serif existiert nur hier, weil sie auf einer Kachel nie funktionieren würde.

**Zwei Gewichte: 400 und 500.** Kein 600, kein 700, wie auf der Kachelebene.

Größen in px, gemessen an einer Textspalte von etwa 520 bis 560px:

| Element | Größe | Familie | Schnitt |
|---|---|---|---|
| Kopfzeile Startseite | 14 | Sans | 400 |
| Prompt-Zeile | 11 bis 12 | Mono | 400 |
| Kicker (`RUNNING`, Experimentname) | 11, Laufweite 2,2 | Mono | 400 |
| Experiment-Titel, Startseite | 19 | Sans | 500 |
| Rahmentext, Startseite | 13 | Sans | 400 |
| Experiment-Titel, Experiment-Seite | 26 | Sans | 500 |
| Rahmentext, Experiment-Seite | 14,5 | Sans | 400 |
| Eintragstitel in Listen | 15 bis 17 | Sans | 500 |
| Teaser | 13,5 | Sans | 400 |
| Eintragstitel, Eintragsseite | 27 | Sans | 500 |
| **Fließtext, Eintragsseite** | **15,5, Zeilenabstand 1,78** | **Serif** | **400** |
| Zwischenüberschrift im Text | 15 | Sans | 500 |
| Zahlenblock | 12, Zeilenabstand 1,9 | Mono | 400 |
| Datum, Status, Meta | 11 | Mono | 400 |

**Lesebreite höchstens 520px**, also etwa 70 Zeichen. Lesekomfort steht über schnellem Überblick, und diese Regel gilt für alle Fließtextstellen.

---

## 6. Farben Dark

Basis aus `kachel-spezifikation-v4.md`. Vier Werte sind neu und stehen dort nicht, sie decken Rollen ab, die es auf einer Kachel nicht gibt.

| Rolle | Hex | Neu | Einsatz |
|---|---|---|---|
| bg | `#12100E` | | Seite, alle Flächen |
| hairline-soft | `#241E18` | **neu** | Listentrenner, neutrale Rahmen im Blog |
| hairline | `#332A21` | | starke Trennung, selten |
| Titel | `#FAF6F0` | | |
| Lesetext (Serif) | `#C4B8A9` | **neu** | Fließtext Eintragsseite |
| Fließtext (Sans) | `#B5A899` | **neu** | Rahmentext, Teaser, Kopfzeile |
| Meta | `#7E7365` | **neu** | Datum, Zugehörigkeit, Filter |
| gedämpft | `#4A4038` | **neu** | nicht erreichter Zustand, leeres Nav-Feld |

`#9C9082` aus der Kachelspezifikation wird im Blog **nicht** für Fließtext verwendet. Auf Kachelgröße ist es richtig, über mehrere hundert Wörter zu leise.

| Rolle | Hex |
|---|---|
| Identitätspunkt | `#E0A34B` |
| Prompt-Zeile, Rückwege | `#B07A2E` |
| Status `running` | `#5EEAD4` mit Glow |
| Status `partial answer` | `#2DD4BF` |
| Status `concluded` | `#14807A` |
| Rahmen laufender Block | `#14807A` |
| Tag: Text · Füllung · Rahmen | `#2DD4BF` · `#0A2724` · `#0E4B45` |

Der Rahmen des laufenden Blocks bleibt bewusst `#14807A` und nicht `#2DD4BF`, sonst konkurriert er mit dem leuchtenden Punkt.

**Glow** nur auf dem Statuspunkt `running`:

```css
box-shadow: 0 0 7px #5EEAD4;
```

Kein Glow auf Blockrahmen. Auf einer Textseite trägt er nicht, dort arbeiten Rahmenfarbe und Weißraum.

---

## 7. Farben Light

Basis aus Abschnitt 6b der Kachelspezifikation. Drei Werte sind neu.

| Rolle | Hex | Neu | Einsatz |
|---|---|---|---|
| bg | `#FBF8F3` | | Seite |
| Fläche laufender Block | `#F4EEE5` | | siehe Abschnitt 8 |
| hairline | `#E2DACE` | | Listentrenner, ruhende Rahmen |
| Titel | `#1A1613` | | |
| Titel gedämpft | `#3D352E` | **neu** | Titel ruhender Experimente |
| Fließtext | `#6B6055` | | eine Stufe kräftiger für lange Texte |
| Meta | `#8A7F72` | **neu** | Datum, Zugehörigkeit, Filter |
| gedämpft | `#C9A96E` bzw. `#D6CDBF` | **neu** | Identitätspunkt ruhend, Trennzeichen |

| Rolle | Hex |
|---|---|
| Identitätspunkt | `#A86F22` |
| Prompt-Zeile, Rückwege | `#8F5D18` |
| Status `running` | `#0B4742` mit Ring |
| Status `partial answer` | `#0E5F5A` |
| Status `concluded` | `#14807A` |
| Rahmen laufender Block | `#0E5F5A`, 1px |
| Tag: Text · Füllung · Rahmen | `#0E5F5A` · `#E8F4F2` · `#B9DEDA` |

**Die Rampe läuft umgekehrt.** `running` ist im Light Mode der dunkelste Ton, `concluded` der hellste. Präsenz ist auf hellem Grund Dunkelheit. Nicht invertieren, sondern die Rollen zwei Stufen verschieben, wie in der Kachelspezifikation.

`#C9A96E` ist nur für Punkte und Rahmen. Als Textfarbe reicht der Kontrast nicht, dafür `#9C8455`.

---

## 8. Zustandsdarstellung

Der Zustand wird in beiden Modi **doppelt** getragen, einmal am Punkt und einmal am Block.

| | Dark | Light |
|---|---|---|
| Punkt `running` | `#5EEAD4` plus Glow | `#0B4742` plus Ring |
| Punkt sonst | Rampe, nackt | Rampe, nackt |
| Block `running` | Rahmen `#14807A`, keine Füllung | Füllung `#F4EEE5`, Rahmen `#0E5F5A` 1px |
| Block sonst | Rahmen `#241E18` | Rahmen `#E2DACE` 1px |

**Der Ring ist die scharfe Entsprechung des Glows**, gleiche Geometrie, konzentrisch nach außen. Damit sind Dark und Light eine Idee in zwei Materialien, nicht zwei Entwürfe. Ein Weichzeichner auf hellem Grund erzeugt eine graue Schmutzkante statt Licht, deshalb entfällt er dort ersatzlos.

Punkt ⌀ 7, Spalt 2 in Flächenfarbe, Ring 1. Ein `box-shadow`, kein zusätzliches Element:

```css
box-shadow: 0 0 0 2px #F4EEE5, 0 0 0 3px #B9DEDA;
```

Die zweite Farbe im Spalt ist immer die Farbe der Fläche darunter. Steht der Punkt auf der Seite statt im Block, ist sie `#FBF8F3`.

**Warum Fläche und nicht Rahmenstärke.** Die Kachelspezifikation stuft im Light Mode über 3px gegen 1,5px. Auf einer Textseite ist das ein harter Sprung, und 1,5px liegt bei Geräten mit einem Gerätepixel pro CSS-Pixel nicht sauber, sondern wird gerundet oder weich gezeichnet. Die Mischung aus Fläche und Farbe löst beides: sie liest ruhiger, behält das Farbsignal am Blockrand, und überall steht 1px.

Der Zustand wird damit dreifach getragen, Fläche, Rahmenfarbe und Ring. Falls das beim Bauen zu viel wirkt, ist der Ring der Kandidat zum Streichen, nicht die Farbe.

---

## 9. Tags und Filter

Zwei Achsen, keine Kategorien.

- **Stack:** `python` · `dotnet` · `rag` · `pgvector` · `eval` · `grounding` und was dazukommt. Wächst organisch und bildet den Wechsel von .NET zu Python von selbst ab.
- **Zustand:** die drei aus Abschnitt 3.

Die Filterzeile steht über der Linie, nicht über den Experimenten, und ist in Mono gesetzt. Aktiver Filter mit Amber-Unterstrich.

**Kategorien sind vertagt, nicht verworfen.** Vier Oberkategorien bei drei Einträgen ergeben drei leere Regale, und eine leere Kategorie sagt lauter, dass hier wenig steht, als gar keine es täte. Ab etwa fünfzehn Einträgen schreiben sich die Kategorien von selbst, weil dann sichtbar ist, worüber tatsächlich geschrieben wurde statt worüber geschrieben werden sollte.

---

## 10. Bewusst nicht enthalten

| Element | Grund |
|---|---|
| Projekt-Index auf dem Blog | trägt jetzt das GitHub-Profil. Ein zweiter Index konkurriert mit der README und verliert. |
| `DECISION` und `THOUGHT` | Urteils- und Gattungslabel, ersetzt durch Zustand. |
| Now- oder About-Seite | veraltet. Die laufenden Experimente sind die ehrlichere Antwort. |
| Handgepflegte Statuszeile im Header | dasselbe fällt aus dem Zustandsmodell ohne Pflege ab. |
| Glow im Light Mode | graue Schmutzkante statt Licht. |
| Hover-Zustände als Bedeutungsträger | was auf dem Papier steht, muss reichen. |
| Lesezeit-Angabe (`5 min`) | ein Versprechen, das niemand halten kann. Lesegeschwindigkeit ist verschieden, aus Gründen, die den Leser nichts angehen müssen, und eine Minutenzahl setzt stillschweigend eine Norm. Meta-Zeile trägt deshalb nur Datum und Position im Faden. |

---

## 11. Altbestand

Die bestehenden Inhalte unter `src/content/` werden entfernt, nicht überführt. Sie stehen auf .NET-Projekten, die auf dem GitHub-Profil nicht mehr ausgestellt sind, und in einem Ton, den diese Spezifikation ersetzt.

Archivierung: die Texte bleiben dauerhaft in der Git-History erhalten und sind über `git log` jederzeit wieder herstellbar. Ein zusätzlicher lokaler Export ist Bequemlichkeit, keine Sicherung.

**Tote Links.** Nach dem Umbau laufen `/projects/*`, `/decisions/*` und `/thoughts/*` ins Leere, und einige davon sind extern verlinkt. Da die Inhalte ersatzlos verschwinden, gibt es kein sinnvolles Ziel für Einzelweiterleitungen. Entschieden ist eine Sammelweiterleitung auf die Startseite, ausgeführt von Azure Static Web Apps, nicht von Astro.

`public/staticwebapp.config.json`, damit die Datei im Wurzelverzeichnis der Ausgabe landet:

```json
{
  "routes": [
    { "route": "/decisions/*", "redirect": "/", "statusCode": 301 },
    { "route": "/thoughts/*",  "redirect": "/", "statusCode": 301 },
    { "route": "/projects/*",  "redirect": "/", "statusCode": 301 }
  ]
}
```

Begründung gegen die Astro-Variante: Astro erzeugt bei statischer Ausgabe ohne Adapter nur eine Client-Weiterleitung per `<meta http-equiv="refresh">` ohne Statuscode, und es lässt keine Musterroute auf ein festes Ziel zu, sondern verlangt gleichartige Routen. Jeder alte Slug müsste einzeln gepflegt werden. Routing gehört beim Free-Tier zum Funktionsumfang, die Entscheidung kostet nichts. Einziger Preis ist die Bindung an den Hoster: bei einem Umzug werden die drei Regeln neu geschrieben.

---

## 12. Offen

**Filterzeile: entschieden am 2026-07-24, clientseitig.**
Die Alternative waren statisch erzeugte Routen unter `/log/tag/<tag>`.
Bei der aktuellen Eintragszahl steht dem Gewinn an Verlinkbarkeit ein zweites Routing-Muster gegenüber, das für eine Handvoll Zeilen gepflegt werden müsste.
Der Preis der Entscheidung ist genau diese Verlinkbarkeit: ein Filterzustand lässt sich nicht teilen und nicht als Lesezeichen ablegen.

Wann das umzudrehen ist: sobald die Filterzeile mehr als etwa fünf Stack-Tags trägt oder die Linie fünfzehn Einträge überschreitet.
Ab dort wird der Filter zur Navigation statt zur Bequemlichkeit, und Navigation gehört in die URL.
Der Umbau ist billig, weil `tags` bereits im Frontmatter steht und nur eine zusätzliche Route braucht.

Offen bleibt sonst nichts.
