using System.Text.Json;
using Asteria.Indexer.Data;
using Asteria.Indexer.Reduers;
using Cardano.Sync;
using Cardano.Sync.Reducers;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSingleton<IReducer, UtxoCborByAddressReducer>();

builder.Services.AddCardanoIndexer<AsteriaDbContext>(builder.Configuration, 60);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

using var scope = app.Services.CreateScope();
var dbContext = scope.ServiceProvider.GetRequiredService<AsteriaDbContext>();
dbContext.Database.Migrate();

var trackedAddressed = JsonSerializer.Deserialize<string[]>(builder.Configuration.GetValue<string>("UtxoAddresses") ?? "[]");
var shipyardPolicyId = builder.Configuration.GetValue<string>("ShipyardPolicyId");
// SQL to create the materialized view

var dropViewSql = "DROP MATERIALIZED VIEW IF EXISTS mapobjects;";
dbContext.Database.ExecuteSqlRaw(dropViewSql);

var createMaterializedViewSql = @$"
CREATE MATERIALIZED VIEW mapobjects AS
select 
    ""TxHash"" || '#' || ""OutputIndex"" as id,
    'Ship' as class,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 0 ->> 'int' AS INTEGER) AS fuel,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 1 ->> 'int' AS INTEGER) AS positionx,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 2 ->> 'int' AS INTEGER) AS positiony,
    '{shipyardPolicyId}' AS shipyardpolicy,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 3 ->> 'bytes' AS TEXT) AS shiptokenname,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 4 ->> 'bytes' AS TEXT) AS pilottokenname,
    0 as totalrewards
from ""UtxoCborByAddresses""
where ""Address"" = '{trackedAddressed?[0]}' and utxo_has_policy_id_output(""Era"", ""Cbor"", decode('{shipyardPolicyId}', 'hex'))
union all
select 
    ""TxHash"" || '#' || ""OutputIndex"" as id,
    'Fuel' as class,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 0 ->> 'int' AS INTEGER) AS fuel,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 1 ->> 'int' AS INTEGER) AS positionx,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 2 ->> 'int' AS INTEGER) AS positiony,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 3 ->> 'bytes' AS VARCHAR(56)) AS shipyardpolicy,
    NULL AS shiptokenname,
    NULL AS pilottokenname,
    0 as totalrewards
from ""UtxoCborByAddresses""
where ""Address"" = '{trackedAddressed?[1]}'
union all
select 
    ""TxHash"" || '#' || ""OutputIndex"" as id,
    'Asteria' as class,
    0 AS fuel,
    0 AS positionx,
    0 AS positiony,
    CAST(utxo_plutus_data(""Era"", ""Cbor"") -> 'fields' -> 1 ->> 'bytes' AS VARCHAR(56)) AS shipyardpolicy,
    NULL AS shiptokenname,
    NULL AS pilottokenname,
    utxo_lovelace(""Era"", ""Cbor"") as totalrewards
from ""UtxoCborByAddresses""
where ""Address"" = '{trackedAddressed?[2]}';
";

dbContext.Database.ExecuteSqlRaw(createMaterializedViewSql);

var createIndexSql = "CREATE UNIQUE INDEX ON mapobjects (id);";
dbContext.Database.ExecuteSqlRaw(createIndexSql);

var createIndexPositionXSql = "CREATE INDEX idx_positionx ON mapobjects (positionx);";
var createIndexPositionYSql = "CREATE INDEX idx_positiony ON mapobjects (positiony);";
dbContext.Database.ExecuteSqlRaw(createIndexPositionXSql);
dbContext.Database.ExecuteSqlRaw(createIndexPositionYSql);

// Creating or replacing the function
var createFunctionSql = @"
CREATE OR REPLACE FUNCTION refresh_mapobjects()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mapobjects;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
";
dbContext.Database.ExecuteSqlRaw(createFunctionSql);

// Creating the trigger
var dropTriggerSql = @"
DROP TRIGGER IF EXISTS refresh_mapobjects_trigger ON ""UtxoCborByAddresses"";
";
dbContext.Database.ExecuteSqlRaw(dropTriggerSql);

var createTriggerSql = @"
CREATE TRIGGER refresh_mapobjects_trigger
AFTER INSERT OR UPDATE OR DELETE ON ""UtxoCborByAddresses""
FOR EACH STATEMENT EXECUTE FUNCTION refresh_mapobjects();
";
dbContext.Database.ExecuteSqlRaw(createTriggerSql);

app.Run();