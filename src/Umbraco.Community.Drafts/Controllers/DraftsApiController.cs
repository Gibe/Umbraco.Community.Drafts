using Asp.Versioning;
using Drafts.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;

namespace Drafts.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Drafts")]
public class DraftsApiController : DraftsApiControllerBase
{
    private readonly IDraftsRepository _draftsRepository;
    private readonly IBackOfficeSecurityAccessor _backOfficeSecurityAccessor;
    private readonly IContentService _contentService;

    public DraftsApiController(
        IDraftsRepository draftsRepository,
        IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
        IContentService contentService)
    {
        _draftsRepository = draftsRepository;
        _backOfficeSecurityAccessor = backOfficeSecurityAccessor;
        _contentService = contentService;
    }

    private Guid GetCurrentUserKey()
    {
        var user = _backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser;
        return user?.Key ?? throw new UnauthorizedAccessException("User not authenticated");
    }

    [HttpGet("drafts")]
    [ProducesResponseType<IEnumerable<DraftResponse>>(StatusCodes.Status200OK)]
    public IActionResult GetDrafts()
    {
        var userKey = GetCurrentUserKey();
        var drafts = _draftsRepository.GetDrafts(userKey);

        var results = drafts
            .Select(d =>
            {
                var content = _contentService.GetById(d.NodeKey);
                return content != null
                    ? new DraftResponse
                    {
                        NodeKey = d.NodeKey,
                        NodeName = content.Name ?? "Untitled",
                        SavedAt = d.SavedAt
                    }
                    : null;
            })
            .Where(d => d != null)
            .ToList();

        return Ok(results);
    }

    [HttpGet("drafts/{nodeKey:guid}")]
    [ProducesResponseType<DraftDetailResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult GetDraft(Guid nodeKey)
    {
        var userKey = GetCurrentUserKey();
        var draft = _draftsRepository.GetDraft(userKey, nodeKey);

        if (draft == null)
            return NotFound();

        var content = _contentService.GetById(draft.NodeKey);

        return Ok(new DraftDetailResponse
        {
            NodeKey = draft.NodeKey,
            NodeName = content?.Name ?? "Untitled",
            ContentData = draft.ContentData,
            SavedAt = draft.SavedAt
        });
    }

    [HttpPost("drafts")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult SaveDraft([FromBody] SaveDraftRequest request)
    {
        var userKey = GetCurrentUserKey();
        _draftsRepository.SaveDraft(userKey, request.NodeKey, request.ContentData);
        return Ok();
    }

    [HttpDelete("drafts/{nodeKey:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult RemoveDraft(Guid nodeKey)
    {
        var userKey = GetCurrentUserKey();
        _draftsRepository.RemoveDraft(userKey, nodeKey);
        return Ok();
    }

    [HttpDelete("drafts")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult RemoveAllDrafts()
    {
        var userKey = GetCurrentUserKey();
        _draftsRepository.RemoveAllDrafts(userKey);
        return Ok();
    }
}

public class SaveDraftRequest
{
    public Guid NodeKey { get; set; }
    public string ContentData { get; set; } = string.Empty;
}

public class DraftResponse
{
    public Guid NodeKey { get; set; }
    public string NodeName { get; set; } = string.Empty;
    public DateTime SavedAt { get; set; }
}

public class DraftDetailResponse
{
    public Guid NodeKey { get; set; }
    public string NodeName { get; set; } = string.Empty;
    public string ContentData { get; set; } = string.Empty;
    public DateTime SavedAt { get; set; }
}
