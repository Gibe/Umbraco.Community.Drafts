using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.Drafts.NotificationHandlers;
using Umbraco.Community.Drafts.Repositories;

namespace Umbraco.Community.Drafts.Composers
{
    public class DraftsApiComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.Services.AddScoped<IDraftsRepository, DraftsRepository>();

            builder.AddNotificationHandler<ContentMovedToRecycleBinNotification,
                ContentMovedToRecycleBinNotificationHandler>();

            builder.AddNotificationHandler<ContentSavedNotification,
                ContentSavedNotificationHandler>();
        }
    }
}
