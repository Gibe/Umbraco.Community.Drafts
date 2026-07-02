using Umbraco.Cms.Core.Packaging;

namespace Drafts.Migrations;

public class DraftsMigrationPlan : PackageMigrationPlan
{
    public DraftsMigrationPlan() : base("Drafts") { }

    protected override void DefinePlan()
    {
        To<AddDraftsTable>(nameof(AddDraftsTable));
    }
}
