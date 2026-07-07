using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Community.Drafts.Migrations;
using Umbraco.Community.Drafts.NotificationHandlers;
using Umbraco.Community.Drafts.Repositories;
using Umbraco.Extensions;

namespace Umbraco.Community.Drafts.Composers
{
    public class DraftsApiComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.Services.AddScoped<IDraftsRepository, DraftsRepository>();
            builder.PackageMigrationPlans().Add<DraftsMigrationPlan>();

            builder.AddNotificationHandler<ContentMovedToRecycleBinNotification,
                ContentMovedToRecycleBinNotificationHandler>();

            builder.AddNotificationHandler<ContentSavedNotification,
                ContentSavedNotificationHandler>();
        }
    }
}
