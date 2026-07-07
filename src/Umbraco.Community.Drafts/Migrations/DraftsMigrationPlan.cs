using Umbraco.Cms.Core.Packaging;

namespace Umbraco.Community.Drafts.Migrations;

public class DraftsMigrationPlan : PackageMigrationPlan
{
    public DraftsMigrationPlan() : base("Drafts") { }

    protected override void DefinePlan()
    {
        To<AddDraftsTable>(nameof(AddDraftsTable));
    }
}
