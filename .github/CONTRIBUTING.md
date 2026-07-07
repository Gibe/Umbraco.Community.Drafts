# Contributing Guidelines

Contributions to this package are most welcome! 

There is a test site in the solution to make working with this repository easier.
It is configured to do an unattended install, check `appsettings.json` for the login details.

Before starting work on a contribution, please create an issue [here](https://github.com/Gibe/Umbraco.Community.Drafts/issues) (if one doesn't already exist). This helps avoid duplicated effort, makes sure your contribution is aligned with the project's goals, and gives you a chance to get feedback on your approach before you start coding.

To avoid accidental breaking changes, please do not:
- Upgrade any NuGet dependencies
- Modify license information

Once an idea or change has been discussed and agreed, to get this change included in a future version of the project, please:
1. Fork the repository: create your own fork of the repository so you can work independently without affecting the main codebase.
2. Create a new branch: create a new branch in your fork for your changes. This keeps your work organized and makes it easier to submit a pull request later.
3. Make your changes: implement your changes in the new branch. Be sure to follow any coding standards or guidelines used in the project.
4. Test your changes: thoroughly test your changes to ensure they work as expected and do not introduce any new issues.
5. Commit your changes: commit your changes to your branch with clear and descriptive commit messages that explain what you have done.
6. Push your changes: push your branch to your fork on GitHub.
7. Submit a pull request: go to the original repository and submit a pull request from your branch. Provide a clear description of the changes you have made and why they should be merged into the main codebase.

## Branching information

Currently, this package only supports Umbraco version 17. However, in the future we intend to support multiple versions of Umbraco. When that happens, we will use the following branching strategy:
- `main` branch: This branch will contain the latest stable release of the package, which will be compatible with the latest version of Umbraco.
- `v{version}/main` branches: For each supported version of Umbraco, there will be a corresponding branch (e.g., `v17/main`, `v18/main`, etc.) that contains the latest stable release of the package for that specific version of Umbraco. Bug fixes and minor updates for that version will be made in this branch.
- `v{version}/develop` branches: For each supported version of Umbraco, there will also be a corresponding `develop` branch (e.g., `v17/develop`, `v18/develop`, etc.) where active development for that version takes place. New features and major changes for that version will be made in this branch before being merged into the corresponding `main` branch.

Each version of this package corresponds to the version of Umbraco it supports - e.g. version 17.x of this package supports Umbraco 17, version 18.x supports Umbraco 18, and so on. This means that when a new major version of Umbraco is released, we will create a new branch for that version and start development there, while still maintaining the existing branches for previous versions.