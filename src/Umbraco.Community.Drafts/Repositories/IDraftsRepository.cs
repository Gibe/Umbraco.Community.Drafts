using Umbraco.Community.Drafts.Models;
using Umbraco.Cms.Infrastructure.Scoping;

namespace Umbraco.Community.Drafts.Repositories;

public interface IDraftsRepository
{
    IEnumerable<Draft> GetDrafts(Guid userKey);
    Draft? GetDraft(Guid userKey, Guid nodeKey);
    void SaveDraft(Guid userKey, Guid nodeKey, string contentData);
    void RemoveDraft(Guid userKey, Guid nodeKey);
    void RemoveAllDrafts(Guid userKey);
    void RemoveDraftsByNodeKey(Guid nodeKey);
}

public class DraftsRepository : IDraftsRepository
{
    private readonly IScopeProvider _scopeProvider;

    public DraftsRepository(IScopeProvider scopeProvider)
    {
        _scopeProvider = scopeProvider;
    }

    public IEnumerable<Draft> GetDrafts(Guid userKey)
    {
        using var scope = _scopeProvider.CreateScope();
        var results = scope.Database.Fetch<Draft>(
            "WHERE userKey = @0 ORDER BY savedAt DESC", userKey);
        scope.Complete();
        return results;
    }

    public Draft? GetDraft(Guid userKey, Guid nodeKey)
    {
        using var scope = _scopeProvider.CreateScope();
        var result = scope.Database.FirstOrDefault<Draft>(
            "WHERE userKey = @0 AND nodeKey = @1", userKey, nodeKey);
        scope.Complete();
        return result;
    }

    public void SaveDraft(Guid userKey, Guid nodeKey, string contentData)
    {
        using var scope = _scopeProvider.CreateScope();
        var existing = scope.Database.FirstOrDefault<Draft>(
            "WHERE userKey = @0 AND nodeKey = @1", userKey, nodeKey);

        if (existing == null)
        {
            scope.Database.Insert(new Draft
            {
                UserKey = userKey,
                NodeKey = nodeKey,
                ContentData = contentData,
                SavedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.ContentData = contentData;
            existing.SavedAt = DateTime.UtcNow;
            scope.Database.Update(existing);
        }

        scope.Complete();
    }

    public void RemoveDraft(Guid userKey, Guid nodeKey)
    {
        using var scope = _scopeProvider.CreateScope();
        scope.Database.Execute(
            $"DELETE FROM {Draft.TableName} WHERE userKey = @0 AND nodeKey = @1",
            userKey, nodeKey);
        scope.Complete();
    }

    public void RemoveAllDrafts(Guid userKey)
    {
        using var scope = _scopeProvider.CreateScope();
        scope.Database.Execute(
            $"DELETE FROM {Draft.TableName} WHERE userKey = @0",
            userKey);
        scope.Complete();
    }

    public void RemoveDraftsByNodeKey(Guid nodeKey)
    {
        using var scope = _scopeProvider.CreateScope();
        scope.Database.Execute(
            $"DELETE FROM {Draft.TableName} WHERE nodeKey = @0",
            nodeKey);
        scope.Complete();
    }
}
