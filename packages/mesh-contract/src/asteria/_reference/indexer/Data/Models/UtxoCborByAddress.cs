namespace Asteria.Indexer.Data.Models;

public record UtxoCborByAddress
(
    string TxHash,
    ulong OutputIndex,
    ulong Slot,
    string Address,
    ushort Era,
    byte[] Cbor
);