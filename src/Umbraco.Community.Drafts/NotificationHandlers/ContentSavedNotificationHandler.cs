using Umbraco.Community.Drafts.Repositories;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace Umbraco.Community.Drafts.NotificationHandlers;

public class ContentSavedNotificationHandler
    : INotificationHandler<ContentSavedNotification>
{
    private readonly IDraftsRepository _draftsRepository;

    public ContentSavedNotificationHandler(IDraftsRepository draftsRepository)
    {
        _draftsRepository = draftsRepository;
    }

    public void Handle(ContentSavedNotification notification)
    {
        foreach (var item in notification.SavedEntities)
        {
            _draftsRepository.RemoveDraftsByNodeKey(item.Key);
        }
    }
}
