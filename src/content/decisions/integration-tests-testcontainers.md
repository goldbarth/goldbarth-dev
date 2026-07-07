---
title: "Integrationstests mit Testcontainers"
description: "Wie MetricGate PostgreSQL, Redpanda und EF-Migrationen in einem Testlauf koordiniert - und welche Domain-Regeln Unit Tests schlicht nicht abfangen können."
date: "2026-05-21T19:48:00"
readMin: 5
draft: false
---

Unit Tests lügen nicht - aber sie testen nicht, was man ihnen nicht zeigt. NSubstitute-Mocks prüfen, ob ein Service die richtigen Methoden aufruft. Sie prüfen nicht, ob die rekursive CTE, die Zyklenerkennung im Mandantenbaum implementiert, tatsächlich einen Zyklus erkennt. Das ist ein fundamentaler Unterschied.

Für MetricGate gibt es drei Kategorien von Invarianten, die nicht im Applikationslayer leben - sondern in der Datenbank oder im Broker:

- Hierarchietiefe: Die Tiefenprüfung nutzt eine `WITH RECURSIVE`-CTE direkt in PostgreSQL.
- Plan-Ceiling: Die Elternbegrenzung bei Planzuweisungen benötigt reale Tabellenjoins.
- Kafka-Reihenfolge: Der Outbox-Publisher muss Nachrichten in Erstellungsreihenfolge an Redpanda liefern.

Keines davon ist mit Mocks testbar - zumindest nicht sinnvoll.

## Die Factory

Testcontainers startet echte Docker-Container für die Laufzeit eines Testlaufs. Die `PlansWebApplicationFactory` hält zwei Container:

```csharp
public sealed class PlansWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:15.1")
        .WithDatabase("plans_test")
        .WithUsername("plans")
        .WithPassword("plans_secret")
        .Build();

    private readonly RedpandaContainer _redpanda =
        new RedpandaBuilder("docker.redpanda.com/redpandadata/redpanda:v22.2.1").Build();

    public string KafkaBootstrapServers => _redpanda.GetBootstrapAddress();
    ...
}
```

`WebApplicationFactory<Program>` startet den vollständigen ASP.NET-Host - DI-Container, Middleware, alles. Die Container laufen gegen dieselbe `Program`-Registrierung wie die Produktion, nur mit überschriebenen Connection Strings.

## Startup und Migration

`IAsyncLifetime.InitializeAsync` startet beide Container parallel und führt danach EF-Migrationen aus:

```csharp
public async Task InitializeAsync()
{
    await Task.WhenAll(_postgres.StartAsync(), _redpanda.StartAsync());

    var options = new DbContextOptionsBuilder<PlansDbContext>()
        .UseNpgsql(_postgres.GetConnectionString())
        .Options;
    await using var db = new PlansDbContext(options);
    await db.Database.MigrateAsync();
}
```

`Task.WhenAll` ist entscheidend: PostgreSQL und Redpanda starten unabhängig voneinander - sequenziell würde das Doppelte kosten. Migration läuft erst nach beiden Starts, weil `MigrateAsync` eine Datenbankverbindung braucht.

`ConfigureWebHost` überschreibt dann die Connection Strings bevor der Host hochfährt:

```csharp
protected override void ConfigureWebHost(IWebHostBuilder builder)
{
    builder.UseSetting("ConnectionStrings:PlansDb", _postgres.GetConnectionString());
    builder.UseSetting("Kafka:BootstrapServers", KafkaBootstrapServers);
    builder.UseSetting("Keycloak:Authority", "http://localhost:9999/realms/test");
    builder.UseSetting("Keycloak:RequireHttpsMetadata", "false");
}
```

Der Keycloak-Eintrag zeigt auf einen nicht-existenten Endpunkt. Das ist beabsichtigt - die Integrationstests testen keine Auth, und ein echter Keycloak-Container würde den Startup signifikant verlangsamen. Der Preis: Tests, die Bearer-Tokens benötigen, können nicht über den HTTP-Layer laufen.

## Eine Factory, drei Testklassen

Container starten pro Test neu ist inakzeptabel teuer. xUnit's `ICollectionFixture` löst das: eine Factory-Instanz für alle Testklassen derselben Collection.

```csharp
[CollectionDefinition("Plans Integration")]
public sealed class PlansIntegrationCollection : ICollectionFixture<PlansWebApplicationFactory>;
```

Jede Testklasse deklariert `[Collection("Plans Integration")]` und bekommt die Factory per Konstruktor:

```csharp
[Collection("Plans Integration")]
public sealed class TenantHierarchyIntegrationTests(PlansWebApplicationFactory factory)
{
    private TenantService CreateSut() =>
        factory.Services.CreateScope().ServiceProvider.GetRequiredService<TenantService>();
    ...
}
```

Ein neuer DI-Scope pro Test isoliert transiente und scoped Abhängigkeiten. Die Datenbankverbindung ist geteilt - was bedeutet, dass Tests sich gegenseitig sehen können, wenn Testdaten nicht hinreichend isoliert sind.

## Was nur mit echter Datenbank testbar ist

Der Hierarchietest prüft keine Applikationslogik, sondern Datenbankbehavior:

