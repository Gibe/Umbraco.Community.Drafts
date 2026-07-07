using Asp.Versioning;
using Umbraco.Community.Drafts.Models;
using Umbraco.Community.Drafts.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Drafts.Controllers;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "Drafts")]
public class DraftsApiController : DraftsApiControllerBase
{
    private readonly IDraftsRepository _draftsRepository;
    private readonly IBackOfficeSecurityAccessor _backOfficeSecurityAccessor;
    private readonly IContentService _contentService;
    private readonly IIdKeyMap _idKeyMap;

    public DraftsApiController(
        IDraftsRepository draftsRepository,
        IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
        IContentService contentService,
        IIdKeyMap idKeyMap)
    {
        _draftsRepository = draftsRepository;
        _backOfficeSecurityAccessor = backOfficeSecurityAccessor;
        _contentService = contentService;
        _idKeyMap = idKeyMap;
    }

    private IContent? GetContentByKey(Guid key)
    {
        var idAttempt = _idKeyMap.GetIdForKey(key, UmbracoObjectTypes.Document);
        return idAttempt.Success ? _contentService.GetById(idAttempt.Result) : null;
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
                var content = GetContentByKey(d.NodeKey);
                return content != null
                    ? new DraftResponse
                    {
                        NodeKey = d.NodeKey,
                        NodeName = content.Name ?? "Untitled",
                        SavedAt = d.SavedAt
                    }
                    : null;
            })
            .OfType<DraftResponse>()
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

        var content = GetContentByKey(draft.NodeKey);

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
