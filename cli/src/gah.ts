import { DIContainer } from './di-container';

import { ContextService } from './services/context-service';
import { InstallController } from './controller/install.controller';
import { RunController } from './controller/run.controller';

DIContainer.resolve<ContextService>('contextService').setContext({ calledFromCli: false });

export const gah = {
  /**
   * Installs the module(s) or host in the current directory. Use this in your build pipeline before building for example with the angular cli.
   */
  install: (skipPackageInstall: boolean = false, configName?: string) =>
    DIContainer.resolve<InstallController>('installController').install(skipPackageInstall, configName),
  /**
   * Runs a command through gah (works with everything that can be executed by 'yarn run').
   */
  run: (command: string, configurationName?: string) =>
    DIContainer.resolve<RunController>('runController').exec(command.split(/\s+/), configurationName)
};
