using Asp.Versioning;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
using Swashbuckle.AspNetCore.SwaggerGen;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Api.Common.OpenApi;
using Microsoft.OpenApi;
using Drafts.Repositories;
using Drafts.NotificationHandlers;
using Umbraco.Cms.Core.Notifications;

namespace Drafts.Composers
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

            builder.Services.AddSingleton<IOperationIdHandler, CustomOperationHandler>();

            builder.Services.Configure<SwaggerGenOptions>(opt =>
            {
                opt.SwaggerDoc(Constants.ApiName, new OpenApiInfo
                {
                    Title = "Drafts Backoffice API",
                    Version = "1.0",
                });

                opt.OperationFilter<DraftsOperationSecurityFilter>();
            });
        }

        public class DraftsOperationSecurityFilter : BackOfficeSecurityRequirementsOperationFilterBase
        {
            protected override string ApiName => Constants.ApiName;
        }

        public class CustomOperationHandler : OperationIdHandler
        {
            public CustomOperationHandler(IOptions<ApiVersioningOptions> apiVersioningOptions) : base(apiVersioningOptions)
            {
            }

            protected override bool CanHandle(ApiDescription apiDescription, ControllerActionDescriptor controllerActionDescriptor)
            {
                return controllerActionDescriptor.ControllerTypeInfo.Namespace?.StartsWith("Drafts.Controllers", comparisonType:
                    StringComparison.InvariantCultureIgnoreCase) is true;
            }

            public override string Handle(ApiDescription apiDescription) =>
                $"{apiDescription.ActionDescriptor.RouteValues["action"]}";
        }
    }
}
