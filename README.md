# Umbraco.Community.Drafts

Auto-save your work as you go, just like Gmail. Never lose your edits again.

## Features

- **Auto-save as you work** — drafts are saved automatically every 10 seconds while you edit a document in the backoffice, no action needed
- **Drafts sidebar tree** — a sidebar panel in the Content section shows all your saved drafts with one-click navigation
- **Draft count badge** — see at a glance how many drafts you have in the sidebar header
- **Discard drafts** — remove any draft from the sidebar when you no longer need it
- **Per-user storage** — each user has their own drafts, stored in a custom database table
- **Auto-cleanup** — drafts are automatically removed when content is moved to the recycle bin

## Requirements

- Umbraco CMS v17+
- .NET 10+

## Installation

Add the package to an existing Umbraco website from NuGet:

```
dotnet add package Umbraco.Community.Drafts
```

No further configuration is required. The package registers itself via an
Umbraco composer and runs its database migrations automatically on startup.

## How it works

Once installed, you'll see a **Drafts** header appear in the Content tree sidebar
above the regular content nodes (similar to the Favourites package). The number of
active drafts is shown in brackets.

When you open any document in the backoffice and start editing, the package
automatically saves a draft of your current work every 10 seconds. You'll see a
subtle "Draft saved" indicator in the workspace toolbar.

If you navigate away or your browser crashes, your work is preserved. Simply click
the draft entry in the sidebar to navigate back to the document.

You can discard a draft at any time by clicking the delete button next to it in
the sidebar.

## Development

### Prerequisites

- Node.js LTS v20.17.0+
- .NET 10 SDK

### Building the client

```bash
cd src/Umbraco.Community.Drafts/Client
npm install
npm run build
```

The build output is written to `wwwroot/App_Plugins/Drafts/drafts.js`.

### File watching

```bash
cd src/Umbraco.Community.Drafts/Client
npm run watch
```

## License

MIT
