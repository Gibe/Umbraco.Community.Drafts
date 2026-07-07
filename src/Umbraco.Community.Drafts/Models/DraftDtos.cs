namespace Umbraco.Community.Drafts.Models;

public class SaveDraftRequest
{
    public Guid NodeKey { get; set; }
    public string ContentData { get; set; } = string.Empty;
}

public class DraftResponse
{
    public Guid NodeKey { get; set; }
    public string NodeName { get; set; } = string.Empty;
    public DateTimeOffset SavedAt { get; set; }
}

public class DraftDetailResponse
{
    public Guid NodeKey { get; set; }
    public string NodeName { get; set; } = string.Empty;
    public string ContentData { get; set; } = string.Empty;
    public DateTimeOffset SavedAt { get; set; }
}
