using System.Text.Json;
using Asteria.Indexer.Data;
using Cardano.Sync.Reducers;
using Microsoft.EntityFrameworkCore;
using PallasDotnet.Models;

namespace Asteria.Indexer.Reduers;

public class UtxoCborByAddressReducer(
    IDbContextFactory<AsteriaDbContext> dbContextFactory,
    IConfiguration configuration
) : IReducer
{

    public async Task RollForwardAsync(NextResponse response)
    {
        using var dbContext = dbContextFactory.CreateDbContext();
        var trackedAddressed = JsonSerializer.Deserialize<string[]>(configuration.GetValue<string>("UtxoAddresses") ?? "[]");
        // Process Inputs
        response.Block.TransactionBodies.ToList().ForEach(tx => tx.Inputs.ToList().ForEach(input =>
        {
            dbContext.UtxoCborByAddresses.RemoveRange(
                dbContext.UtxoCborByAddresses.Where(x => x.TxHash == input.Id.ToHex() && x.OutputIndex == input.Index).AsNoTracking()
            );
        }));
        
        // Process Outputs
        response.Block.TransactionBodies.ToList().ForEach(tx => tx.Outputs.ToList().ForEach(output =>
        {
            var address = output.Address.ToBech32();

            // Skip if address is not tracked
            if (!(trackedAddressed?.Contains(address) ?? false)) return;

            dbContext.UtxoCborByAddresses.Add(new (
                tx.Id.ToHex(),
                output.Index,
                response.Block.Slot,
                address,
                tx.Era,
                output.Raw
            ));
        }));

        await dbContext.SaveChangesAsync();
    }

    public async Task RollBackwardAsync(NextResponse response)
    {
        using var dbContext = dbContextFactory.CreateDbContext();
        dbContext.UtxoCborByAddresses.RemoveRange(
            dbContext.UtxoCborByAddresses.Where(x => x.Slot > response.Block.Slot).AsNoTracking()
        );

        await dbContext.SaveChangesAsync();
    }
}