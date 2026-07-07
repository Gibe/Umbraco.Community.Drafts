# Umbraco.Community.Drafts

## Build instructions

### Requirements
* Node LTS Version 20.17.0+
* Use a tool such as NVM (Node Version Manager) for your OS to help manage multiple versions of Node

### Steps
* Open a terminal inside the `\Client` folder
* Run `npm install` to install all the dependencies
* Run `npm run build` to build the project
* The build output is copied to `wwwroot\App_Plugins\Drafts\drafts.js`

### File Watching
* Add this Razor Class Library Project as a project reference to an Umbraco Website project
* From the `\Client` folder run the command `npm run watch` this will monitor the changes to the *.ts files and rebuild the project
* With the Umbraco website project running the Razor Class Library Project will refresh the browser when the build is complete

### Suggestion
* Use VSCode as the editor of choice as it has good tooling support for TypeScript and it will recommend a VSCode Extension for good Lit WebComponent completions

### Other Resources
* Umbraco Docs - https://docs.umbraco.com/umbraco-cms/customizing/overview
