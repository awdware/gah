import { GahModuleBase } from './gah-module-base';
import {
  GahHost, PackageJson, GahModuleData, GahEvent, StylesFileGeneratedEvent,
  GahFolderCleanedEvent, TsConfigCleanedEvent, SymlinksCreatedEvent, TsConfigAdjustedEvent,
  TemplateGeneratedEvent, AssetsBaseStylesCopiedEvent, DependenciesMergedEvent, GitignoreAdjustedEvent,
  AngularJsonAdjustedEvent, StyleImportsGeneratedEvent, PackagesInstalledEvent
} from '@awdware/gah-shared';
import { GahModuleDef } from './gah-module-def';
import { GahFolder } from './gah-folder';
import readline from 'readline';

export class GahHostDef extends GahModuleBase {
  private readonly _ngOptions: { aot: boolean } = {} as any;

  constructor(gahCfgPath: string, initializedModules: GahModuleBase[]) {
    super(gahCfgPath, null);
    this.isHost = true;

    const gahCfgFolder = this.fileSystemService.ensureAbsolutePath(this.fileSystemService.getDirectoryPathFromFilePath(gahCfgPath));
    this.basePath = this.fileSystemService.join(gahCfgFolder, '.gah');
    this.srcBasePath = './src';
    this.initTsConfigObject();

    const hostCfg = this.fileSystemService.parseFile<GahHost>(gahCfgPath);
    if (!hostCfg) {
      throw new Error('Cannot find host in file "' + gahCfgPath + '"');
    }
    hostCfg.modules?.forEach(moduleDependency => {
      moduleDependency.names.forEach(depModuleName => {
        const alreadyInitialized = initializedModules.find(x => x.moduleName === depModuleName);
        if (alreadyInitialized) {
          this.dependencies.push(alreadyInitialized);
        } else {
          this.dependencies.push(new GahModuleDef(moduleDependency.path, depModuleName, initializedModules));
        }
      });
    });
    this._ngOptions.aot = hostCfg.aot ?? true; // If not set the default value is true
    this.gahFolder = new GahFolder(this.basePath, this.srcBasePath + '/app');
  }

  public specificData(): Partial<GahModuleData> {
    return {
      ngOptions: this._ngOptions
    };
  }

