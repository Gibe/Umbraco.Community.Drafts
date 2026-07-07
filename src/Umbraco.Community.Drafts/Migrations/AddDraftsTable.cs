using Umbraco.Community.Drafts.Models;
using Umbraco.Cms.Infrastructure.Migrations;

namespace Umbraco.Community.Drafts.Migrations;

public class AddDraftsTable : AsyncMigrationBase
{
    public AddDraftsTable(IMigrationContext context) : base(context) { }

    protected override Task MigrateAsync()
    {
        if (!TableExists(Draft.TableName))
        {
            Create.Table<Draft>().Do();
        }

        return Task.CompletedTask;
    }
}
