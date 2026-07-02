using NPoco;
using Umbraco.Cms.Infrastructure.Persistence.DatabaseAnnotations;

namespace Drafts.Models;

[TableName(TableName)]
[PrimaryKey("id", AutoIncrement = true)]
public class Draft
{
    public const string TableName = "communityDrafts";

    [PrimaryKeyColumn(AutoIncrement = true)]
    [Column("id")]
    public int Id { get; set; }

    [Column("userKey")]
    public Guid UserKey { get; set; }

    [Column("nodeKey")]
    public Guid NodeKey { get; set; }

    [Column("contentData")]
    [SpecialDbType(SpecialDbTypes.NVARCHARMAX)]
    public string ContentData { get; set; } = string.Empty;

    [Column("savedAt")]
    public DateTime SavedAt { get; set; }
}