  public async install() {
    if (this.installed) {
      return;
    }
    this.installed = true;

    this.tsConfigFile.clean();
    this.pluginService.triggerEvent(GahEvent.TS_CONFIG_CLEANED, { module: this.data() } as TsConfigCleanedEvent);
    this.gahFolder.cleanGeneratedDirectory();
    this.gahFolder.cleanDependencyDirectory();
    this.gahFolder.cleanStylesDirectory();
    this.pluginService.triggerEvent(GahEvent.GAH_FOLDER_CLEANED, { module: this.data() } as GahFolderCleanedEvent);

    this.fileSystemService.deleteFilesInDirectory(this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets'));
    this.fileSystemService.ensureDirectory(this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets'));
    this.fileSystemService.deleteFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'));
    this.fileSystemService.saveFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'),
      ''
      + '/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n'
      + '  *   Please do not edit this file. Any changes to this file will be overwriten by gah.   *\n'
      + '  *              Check the documentation for how to edit your global styles:              *\n'
      + '  *                          https://github.com/awdware/gah/wiki                          *\n'
      + '  * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */\n');
    this.pluginService.triggerEvent(GahEvent.STYLES_FILE_GENERATED, { module: this.data() } as StylesFileGeneratedEvent);

    await this.createSymlinksToDependencies();
    this.pluginService.triggerEvent(GahEvent.SYMLINKS_CREATED, { module: this.data() } as SymlinksCreatedEvent);

    this.addDependenciesToTsConfigFile();
    this.pluginService.triggerEvent(GahEvent.TS_CONFIG_ADJUSTED, { module: this.data() } as TsConfigAdjustedEvent);
    this.generateFromTemplate();
    this.pluginService.triggerEvent(GahEvent.TEMPLATE_GENERATED, { module: this.data() } as TemplateGeneratedEvent);
    this.copyAssetsAndBaseStyles();
    this.pluginService.triggerEvent(GahEvent.ASSETS_BASE_STYLES_COPIED, { module: this.data() } as AssetsBaseStylesCopiedEvent);
    this.mergePackageDependencies();
    this.pluginService.triggerEvent(GahEvent.DEPENDENCIES_MERGED, { module: this.data() } as DependenciesMergedEvent);
    this.generateStyleImports();
    this.pluginService.triggerEvent(GahEvent.STYLE_IMPORTS_GENERATED, { module: this.data() } as StyleImportsGeneratedEvent);
    this.adjustGitignore();
    this.adjustGitignoreForHost();
    this.pluginService.triggerEvent(GahEvent.GITIGNORE_ADJUSTED, { module: this.data() } as GitignoreAdjustedEvent);
    this.adjustAngularJsonConfig();
    this.pluginService.triggerEvent(GahEvent.ANGULAR_JSON_ADJUSTED, { module: this.data() } as AngularJsonAdjustedEvent);
    await this.installPackages();
    this.pluginService.triggerEvent(GahEvent.PACKAGES_INSTALLED, { module: this.data() } as PackagesInstalledEvent);
  }

  adjustGitignoreForHost() {
    this.workspaceService.ensureGitIgnoreLine('src/assets/**', 'Ignoring gah generated assets', this.basePath);
  }

  private generateFromTemplate() {
    for (const dep of this.allRecursiveDependencies) {
      this.gahFolder.addGeneratedFileTemplateData(dep.moduleName!, dep.packageName!, dep.isEntry, dep.baseNgModuleName);
    }
    this.gahFolder.generateFileFromTemplate();
  }

  private async installPackages() {
    this.loggerService.log('Installing yarn packages');
    let state = 0;
    let stateString = 'Installing yarn packages';
    const success = await this.executionService.execute('yarn', true, (test) => {

      // This is just for super fancy logging:

      if (test.indexOf('Done in') !== -1) {
        state = 4;
        stateString = 'Done.';
      } else if (test.indexOf('[4/4]') !== -1) {
        state = 4;
        stateString = 'Building fresh packages';
      } else if (test.indexOf('[3/4]') !== -1) {
        state = 3;
        stateString = 'Linking dependencies';
      } else if (test.indexOf('[2/4]') !== -1) {
        state = 2;
        stateString = 'Fetching packages';
      } else if (test.indexOf('[1/4]') !== -1) {
        state = 1;
        stateString = 'Resolving packages';
      }

      this.loggerService.interruptLoading(() => {
        readline.cursorTo(process.stdout, 0, process.stdout.rows - 2);
        readline.clearLine(process.stdout, 0);
      });
      this.loggerService.log(`${this.loggerService.getProgressBarString(4, state)} [${state}/4] ${stateString}`);
      return '';

      // Super fancy logging end.
    }, '.gah');

    this.loggerService.interruptLoading(() => {
      readline.cursorTo(process.stdout, 0, process.stdout.rows - 2);
      readline.clearLine(process.stdout, 0);
    });

    if (success) {
      this.loggerService.success('Packages installed successfully');
    } else {
      this.loggerService.error('Installing packages failed');
      this.loggerService.error(this.executionService.executionErrorResult);
    }
  }

  private copyAssetsAndBaseStyles() {
    const stylesScss = this.fileSystemService.readFileLineByLine(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'));

    for (const dep of this.allRecursiveDependencies) {
      if (!dep.facadePathRelativeToBasePath) {
        continue;
      }
      // Copying assets
      const absoluteFacadePathOfDep = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath);
      const absoluteAssetsFolderOfDep = this.fileSystemService.join(absoluteFacadePathOfDep, 'assets');
      if (this.fileSystemService.directoryExists(absoluteAssetsFolderOfDep)) {
        const hostAssetsFolder = this.fileSystemService.join(this.basePath, this.srcBasePath, 'assets', dep.moduleName!);
        this.fileSystemService.copyFilesInDirectory(absoluteAssetsFolderOfDep, hostAssetsFolder);
        // Symlinks are not copied to dist folder (bug ?)
        // this.fileSystemService.createDirLink(hostAssetsFolder, absoluteAssetsFolderOfDep);
        // Possible fix: Include symlinked folder directly in assets config in angular json
      }

      const absoluteStylesFilePathOfDep = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath, 'styles.scss');

      // Copying base styles if they exist
      if (this.fileSystemService.fileExists(absoluteStylesFilePathOfDep)) {

        const depAbsoluteSrcFolder = this.fileSystemService.join(dep.basePath, dep.srcBasePath);
        const depAbsoluteFacadeFolder = this.fileSystemService.join(dep.basePath, dep.facadePathRelativeToBasePath);

        const depFacadeFolderRelativeToSrcBase = this.fileSystemService.ensureRelativePath(depAbsoluteFacadeFolder, depAbsoluteSrcFolder, true);
        const dependencyPathRelativeFromSrcBase = this.fileSystemService.ensureRelativePath(this.gahFolder.dependencyPath, this.srcBasePath, true);

        const moduleFacadePath = this.fileSystemService.join(dependencyPathRelativeFromSrcBase, dep.moduleName!, depFacadeFolderRelativeToSrcBase, 'styles.scss');
        stylesScss.push(`@import "${moduleFacadePath}";`);
      }
    }

    this.fileSystemService.saveFile(this.fileSystemService.join(this.basePath, this.srcBasePath, 'styles.scss'), stylesScss.join('\n'));
  }

