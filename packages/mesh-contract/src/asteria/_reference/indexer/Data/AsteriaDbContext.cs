using Microsoft.EntityFrameworkCore;
using Cardano.Sync.Data;
using Asteria.Indexer.Data.Models;

namespace Asteria.Indexer.Data;

public class AsteriaDbContext
(
    DbContextOptions<AsteriaDbContext> options,
    IConfiguration configuration
) : CardanoDbContext(options, configuration)
{
    public DbSet<UtxoCborByAddress> UtxoCborByAddresses { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UtxoCborByAddress>().HasKey(x => new { x.TxHash, x.OutputIndex, x.Slot, x.Address });
        base.OnModelCreating(modelBuilder);
    }
}