```csharp
[Fact]
public async Task CreateTenant_AtDepth4_ThrowsDepthExceeded()
{
    var sut = CreateSut();
    var root     = await sut.CreateAsync(new CreateTenantRequest("Root-H-5",     "Root",        null));
    var reseller = await sut.CreateAsync(new CreateTenantRequest("Reseller-H-5", "Reseller",    root.Id));
    var sub      = await sut.CreateAsync(new CreateTenantRequest("Sub-H-5",      "SubReseller", reseller.Id));
    var customer = await sut.CreateAsync(new CreateTenantRequest("Customer-H-5", "Customer",    sub.Id));

    var ex = await Should.ThrowAsync<DomainException>(
        () => sut.CreateAsync(new CreateTenantRequest("TooDeep-H-5", "Reseller", customer.Id)));
    ex.Code.ShouldBe("tenant.depth_exceeded");
}
```

`GetAncestorChainAsync` ist eine `WITH RECURSIVE`-CTE in PostgreSQL. Die Tiefenprüfung passiert in SQL, nicht in C#. Ein Mock hätte die Methode aufgerufen und `true` zurückgegeben - der Test wäre grün gewesen, die CTE aber nie ausgeführt worden.

Gleiches gilt für den Zyklus-Test: `MoveTenant` nutzt `SELECT … FOR UPDATE`, um konkurrierende Reparent-Operationen zu serialisieren. Ob das Lock greift, ist mit einem In-Memory-Mock schlicht nicht beobachtbar.

## Kafka End-to-End

Der Outbox-Test verifiziert die komplette Kette: Domain-Event → Outbox-Eintrag → Kafka-Topic:

```csharp
[Fact]
public async Task RevokeKey_OutboxEntryPublishedToKafka()
{
    var tenantId = await CreateTenantAsync("Pub");
    var keyResp  = await Sut<ApiKeyService>().CreateAsync(new TenantId(tenantId), new CreateApiKeyRequest(null, null));

    await Sut<ApiKeyService>().RevokeAsync(new ApiKeyId(keyResp.Id));
    var published = await Sut<OutboxPublisher>().ProcessBatchAsync(10);
    published.ShouldBeGreaterThan(0);

    var consumed = await ConsumeOneAsync("plans.changes", TimeSpan.FromSeconds(10));
    consumed.ShouldNotBeNullOrEmpty();
    consumed.ShouldContain("ApiKeyRevokedEvent");
}
```

`ConsumeOneAsync` öffnet einen echten Kafka-Consumer gegen Redpanda:

```csharp
private Task<List<string>> ConsumeAsync(string topic, int count, TimeSpan timeout)
{
    return Task.Run(() =>
    {
        var config = new ConsumerConfig
        {
            BootstrapServers = factory.KafkaBootstrapServers,
            GroupId          = $"test-consumer-{Guid.NewGuid():N}",
            AutoOffsetReset  = AutoOffsetReset.Earliest,
            EnableAutoCommit = false
        };

        using var consumer = new ConsumerBuilder<string?, string>(config).Build();
        consumer.Subscribe(topic);

        var results  = new List<string>();
        var deadline = DateTime.UtcNow + timeout;

        while (results.Count < count && DateTime.UtcNow < deadline)
        {
            var result = consumer.Consume(deadline - DateTime.UtcNow);
            if (result?.Message?.Value is { } value)
                results.Add(value);
        }

        consumer.Close();
        return results;
    });
}
```

`GroupId = $"test-consumer-{Guid.NewGuid():N}"` ist wichtig: jeder Test bekommt eine neue Consumer Group, sodass `AutoOffsetReset.Earliest` tatsächlich von Anfang liest und keine restlichen Messages aus früheren Tests konsumiert.

Redpanda statt Kafka: Redpanda ist Kafka-API-kompatibel, startet in einem einzigen Container ohne Zookeeper und ist signifikant schneller hochgefahren. Für Tests macht das den entscheidenden Unterschied.

## Trade-offs

Integrationstests kosten. Der erste Lauf auf einer Cold Machine - Images müssen gezogen werden - dauert deutlich länger als ein Unit-Test-Run. Auf warmem Docker-Cache sind die Container in drei bis fünf Sekunden gestartet.

Die geteilte Datenbankinstanz ist das größte Risiko. Wenn Test A Daten hinterlässt, die Test B nicht erwartet, schlägt B sporadisch fehl - je nach Ausführungsreihenfolge. Die aktuelle Lösung ist Namensraum-Isolation per Test (eindeutige Tenant-Namen wie `Root-H-5`), keine echte Datenbankisolation. Das funktioniert, solange Tests keine gegenseitigen Annahmen über Mengen machen.

## Was ich ändern würde

Für wachsende Test-Suiten würde ich `Respawn` hinzufügen - eine Library, die den Datenbankinhalt nach jedem Test auf einen sauberen Ausgangszustand zurücksetzt, ohne den Container neu zu starten. Dann entfiele das manuelle Namensraum-Management vollständig.

Die Keycloak-Lücke würde ich mit einem separaten Auth-Integration-Test-Projekt adressieren, das einen echten Keycloak-Container hochfährt - isoliert von den Domain-Tests, die Auth nicht brauchen. Alles in einen Test zu packen verlängert den Startup für die falsche Ursache.
