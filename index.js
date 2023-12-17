import serializePropTypes from '@drupal-jsx/serialize-prop-types';
import { kebabCasePreserveDoubleDash } from '@drupal-jsx/drupal-utils';
import { componentFileNameFromTwigTemplateName, invalidateThemeRegistry } from '@drupal-jsx/drupal-utils-dev';
import { Glob } from 'bun';
import path from 'node:path';

const reDrupalComponent = new RegExp('/components/(Drupal[\\w\\-]+)\\.jsx$');

export default function drupal({ drupalTemplatesDir, drushPath, sqlitePath }) {

  let numComponentCreationsInProgress = 0;

  async function writeComponentFile(dest, src) {
    numComponentCreationsInProgress++;

    const tagName = kebabCasePreserveDoubleDash(path.basename(dest, '.jsx'));
    const drupalTemplateName = tagName.substring(7);
    const drupalTemplateFileName = `${drupalTemplatesDir}/${drupalTemplateName}.template-info.json`;

    const modulePaths = {};
    modulePaths[tagName] = process.cwd() + `/src/components/${src}`;
    const propTypes = await serializePropTypes(modulePaths);
    const contents = JSON.stringify({ props: propTypes[tagName] });

    console.log("Generating " + drupalTemplateFileName);
    await Bun.write(drupalTemplateFileName, contents);
    await onPropTypeFileChanged(drupalTemplateFileName);

    // Vite sends a page reload event when a new file is added to
    // src/components.
    const file = Bun.file(`src/components/${src}`);
    await Bun.write(`src/components/${dest}`, file);

    // Vite could be delayed a bit before calling handleHotUpdate() for the
    // template-info.json file we just wrote, so add a small delay before
    // decrementing numComponentCreationsInProgress.
    await Bun.sleep(100);
    numComponentCreationsInProgress--;
  }

  async function onPropTypeFileChanged(file) {
    const glob = new Glob('*.info.yml');
    for await (const infoFile of glob.scan('.')) {
      const themeName = path.basename(infoFile, '.info.yml');
      await invalidateThemeRegistry(themeName, { sqlitePath, drushPath });
    }
  }

  return {
    name: 'vite:drupal',

    configureServer(server) {
      server.ws.on('drupal-jsx:override-twig-template', (data, client) => {
        const componentName = componentFileNameFromTwigTemplateName(data.template);
        writeComponentFile(componentName, '_DrupalComponentTemplate.jsx');
      })
      server.ws.on('drupal-jsx:create-component-variant', (data, client) => {
        // @todo Validate data.base and data.variant before performing file
        //   operations on them.
        writeComponentFile(data.variant, data.base);
      })
    },

    async handleHotUpdate({ file, server, read }) {
      // console.log('handleHotUpdate', file, numComponentCreationsInProgress);

      // When the propTypes of a Drupal*.jsx component changes, re-export the
      // new *.template-info.json file.
      const found = file.match(reDrupalComponent);
      if (found) {
        const tagName = kebabCasePreserveDoubleDash(found[1]);

        // Get the old contents of the corresponding template-info.json file.
        const drupalTemplateName = tagName.substring(7);
        const drupalTemplateFileName = `${drupalTemplatesDir}/${drupalTemplateName}.template-info.json`;
        const f = Bun.file(drupalTemplateFileName);
        const oldContents = await f.exists() ? await f.text() : '';

        // Generate the new contents for the corresponding template-info.json
        // file. Await the read() function before calling serializePropTypes()
        // to make sure serializePropTypes() isn't reading from an incompletely
        // written file.
        await read();
        const modulePaths = {};
        modulePaths[tagName] = file;
        const propTypes = await serializePropTypes(modulePaths);
        const newContents = JSON.stringify({ props: propTypes[tagName] });

        if (newContents != oldContents) {
          console.log("Updating " + drupalTemplateFileName);
          // Don't need to await this, because when it's done, handleHotUpdate()
          // will get called for drupalTemplateFileName.
          Bun.write(drupalTemplateFileName, newContents);
        }
      }

      // When a *.template-info.json file changes, clear the Drupal caches that
      // depend on it and reload the page. Skip this if component creations are
      // in progress so that writeComponentFile() can control the timing.
      if (file.endsWith('.template-info.json') && numComponentCreationsInProgress === 0) {
        await read();
        await onPropTypeFileChanged();
        server.ws.send({
          type: "full-reload",
        });
      }
    }

  }
}
