using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Asteria.Indexer.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "Blocks",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Number = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    Slot = table.Column<decimal>(type: "numeric(20,0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Blocks", x => new { x.Id, x.Number, x.Slot });
                });

            migrationBuilder.CreateTable(
                name: "ReducerStates",
                schema: "public",
                columns: table => new
                {
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slot = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    Hash = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReducerStates", x => x.Name);
                });

            migrationBuilder.CreateTable(
                name: "TransactionOutputs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Index = table.Column<long>(type: "bigint", nullable: false),
                    Address = table.Column<string>(type: "text", nullable: false),
                    Amount_Coin = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    Amount_MultiAssetJson = table.Column<JsonElement>(type: "jsonb", nullable: false),
                    Datum_Type = table.Column<int>(type: "integer", nullable: true),
                    Datum_Data = table.Column<byte[]>(type: "bytea", nullable: true),
                    Slot = table.Column<decimal>(type: "numeric(20,0)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransactionOutputs", x => new { x.Id, x.Index });
                });

            migrationBuilder.CreateTable(
                name: "UtxoCborByAddresses",
                schema: "public",
                columns: table => new
                {
                    TxHash = table.Column<string>(type: "text", nullable: false),
                    OutputIndex = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    Slot = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    Address = table.Column<string>(type: "text", nullable: false),
                    Era = table.Column<int>(type: "integer", nullable: false),
                    Cbor = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UtxoCborByAddresses", x => new { x.TxHash, x.OutputIndex, x.Slot, x.Address });
                });

            migrationBuilder.CreateIndex(
                name: "IX_Blocks_Slot",
                schema: "public",
                table: "Blocks",
                column: "Slot");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionOutputs_Slot",
                schema: "public",
                table: "TransactionOutputs",
                column: "Slot");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Blocks",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ReducerStates",
                schema: "public");

            migrationBuilder.DropTable(
                name: "TransactionOutputs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "UtxoCborByAddresses",
                schema: "public");
        }
    }
}
