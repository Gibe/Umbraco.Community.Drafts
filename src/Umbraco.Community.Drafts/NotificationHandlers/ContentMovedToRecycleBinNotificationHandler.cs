using Umbraco.Community.Drafts.Repositories;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace Umbraco.Community.Drafts.NotificationHandlers;

public class ContentMovedToRecycleBinNotificationHandler
    : INotificationHandler<ContentMovedToRecycleBinNotification>
{
    private readonly IDraftsRepository _draftsRepository;

    public ContentMovedToRecycleBinNotificationHandler(IDraftsRepository draftsRepository)
    {
        _draftsRepository = draftsRepository;
    }

    public void Handle(ContentMovedToRecycleBinNotification notification)
    {
        foreach (var item in notification.MoveInfoCollection)
        {
            _draftsRepository.RemoveDraftsByNodeKey(item.Entity.Key);
        }
    }
}
