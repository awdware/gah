import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { GahEnvironment } from '@awdware/gah-shared';
import { init } from './init.app';

if (environment.production) {
  enableProdMode();
}

fetch('environment.json')
  .then(res => res.json())
  .then((env: GahEnvironment) => {

    if (!environment.production) {
      console.log(env);
    }

    init(env);

    platformBrowserDynamic().bootstrapModule(AppModule)
      .catch(err => console.error(err));

  })
  .catch(err => {
    console.error('environment.json not found or not readable\nTrace:');
    console.error(err);
  });