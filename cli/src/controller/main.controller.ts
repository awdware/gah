import { injectable, inject } from 'inversify';
import chalk from 'chalk';
import figlet from 'figlet';
import { program } from 'commander';

import { InitController } from './init.controller';
import { DependencyController } from './dependency.controller';
import { InstallController } from './install.controller';
import { PluginController } from './plugin.controller';
import { Controller } from './controller';
import { HostModuleController } from './host-module.controller';

@injectable()
export class MainController extends Controller {
  @inject(InitController)
  private _initController: InitController;
  @inject(DependencyController)
  private _dependencyController: DependencyController;
  @inject(HostModuleController)
  private _hostModuleController: HostModuleController;
  @inject(InstallController)
  private _installController: InstallController;
  @inject(PluginController)
  private _pluginController: PluginController;


  public async main() {

    // TODO add flag or config or somehting
    this._loggerService.enableDebugLogging();

    await this._pluginService.loadInstalledPlugins();

    var pjson = require(this._fileSystemService.join(__dirname, '../../package.json'));
    const version = pjson.version;

    // This is so highly useless, I love it.
    const fontWidth = process.stdout.columns > 111 ? 'full' : process.stdout.columns > 96 ? 'fitted' : 'controlled smushing';

    program.on('--help', () => {
      console.log(
        chalk.yellow(
          figlet.textSync('gah-cli v' + version, { horizontalLayout: fontWidth, font: 'Cricket', verticalLayout: 'full' })
        )
      );
    });
    console.log();

    program
      .version(version);

    program
      .command('init')
      .description('Initiates a new  module (or host).')
      .option('-h, --host', 'Initiates a host instead of a module')
      .option('-e, --entry', 'Initiates a module as the entry module')
      .option('--moduleName <name>', 'The name for the new module')
      .option('--facadeFolderPath <path>', 'The relative path to the facade files')
      .option('--publicApiPath <path>', 'The relative path public api file (public-api.ts / index.ts / etc.)')
      .option('--baseModuleName <name>', 'The name of the base NgModule of the new module')
      .action((cmdObj) => this._initController.init(cmdObj.host, cmdObj.entry, cmdObj.moduleName, cmdObj.facadeFolderPath, cmdObj.publicApiPath, cmdObj.baseModuleName));

    const cmdDependency = program
      .command('dependency <add|remove> [options]');
    cmdDependency
      .command('add [moduleName] [dependencyConfigPath] [dependencyModuleNames...]')
      .description('Adds new dependencies to a specified module.')
      .action(async (moduleName, dependencyConfigPath, dependencyModuleNames) => await this._dependencyController.add(moduleName, dependencyConfigPath, dependencyModuleNames));
    cmdDependency
      .command('remove [moduleName]')
      .description('Removes dependencies from a specified module.')
      .action(async (moduleName) => await this._dependencyController.remove(moduleName));

    const cmdHostModule = program
      .command('module <add|remove> [options]')
      .description('Manages modules for the host');
    cmdHostModule
      .command('add [dependencyConfigPath] [dependencyModuleNames...]')
      .description('Adds a new module to the host.')
      .action(async (dependencyConfigPath, dependencyModuleNames) => await this._hostModuleController.add(dependencyConfigPath, dependencyModuleNames));
    cmdHostModule
      .command('remove [moduleName]')
      .description('Removes modules from the host.')
      .action(async (moduleName) => await this._hostModuleController.remove(moduleName));

    const cmdPlugin = program
      .command('plugin <add|remove|update> [options]');
    cmdPlugin
      .command('add [pluginName]')
      .description('Adds and installs a new plugin.')
      .action(async (pluginName) => await this._pluginController.add(pluginName));
    cmdPlugin
      .command('remove [pluginName]')
      .description('Removes and uninstalls a plugin.')
      .action(async (pluginName) => await this._pluginController.remove(pluginName));
    cmdPlugin
      .command('update [pluginName]')
      .description('Updates plugin to its newest version.')
      .action(async (pluginName) => await this._pluginController.update(pluginName));

    program
      .command('install')
      .description('Installs all dependencies.')
      .alias('i')
      .action(async () => await this._installController.install());

    program.parse(process.argv);
  }


}