  private mergePackageDependencies() {
    const packageJsonPath = this.fileSystemService.join(this.basePath, 'package.json');
    // Get package.json from host
    const packageJson = this.fileSystemService.parseFile<PackageJson>(packageJsonPath);
    const hostDeps = packageJson.dependencies!;
    const hostDevDeps = packageJson.devDependencies!;

    const blocklistPackages = new Array<string>();

    for (const dep of this.allRecursiveDependencies) {
      blocklistPackages.push('@' + dep.packageName + '/' + dep.moduleName!);
    }

    for (const dep of this.allRecursiveDependencies) {
      // Get package.json from module to installed into host
      const externalPackageJson = this.fileSystemService.parseFile<PackageJson>(this.fileSystemService.join(dep.basePath, 'package.json'));

      // Getting (dev-)dependency objects from host and module
      const externalDeps = externalPackageJson.dependencies!;
      const externalDevDeps = externalPackageJson.devDependencies!;

      const deps = Object.keys(externalDeps).filter(x => blocklistPackages.indexOf(x) === - 1);
      const devDeps = Object.keys(externalDevDeps);

      // Merging module (dev-)dependencies into host
      deps.forEach((d) => {
        if (!hostDeps[d] || dep.isEntry) {
          hostDeps[d] = externalDeps[d];
        }
      });
      devDeps.forEach((d) => {
        if (!hostDevDeps[d] || dep.isEntry) {
          hostDevDeps[d] = externalDevDeps[d];
        }
      });

    }

    this.pluginService.pluginNames.forEach(x => {
      hostDevDeps[x.name] = x.version;
    });

    // Saving the file back into the host package.json
    this.fileSystemService.saveObjectToFile(packageJsonPath, packageJson);
  }

  private adjustAngularJsonConfig() {
    const ngJsonPath = this.fileSystemService.join(this.basePath, 'angular.json');
    const ngJson = this.fileSystemService.parseFile<any>(ngJsonPath);
    if (!this._ngOptions.aot) {
      ngJson.projects['gah-host'].architect.build.options.aot = false;

      const configs = ngJson.projects['gah-host'].architect.build.configurations;
      const keys = Object.keys(configs);
      keys.forEach(key => {
        // buildOptimizer is only available when using aot. We have to disable it for all configurations
        if (configs[key].buildOptimizer !== undefined) {
          configs[key].buildOptimizer = false;
        }
      });

      ngJson.projects['gah-host'].architect.build.configurations.aot = false;
    }
    this.fileSystemService.saveObjectToFile(ngJsonPath, ngJson, true);
  }

}
